import type { Banco } from "@jaa/banco";
import {
  criarIdentidadePessoalEntradaSchema,
  type ErroApi,
  type IdentidadeOperavel,
  type ListaIdentidadesOperaveis,
} from "@jaa/contratos";
import type { FastifyInstance } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import {
  exigirIdentidadeAutenticada,
  obterIdentidadeExigida,
} from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import {
  exigirSessao,
  obterSessaoExigida,
} from "../../autenticacao/lib/exigir-sessao.js";
import { criarIdentidadePessoal } from "../casos-de-uso/criar-identidade-pessoal.js";
import {
  autorizarOperacaoIdentidade,
  listarIdentidadesOperaveis,
} from "../lib/autorizacao-identidades.js";
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
      const nomeUsuarioInformado = obterNomeUsuarioInformado(requisicao.body);
      const entrada = criarIdentidadePessoalEntradaSchema.safeParse(
        requisicao.body,
      );

      if (!entrada.success) {
        const erro: ErroApi = {
          codigo: "DADOS_INVALIDOS",
          mensagem:
            entrada.error.issues[0]?.message ===
              "Este @usuario não está disponível." && nomeUsuarioInformado
              ? `Este ${nomeUsuarioInformado} não está disponível.`
              : (entrada.error.issues[0]?.message ?? "Dados inválidos."),
        };
        return resposta.code(400).send(erro);
      }

      // O dono da identidade vem SEMPRE da sessão validada, nunca do corpo da requisição.
      const resultado = await criarIdentidadePessoal(
        banco,
        user.id,
        entrada.data,
      );

      switch (resultado.tipo) {
        case "criada":
          return resposta
            .code(201)
            .send(serializarIdentidadePessoal(resultado.identidade));
        case "ja-existente":
          return resposta
            .code(200)
            .send(serializarIdentidadePessoal(resultado.identidade));
        case "nome-usuario-indisponivel": {
          const erro: ErroApi = {
            codigo: "NOME_USUARIO_INDISPONIVEL",
            mensagem: `Este ${nomeUsuarioInformado ?? "@usuario"} não está disponível.`,
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

  const exigirIdentidade = exigirIdentidadeAutenticada({ banco, autenticacao });

  // Identidades que a conta da sessão pode operar (pessoal + empresariais autorizadas).
  servidor.get(
    "/identidades/operaveis",
    { preHandler: exigirIdentidade },
    async (requisicao) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const lista: ListaIdentidadesOperaveis = {
        identidades: await listarIdentidadesOperaveis(banco, usuarioId),
      };
      return lista;
    },
  );

  // Valida no servidor a intenção do cliente de agir como uma identidade. 404 se não puder (sem revelar).
  servidor.get(
    "/identidades/operaveis/:identidadeId",
    { preHandler: exigirIdentidade },
    async (requisicao, resposta) => {
      const { usuarioId } = obterIdentidadeExigida(requisicao);
      const parametros = z
        .object({ identidadeId: z.uuid() })
        .safeParse(requisicao.params);
      if (!parametros.success) {
        const erro: ErroApi = {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Identidade inválida.",
        };
        return resposta.code(400).send(erro);
      }
      const identidade: IdentidadeOperavel | null =
        await autorizarOperacaoIdentidade(
          banco,
          usuarioId,
          parametros.data.identidadeId,
        );
      if (!identidade) {
        const erro: ErroApi = {
          codigo: "IDENTIDADE_NAO_ENCONTRADA",
          mensagem: "Identidade não encontrada.",
        };
        return resposta.code(404).send(erro);
      }
      return identidade;
    },
  );
}

function obterNomeUsuarioInformado(corpo: unknown): string | null {
  if (
    typeof corpo !== "object" ||
    corpo === null ||
    !("nomeUsuario" in corpo) ||
    typeof corpo.nomeUsuario !== "string"
  )
    return null;
  const valor = corpo.nomeUsuario.trim();
  if (!valor) return null;
  return valor.startsWith("@") ? valor : `@${valor}`;
}
