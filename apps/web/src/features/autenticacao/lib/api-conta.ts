import {
  contaAtualSchema,
  identidadePessoalSchema,
  situacaoSenhaSchema,
  type ContaAtual,
  type CriarIdentidadePessoalEntrada,
  type IdentidadePessoal,
} from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

export function buscarContaAtual(): Promise<ResultadoApi<ContaAtual>> {
  return requisitarApi("/usuarios/eu", contaAtualSchema);
}

export function criarIdentidadePessoal(
  entrada: CriarIdentidadePessoalEntrada,
): Promise<ResultadoApi<IdentidadePessoal>> {
  return requisitarApi("/identidades/pessoal", identidadePessoalSchema, {
    method: "POST",
    body: JSON.stringify(entrada),
  });
}

export function definirSenhaInicial(senha: string) {
  return requisitarApi("/conta/senha", situacaoSenhaSchema, {
    method: "POST",
    body: JSON.stringify({ senha }),
  });
}

/**
 * Entrar com IDENTIFICADOR (celular ou @usuario) + SENHA. A rota do Jaa só descobre de qual conta o
 * identificador fala; quem autentica e cria a sessão é o Better Auth, do outro lado.
 */
export function entrarComSenha(
  identificador: string,
  senha: string,
): Promise<ResultadoApi<unknown>> {
  return requisitarApi(
    "/autenticacao/entrar",
    { parse: (valor) => valor },
    { method: "POST", body: JSON.stringify({ identificador, senha }) },
  );
}
