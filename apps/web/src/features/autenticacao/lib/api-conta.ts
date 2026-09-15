import {
  contaAtualSchema,
  erroApiSchema,
  identidadePessoalSchema,
  type ContaAtual,
  type CriarIdentidadePessoalEntrada,
  type IdentidadePessoal,
} from "@jaa/contratos";
import { URL_API } from "@/lib/configuracao";

type Resultado<T> = { ok: true; dados: T } | { ok: false; status: number; mensagem: string };

async function requisitarApi<T>(
  caminho: string,
  schema: { parse: (valor: unknown) => T },
  init?: RequestInit,
): Promise<Resultado<T>> {
  try {
    const resposta = await fetch(`${URL_API}${caminho}`, {
      ...init,
      credentials: "include",
      headers: init?.body ? { "content-type": "application/json" } : undefined,
    });
    const corpo: unknown = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      const erro = erroApiSchema.safeParse(corpo);
      return {
        ok: false,
        status: resposta.status,
        mensagem: erro.success ? erro.data.mensagem : "Não foi possível concluir a operação.",
      };
    }

    return { ok: true, dados: schema.parse(corpo) };
  } catch {
    return { ok: false, status: 0, mensagem: "Sem conexão com o servidor." };
  }
}

export function buscarContaAtual(): Promise<Resultado<ContaAtual>> {
  return requisitarApi("/usuarios/eu", contaAtualSchema);
}

export function criarIdentidadePessoal(
  entrada: CriarIdentidadePessoalEntrada,
): Promise<Resultado<IdentidadePessoal>> {
  return requisitarApi("/identidades/pessoal", identidadePessoalSchema, {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export function testarRotaProtegida(): Promise<Resultado<{ autenticado: boolean }>> {
  return requisitarApi("/autenticacao/teste-protegido", {
    parse: (valor) => {
      const autenticado = typeof valor === "object" && valor !== null && "autenticado" in valor && valor.autenticado === true;
      return { autenticado };
    },
  });
}
