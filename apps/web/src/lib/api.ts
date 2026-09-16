import { erroApiSchema, type CodigoErroApi } from "@jaa/contratos";
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
