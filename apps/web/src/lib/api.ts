import { arquivoEnviadoSchema, erroApiSchema, type ArquivoEnviado, type CodigoErroApi } from "@jaa/contratos";
import { URL_API } from "@/lib/configuracao";

export type ResultadoApi<T> =
  | { ok: true; status: number; dados: T }
  // status 0 = sem resposta do servidor (rede): a operação pode ou não ter sido concluída.
  | { ok: false; status: number; codigo: CodigoErroApi | null; mensagem: string };

// Chamada à API do Jaa com o cookie de sessão; a resposta é validada pelo schema do contrato.
export async function requisitarApi<T>(
  caminho: string,
  schema: { parse: (valor: unknown) => T },
  init?: RequestInit,
): Promise<ResultadoApi<T>> {
  try {
    const resposta = await fetch(`${URL_API}${caminho}`, {
      ...init,
      credentials: "include",
      headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers as Record<string, string> | undefined) },
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
  }
}

/**
 * ENVIO MULTIPART (arquivo + campos de texto), com o mesmo tratamento de erro do `requisitarApi`.
 *
 * - Os campos vão NA ORDEM dada e o arquivo vai POR ÚLTIMO: a API lê o fluxo na ordem e só considera
 *   o que chega antes do arquivo (ver `ORDEM_CAMPOS_ENVIO_IMAGEM` em @jaa/contratos).
 * - O `Content-Type` NÃO é definido aqui: o navegador precisa escrevê-lo junto com o boundary.
 * - Sessão pelo cookie (`credentials: "include"`), como qualquer outra chamada; nenhuma credencial de
 *   armazenamento existe no navegador.
 */
export async function enviarMultipart<T>(
  caminho: string,
  schema: { parse: (valor: unknown) => T },
  envio: {
    campos?: readonly (readonly [nome: string, valor: string])[];
    arquivo: Blob;
    nomeArquivo?: string;
    campoArquivo?: string;
    headers?: Record<string, string>;
    mensagemFalha?: string;
  },
): Promise<ResultadoApi<T>> {
  const corpo = new FormData();
  for (const [nome, valor] of envio.campos ?? []) corpo.append(nome, valor);
  // Sempre a ÚLTIMA parte.
  if (envio.nomeArquivo) corpo.append(envio.campoArquivo ?? "arquivo", envio.arquivo, envio.nomeArquivo);
  else corpo.append(envio.campoArquivo ?? "arquivo", envio.arquivo);

  try {
    const resposta = await fetch(`${URL_API}${caminho}`, { method: "POST", credentials: "include", headers: envio.headers ?? {}, body: corpo });
    const dados: unknown = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      const erro = erroApiSchema.safeParse(dados);
      return {
        ok: false,
        status: resposta.status,
        codigo: erro.success ? erro.data.codigo : null,
        mensagem: erro.success ? erro.data.mensagem : (envio.mensagemFalha ?? "Não foi possível enviar o arquivo."),
      };
    }
    return { ok: true, status: resposta.status, dados: schema.parse(dados) };
  } catch {
    return { ok: false, status: 0, codigo: null, mensagem: "Sem conexão com o servidor." };
  }
}

/** Imagem pública (foto de perfil, logo, imagem de produto): um único campo `arquivo`. */
export function enviarArquivo(caminho: string, arquivo: File, headers: Record<string, string> = {}): Promise<ResultadoApi<ArquivoEnviado>> {
  return enviarMultipart(caminho, arquivoEnviadoSchema, { arquivo, headers, mensagemFalha: "Não foi possível enviar a imagem." });
}
