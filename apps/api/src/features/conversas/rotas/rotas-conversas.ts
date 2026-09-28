import type { Banco } from "@jaa/banco";
import {
  type ResumoNaoLidas,
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
import * as z from "zod";
import type { CanalEventosMensagens } from "../../mensagens/lib/eventos-mensagens.js";
import { limparConversaPara, listarNaoLidasPorConversa } from "../repositorios/repositorio-conversas.js";

export function registrarRotasConversas(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; eventosMensagens?: CanalEventosMensagens },
) {
  const preHandler = exigirIdentidadeAtuante(dependencias);

  /*
   * LIMPAR / APAGAR conversa: estado SÓ da identidade atuante (a da sessão, nunca um id do corpo).
   * Quem não participa recebe 404, sem revelar se a conversa existe. Nada é apagado para o outro.
   */
  const parametrosConversa = z.object({ conversaId: z.uuid() });
  for (const [caminho, apagar] of [["limpar", false], ["apagar", true]] as const) {
    servidor.post(`/conversas/:conversaId/${caminho}`, { preHandler }, async (requisicao, resposta) => {
      const { identidadeId } = obterIdentidadeExigida(requisicao);
      const parametros = parametrosConversa.safeParse(requisicao.params);
      const participa = parametros.success && (await limparConversaPara(dependencias.banco, parametros.data.conversaId, identidadeId, apagar));
      if (!parametros.success || !participa) {
        const erro: ErroApi = { codigo: "CONVERSA_NAO_ENCONTRADA", mensagem: "Conversa não encontrada." };
        return resposta.code(404).send(erro);
      }
      dependencias.eventosMensagens?.publicar({
        tipo: "conversa-estado-pessoal",
        destinatariosIdentidadeIds: [identidadeId],
        conversaId: parametros.data.conversaId,
        acao: apagar ? "apagada" : "limpa",
      });
      return resposta.code(204).send();
    });
  }

  // Não lidas por conversa da identidade ATUANTE (indicador de Conversas fora da lista). Nada vem do cliente.
  servidor.get("/conversas/nao-lidas", { preHandler }, async (requisicao) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const resumo: ResumoNaoLidas = { conversas: await listarNaoLidasPorConversa(dependencias.banco, identidadeId) };
    return resumo;
  });

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
