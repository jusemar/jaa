import { erroApiSchema, type CodigoErroApi } from "@jaa/contratos";
import { cabecalhoSessao } from "@/features/autenticacao/lib/cliente-autenticacao";
import { URL_API } from "@/lib/configuracao";
import { enviarArquivoMultipart, enviarMultipart, type ArquivoLocal, type DependenciasEnvio, type FormularioArquivo } from "@/lib/envio-arquivo";

/**
 * Cliente HTTP do Mobile para a API do Jaa. Mesmíssima API do Web: o aplicativo é mais um cliente,
 * nunca um caminho paralelo — e nenhuma regra de autorização mora aqui.
 *
 * A sessão é a MESMA do Better Auth; no aparelho ela vem do armazenamento seguro (plugin do Expo) e
 * viaja no cabeçalho `Cookie`, porque o `fetch` nativo não tem o cookie jar do navegador.
 */

export type ResultadoApi<T> = { ok: true; dados: T } | { ok: false; status: number; codigo?: string; mensagem: string };

export async function requisitar<T>(caminho: string, opcoes: RequestInit = {}): Promise<ResultadoApi<T>> {
  try {
    const resposta = await fetch(`${URL_API}${caminho}`, {
      ...opcoes,
      credentials: "include",
      headers: { ...(opcoes.body ? { "content-type": "application/json" } : {}), ...(await cabecalhoSessao()), ...opcoes.headers },
    });
    const corpo: unknown = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      const erro = corpo as { codigo?: string; mensagem?: string } | null;
      return { ok: false, status: resposta.status, ...(erro?.codigo ? { codigo: erro.codigo } : {}), mensagem: erro?.mensagem ?? "Não foi possível falar com o Jaa." };
    }
    return { ok: true, dados: corpo as T };
  } catch {
    // Sem rede: quem chamou decide o que fazer (o rastreamento guarda a posição e tenta de novo).
    return { ok: false, status: 0, mensagem: "Sem conexão." };
  }
}

/*
 * MESMO contrato do `requisitarApi` da Web (`apps/web/src/lib/api.ts`): a resposta é validada pelo
 * schema de `@jaa/contratos` e o erro vem com `status` (0 = sem resposta) e `codigo`. É o que deixa as
 * camadas portadas da Web (conversas, cardápio, pedidos) iguais nos dois clientes — muda só o transporte
 * da sessão: lá é cookie do navegador, aqui o cabeçalho `Cookie` com a sessão guardada no aparelho.
 */
export type RespostaApi<T> =
  | { ok: true; status: number; dados: T }
  // status 0 = sem resposta do servidor (rede): a operação pode ou não ter sido concluída.
  | { ok: false; status: number; codigo: CodigoErroApi | null; mensagem: string };

const LIMITE_PADRAO_MS = 20_000;

export async function requisitarApi<T>(caminho: string, schema: { parse: (valor: unknown) => T }, init?: RequestInit): Promise<RespostaApi<T>> {
  // Limite de tempo: API inalcançável vira erro tratável, nunca uma tela presa.
  const limite = new AbortController();
  const temporizador = setTimeout(() => limite.abort(), LIMITE_PADRAO_MS);
  try {
    const resposta = await fetch(`${URL_API}${caminho}`, {
      ...init,
      signal: limite.signal,
      credentials: "omit",
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(await cabecalhoSessao()),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    const corpo: unknown = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      const erro = erroApiSchema.safeParse(corpo);
      return {
        ok: false,
        status: resposta.status,
        codigo: erro.success ? erro.data.codigo : null,
        mensagem: erro.success ? erro.data.mensagem : "Não foi possível concluir a operação.",
      };
    }

    return { ok: true, status: resposta.status, dados: schema.parse(corpo) };
  } catch {
    return { ok: false, status: 0, codigo: null, mensagem: "Sem conexão com o servidor." };
  } finally {
    clearTimeout(temporizador);
  }
}

/*
 * Transporte do MULTIPART: `XMLHttpRequest` do React Native, e não o `fetch` global.
 *
 * O `fetch` global do Expo (expo/fetch) monta o corpo em JavaScript e NÃO aceita o arquivo local no
 * formato `{ uri, name, type }` — falha com "Unsupported FormDataPart implementation" antes de sair
 * qualquer byte. O XHR do React Native entrega o FormData à camada nativa, que lê o arquivo pela `uri`
 * e escreve o boundary. Só o que `enviarMultipart` usa da resposta é devolvido (ok, status, json).
 */
const buscarMultipart = ((url: string, init: RequestInit = {}) =>
  new Promise<Response>((resolver, rejeitar) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method ?? "POST", url);
    // A sessão vai no cabeçalho `Cookie` (como nas demais chamadas, `credentials: "omit"`).
    xhr.withCredentials = false;
    for (const [nome, valor] of Object.entries((init.headers as Record<string, string> | undefined) ?? {})) xhr.setRequestHeader(nome, valor);
    const falhar = () => rejeitar(new TypeError("Network request failed"));
    xhr.onerror = falhar;
    xhr.ontimeout = falhar;
    xhr.onabort = falhar;
    xhr.onload = () => {
      const texto = xhr.responseText;
      resolver({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: async () => JSON.parse(texto) as unknown } as Response);
    };
    init.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(init.body as FormData);
  })) as typeof fetch;

const dependenciasEnvio = (cabecalhos: Record<string, string>): DependenciasEnvio => ({
  urlApi: URL_API,
  buscar: buscarMultipart,
  cabecalhos: async () => ({ ...(await cabecalhoSessao()), ...cabecalhos }),
  criarFormulario: () => new FormData() as unknown as FormularioArquivo,
});

/**
 * Envio de ARQUIVO (multipart) com a mesma sessão das outras chamadas. `cabecalhos` extras levam, por
 * exemplo, a identidade atuante. O `Content-Type` fica a cargo do runtime (boundary do multipart).
 */
export function enviarArquivo(caminho: string, arquivo: ArquivoLocal, cabecalhos: Record<string, string> = {}) {
  return enviarArquivoMultipart(dependenciasEnvio(cabecalhos), caminho, arquivo);
}

/** Multipart com campos de texto antes do arquivo (ex.: imagem na conversa), validado pelo schema. */
export function enviarMultipartApi<T>(
  caminho: string,
  schema: Parameters<typeof enviarMultipart<T>>[2],
  envio: Parameters<typeof enviarMultipart<T>>[3],
  cabecalhos: Record<string, string> = {},
) {
  return enviarMultipart(dependenciasEnvio(cabecalhos), caminho, schema, envio);
}
