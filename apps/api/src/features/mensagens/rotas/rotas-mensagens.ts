import type { Banco } from "@jaa/banco";
import {
  enviarMensagemTextoEntradaSchema,
  listarMensagensConsultaSchema,
  type ErroApi,
  type PaginaMensagens,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import {
  exigirIdentidadeAutenticada,
  obterIdentidadeExigida,
} from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { enviarMensagemTexto } from "../casos-de-uso/enviar-mensagem-texto.js";
import { listarMensagens } from "../casos-de-uso/listar-mensagens.js";
import type { CanalEventosMensagens } from "../lib/eventos-mensagens.js";
import { serializarMensagem } from "../lib/serializar-mensagem.js";

const parametrosConversaSchema = z.object({ conversaId: z.uuid() });

function responderDadosInvalidos(resposta: FastifyReply, mensagem: string | undefined) {
  const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: mensagem ?? "Dados inválidos." };
  return resposta.code(400).send(erro);
}

function responderConversaNaoEncontrada(resposta: FastifyReply) {
  const erro: ErroApi = { codigo: "CONVERSA_NAO_ENCONTRADA", mensagem: "Conversa não encontrada." };
  return resposta.code(404).send(erro);
}

export function registrarRotasMensagens(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; eventosMensagens: CanalEventosMensagens },
) {
  const preHandler = exigirIdentidadeAutenticada(dependencias);

  servidor.get("/conversas/:conversaId/mensagens", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosConversaSchema.safeParse(requisicao.params);
    const consulta = listarMensagensConsultaSchema.safeParse(requisicao.query);

    if (!parametros.success) return responderDadosInvalidos(resposta, "Conversa inválida.");
    if (!consulta.success) return responderDadosInvalidos(resposta, consulta.error.issues[0]?.message);

    const resultado = await listarMensagens(dependencias.banco, identidadeId, parametros.data.conversaId, consulta.data);

    if (resultado.tipo === "conversa-nao-encontrada") return responderConversaNaoEncontrada(resposta);

    const pagina: PaginaMensagens = {
      mensagens: resultado.mensagens.map(serializarMensagem),
      proximoCursor: resultado.proximoCursor,
    };
    return pagina;
  });

  servidor.post("/conversas/:conversaId/mensagens", { preHandler }, async (requisicao, resposta) => {
    // Remetente = identidade da sessão. Qualquer remetente enviado no corpo é ignorado pelo schema.
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosConversaSchema.safeParse(requisicao.params);
    const entrada = enviarMensagemTextoEntradaSchema.safeParse(requisicao.body);

    if (!parametros.success) return responderDadosInvalidos(resposta, "Conversa inválida.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const resultado = await enviarMensagemTexto(dependencias, identidadeId, parametros.data.conversaId, entrada.data);

    switch (resultado.tipo) {
      case "conversa-nao-encontrada":
        return responderConversaNaoEncontrada(resposta);
      case "id-cliente-reutilizado": {
        const erro: ErroApi = {
          codigo: "ID_CLIENTE_REUTILIZADO",
          mensagem: "Este identificador de envio já foi usado para outra mensagem.",
        };
        return resposta.code(409).send(erro);
      }
      case "criada":
        return resposta.code(201).send(serializarMensagem(resultado.mensagem));
      case "ja-existente":
        return resposta.code(200).send(serializarMensagem(resultado.mensagem));
    }
  });
}
