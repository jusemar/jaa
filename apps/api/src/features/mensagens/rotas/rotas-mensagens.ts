import type { Banco } from "@jaa/banco";
import {
  confirmarLeituraEntradaSchema,
  confirmarRecebimentoEntradaSchema,
  editarMensagemEntradaSchema,
  excluirMensagemConsultaSchema,
  enviarMensagemTextoEntradaSchema,
  listarMensagensConsultaSchema,
  type ConfirmacaoRecebimento,
  type ErroApi,
  type ExclusaoParaMim,
  type LeituraConversa,
  type PaginaMensagens,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import {
  exigirIdentidadeAtuante,
  obterIdentidadeExigida,
} from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { confirmarLeitura } from "../casos-de-uso/confirmar-leitura.js";
import { confirmarRecebimento } from "../casos-de-uso/confirmar-recebimento.js";
import { editarMensagem } from "../casos-de-uso/editar-mensagem.js";
import { excluirMensagem } from "../casos-de-uso/excluir-mensagem.js";
import { enviarMensagemTexto } from "../casos-de-uso/enviar-mensagem-texto.js";
import { listarMensagens } from "../casos-de-uso/listar-mensagens.js";
import type { CanalEventosMensagens } from "../lib/eventos-mensagens.js";
import { serializarMensagem } from "../lib/serializar-mensagem.js";

const parametrosConversaSchema = z.object({ conversaId: z.uuid() });
const parametrosMensagemSchema = z.object({ conversaId: z.uuid(), mensagemId: z.uuid() });

function responderDadosInvalidos(resposta: FastifyReply, mensagem: string | undefined) {
  const erro: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: mensagem ?? "Dados inválidos." };
  return resposta.code(400).send(erro);
}

function responderConversaNaoEncontrada(resposta: FastifyReply) {
  const erro: ErroApi = { codigo: "CONVERSA_NAO_ENCONTRADA", mensagem: "Conversa não encontrada." };
  return resposta.code(404).send(erro);
}

function responderMensagemNaoEncontrada(resposta: FastifyReply, mensagem = "Mensagem recebida não encontrada.") {
  const erro: ErroApi = { codigo: "MENSAGEM_NAO_ENCONTRADA", mensagem };
  return resposta.code(404).send(erro);
}

function responderMensagemDeOutraIdentidade(resposta: FastifyReply) {
  const erro: ErroApi = { codigo: "MENSAGEM_DE_OUTRA_IDENTIDADE", mensagem: "Somente o autor pode alterar esta mensagem." };
  return resposta.code(403).send(erro);
}

