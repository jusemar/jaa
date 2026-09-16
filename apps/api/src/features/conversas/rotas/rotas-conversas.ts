import type { Banco } from "@jaa/banco";
import {
  abrirConversaDiretaEntradaSchema,
  listarConversasConsultaSchema,
  type ConversaDireta,
  type ErroApi,
  type PaginaConversas,
} from "@jaa/contratos";
import type { FastifyInstance } from "fastify";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import {
  exigirIdentidadeAtuante,
  obterIdentidadeExigida,
} from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { abrirConversaDireta } from "../casos-de-uso/abrir-conversa-direta.js";
import { listarConversas } from "../casos-de-uso/listar-conversas.js";
import { serializarItemListaConversas } from "../lib/serializar-item-lista-conversas.js";

export function registrarRotasConversas(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao },
) {
  const preHandler = exigirIdentidadeAtuante(dependencias);

  // Lista de conversas da identidade ATUANTE autorizada (inbox pessoal OU da empresa operada). Query: antesDe, limite.
  servidor.get("/conversas", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const consulta = listarConversasConsultaSchema.safeParse(requisicao.query);

    if (!consulta.success) {
      const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: consulta.error.issues[0]?.message ?? "Dados inválidos." };
      return resposta.code(400).send(erro);
    }

    const resultado = await listarConversas(dependencias.banco, identidadeId, consulta.data);
    const pagina: PaginaConversas = {
      conversas: resultado.conversas.map(serializarItemListaConversas),
      proximoCursor: resultado.proximoCursor,
    };
    return pagina;
  });

  // Abre (ou obtém) a conversa direta entre a identidade atuante e a identidade (pessoa/empresa ativa) do @usuario.
  servidor.post(
    "/conversas/diretas",
    { preHandler },
    async (requisicao, resposta) => {
      const { identidadeId } = obterIdentidadeExigida(requisicao);
      const entrada = abrirConversaDiretaEntradaSchema.safeParse(requisicao.body);

      if (!entrada.success) {
        const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: entrada.error.issues[0]?.message ?? "Dados inválidos." };
        return resposta.code(400).send(erro);
      }

      const resultado = await abrirConversaDireta(dependencias.banco, identidadeId, entrada.data.nomeUsuario);

      switch (resultado.tipo) {
        case "identidade-nao-encontrada": {
          const erro: ErroApi = { codigo: "IDENTIDADE_NAO_ENCONTRADA", mensagem: "Nenhuma pessoa encontrada com este @usuario." };
          return resposta.code(404).send(erro);
        }
        case "consigo-mesmo": {
          const erro: ErroApi = { codigo: "CONVERSA_CONSIGO_MESMO", mensagem: "Não é possível iniciar uma conversa consigo mesmo." };
          return resposta.code(400).send(erro);
        }
        case "criada":
        case "existente": {
          const conversa: ConversaDireta = {
            id: resultado.conversaId,
            tipo: "direta",
            participantes: resultado.participantes,
          };
          return resposta.code(resultado.tipo === "criada" ? 201 : 200).send(conversa);
        }
      }
    },
  );
}
