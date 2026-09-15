import type { Banco } from "@jaa/banco";
import { criarIdentidadePessoalEntradaSchema, type ErroApi } from "@jaa/contratos";
import type { FastifyInstance } from "fastify";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { exigirSessao, obterSessaoExigida } from "../../autenticacao/lib/exigir-sessao.js";
import { criarIdentidadePessoal } from "../casos-de-uso/criar-identidade-pessoal.js";
import { serializarIdentidadePessoal } from "../lib/serializar-identidade.js";

export function registrarRotasIdentidades(
  servidor: FastifyInstance,
  { banco, autenticacao }: { banco: Banco; autenticacao: Autenticacao },
) {
  servidor.post(
    "/identidades/pessoal",
    { preHandler: exigirSessao(autenticacao) },
    async (requisicao, resposta) => {
      const { user } = obterSessaoExigida(requisicao);
      const entrada = criarIdentidadePessoalEntradaSchema.safeParse(requisicao.body);

      if (!entrada.success) {
        const erro: ErroApi = {
          codigo: "DADOS_INVALIDOS",
          mensagem: entrada.error.issues[0]?.message ?? "Dados inválidos.",
        };
        return resposta.code(400).send(erro);
      }

      // O dono da identidade vem SEMPRE da sessão validada, nunca do corpo da requisição.
      const resultado = await criarIdentidadePessoal(banco, user.id, entrada.data);

      switch (resultado.tipo) {
        case "criada":
          return resposta.code(201).send(serializarIdentidadePessoal(resultado.identidade));
        case "ja-existente":
          return resposta.code(200).send(serializarIdentidadePessoal(resultado.identidade));
        case "nome-usuario-indisponivel": {
          const erro: ErroApi = {
            codigo: "NOME_USUARIO_INDISPONIVEL",
            mensagem: "Este @usuario não está disponível.",
          };
          return resposta.code(409).send(erro);
        }
        case "identidade-pessoal-ja-existe": {
          const erro: ErroApi = {
            codigo: "IDENTIDADE_PESSOAL_JA_EXISTE",
            mensagem: "Esta conta já possui uma identidade pessoal.",
          };
          return resposta.code(409).send(erro);
        }
      }
    },
  );
}