export function registrarRotasMensagens(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; eventosMensagens: CanalEventosMensagens },
) {
  const preHandler = exigirIdentidadeAtuante(dependencias);

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
    // Remetente = identidade ATUANTE autorizada. Qualquer remetente enviado no corpo é ignorado pelo schema.
    const { identidadeId, usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosConversaSchema.safeParse(requisicao.params);
    const entrada = enviarMensagemTextoEntradaSchema.safeParse(requisicao.body);

    if (!parametros.success) return responderDadosInvalidos(resposta, "Conversa inválida.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const resultado = await enviarMensagemTexto(dependencias, identidadeId, parametros.data.conversaId, entrada.data, usuarioId);

    switch (resultado.tipo) {
      case "conversa-nao-encontrada":
        return responderConversaNaoEncontrada(resposta);
      case "mensagem-respondida-nao-encontrada": {
        const erro: ErroApi = {
          codigo: "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA",
          mensagem: "A mensagem respondida não foi encontrada nesta conversa.",
        };
        return resposta.code(404).send(erro);
      }
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

  // ENTREGUE: este cliente recebeu/processou as mensagens. Destinatário = identidade da sessão.
  servidor.post("/mensagens/recebimentos", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const entrada = confirmarRecebimentoEntradaSchema.safeParse(requisicao.body);

    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const resultado = await confirmarRecebimento(dependencias, identidadeId, entrada.data.mensagemIds);

    if (resultado.tipo === "mensagem-nao-encontrada") return responderMensagemNaoEncontrada(resposta);

    const confirmacao: ConfirmacaoRecebimento = { mensagemIds: resultado.mensagemIds };
    return confirmacao;
  });

  // LIDA: marcador de leitura da identidade da sessão nesta conversa, até a mensagem informada.
  servidor.post("/conversas/:conversaId/leitura", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosConversaSchema.safeParse(requisicao.params);
    const entrada = confirmarLeituraEntradaSchema.safeParse(requisicao.body);

    if (!parametros.success) return responderDadosInvalidos(resposta, "Conversa inválida.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const { conversaId } = parametros.data;
    const resultado = await confirmarLeitura(dependencias, identidadeId, conversaId, entrada.data.ateMensagemId);

    switch (resultado.tipo) {
      case "conversa-nao-encontrada":
        return responderConversaNaoEncontrada(resposta);
      case "mensagem-nao-encontrada":
        return responderMensagemNaoEncontrada(resposta);
      case "confirmada": {
        const leitura: LeituraConversa = { conversaId, lidaAteMensagemId: resultado.lidaAteMensagemId };
        return leitura;
      }
    }
  });

  // Edição do conteúdo pelo AUTOR (identidade da sessão). Mantém id, criadoEm, estado e referência.
  servidor.patch("/conversas/:conversaId/mensagens/:mensagemId", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId, usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosMensagemSchema.safeParse(requisicao.params);
    const entrada = editarMensagemEntradaSchema.safeParse(requisicao.body);

    if (!parametros.success) return responderDadosInvalidos(resposta, "Mensagem inválida.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    const { conversaId, mensagemId } = parametros.data;
    const resultado = await editarMensagem(dependencias, identidadeId, conversaId, mensagemId, entrada.data.conteudo, usuarioId);

    switch (resultado.tipo) {
      case "conversa-nao-encontrada":
        return responderConversaNaoEncontrada(resposta);
      case "mensagem-nao-encontrada":
        return responderMensagemNaoEncontrada(resposta, "Mensagem não encontrada.");
      case "de-outra-identidade":
        return responderMensagemDeOutraIdentidade(resposta);
      case "excluida": {
        const erro: ErroApi = { codigo: "MENSAGEM_EXCLUIDA", mensagem: "Mensagem excluída não pode ser editada." };
        return resposta.code(409).send(erro);
      }
      case "editada":
      case "sem-alteracao":
        return serializarMensagem(resultado.mensagem);
    }
  });

  // Exclusão lógica: ?escopo=mim (só a identidade da sessão deixa de ver) ou ?escopo=todos (autor; tombstone).
  servidor.delete("/conversas/:conversaId/mensagens/:mensagemId", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId, usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosMensagemSchema.safeParse(requisicao.params);
    const consulta = excluirMensagemConsultaSchema.safeParse(requisicao.query);

    if (!parametros.success) return responderDadosInvalidos(resposta, "Mensagem inválida.");
    if (!consulta.success) return responderDadosInvalidos(resposta, "Informe o escopo da exclusão: mim ou todos.");

    const { conversaId, mensagemId } = parametros.data;
    const resultado = await excluirMensagem(dependencias, identidadeId, conversaId, mensagemId, consulta.data.escopo, usuarioId);

    switch (resultado.tipo) {
      case "conversa-nao-encontrada":
        return responderConversaNaoEncontrada(resposta);
      case "mensagem-nao-encontrada":
        return responderMensagemNaoEncontrada(resposta, "Mensagem não encontrada.");
      case "de-outra-identidade":
        return responderMensagemDeOutraIdentidade(resposta);
      case "excluida-para-todos":
        return serializarMensagem(resultado.mensagem);
      case "excluida-para-mim": {
        const exclusao: ExclusaoParaMim = {
          conversaId: resultado.conversaId,
          mensagemId: resultado.mensagemId,
          ultimaMensagem: resultado.ultimaMensagem && serializarMensagem(resultado.ultimaMensagem),
        };
        return exclusao;
      }
    }
  });
}
