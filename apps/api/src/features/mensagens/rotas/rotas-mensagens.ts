import type { Banco } from "@jaa/banco";
import {
  confirmarLeituraEntradaSchema,
  confirmarRecebimentoEntradaSchema,
  editarMensagemEntradaSchema,
  excluirMensagemConsultaSchema,
  enviarMensagemAudioCamposSchema,
  enviarMensagemImagemCamposSchema,
  pedirUrlsAudiosEntradaSchema,
  enviarMensagemTextoEntradaSchema,
  pedirUrlsImagensEntradaSchema,
  listarMensagensConsultaSchema,
  type ConfirmacaoRecebimento,
  type ErroApi,
  type ExclusaoParaMim,
  type LeituraConversa,
  type PaginaMensagens,
  type UrlsAudios,
  type UrlsImagens,
} from "@jaa/contratos";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import { ArmazenamentoNaoConfiguradoErro, type ArmazenamentoPrivado } from "../../../lib/armazenamento/armazenamento-arquivos.js";
import {
  FALHA_ARMAZENAMENTO_INDISPONIVEL,
  abrirArquivoComCampos,
  abrirAudioComCampos,
  falhaLimiteDeEnviosDeAudio,
  validarAudioEnviado,
  descartarArquivo,
  falhaLimiteDeEnvios,
  processarArquivoEnviado,
} from "../../../lib/armazenamento/receber-imagem.js";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import {
  exigirIdentidadeAtuante,
  obterIdentidadeExigida,
} from "../../autenticacao/lib/exigir-identidade-autenticada.js";
import { confirmarLeitura } from "../casos-de-uso/confirmar-leitura.js";
import { confirmarRecebimento } from "../casos-de-uso/confirmar-recebimento.js";
import { editarMensagem } from "../casos-de-uso/editar-mensagem.js";
import { excluirMensagem } from "../casos-de-uso/excluir-mensagem.js";
import { enviarMensagemImagem } from "../casos-de-uso/enviar-mensagem-imagem.js";
import { enviarMensagemTexto } from "../casos-de-uso/enviar-mensagem-texto.js";
import { enviarMensagemAudio } from "../casos-de-uso/enviar-mensagem-audio.js";
import { gerarUrlsAnexos } from "../casos-de-uso/gerar-urls-imagens.js";
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
  dependencias: { banco: Banco; autenticacao: Autenticacao; eventosMensagens: CanalEventosMensagens; armazenamentoPrivado: ArmazenamentoPrivado },
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
      case "comunicacao-bloqueada": {
        const erro: ErroApi = { codigo: "COMUNICACAO_BLOQUEADA", mensagem: "Mensagens bloqueadas entre vocês." };
        return resposta.code(403).send(erro);
      }
      case "criada":
        return resposta.code(201).send(serializarMensagem(resultado.mensagem));
      case "ja-existente":
        return resposta.code(200).send(serializarMensagem(resultado.mensagem));
    }
  });

  /**
   * ENVIO DE IMAGEM (multipart). Ordem dos campos: idCliente, legenda?, mensagemRespondidaId?, arquivo
   * POR ÚLTIMO — só os campos que chegam ANTES do arquivo são lidos (`ORDEM_CAMPOS_ENVIO_IMAGEM`).
   * O arquivo só é lido depois de autorização, idempotência, limite de envios, resposta e bloqueio.
   */
  servidor.post("/conversas/:conversaId/mensagens/imagem", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId, usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosConversaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Conversa inválida.");

    const aberto = await abrirArquivoComCampos(requisicao);
    if (!aberto.ok) return resposta.code(aberto.status).send(aberto.erro);
    const { arquivo } = aberto;
    // Daqui em diante, toda resposta que não usar o arquivo descarta os bytes que ainda chegam.
    const responder = (status: number, corpo: unknown) => {
      descartarArquivo(arquivo);
      return resposta.code(status).send(corpo);
    };

    const campos = enviarMensagemImagemCamposSchema.safeParse(aberto.campos);
    if (!campos.success) {
      const erro: ErroApi = {
        codigo: "DADOS_INVALIDOS",
        mensagem: aberto.campos.idCliente === undefined ? "Envie idCliente (e legenda/resposta, se houver) ANTES do arquivo." : (campos.error.issues[0]?.message ?? "Dados inválidos."),
      };
      return responder(400, erro);
    }

    const resultado = await enviarMensagemImagem(
      dependencias,
      identidadeId,
      parametros.data.conversaId,
      campos.data,
      () => processarArquivoEnviado(arquivo, "imagem-conversa"),
      usuarioId,
    );

    switch (resultado.tipo) {
      case "conversa-nao-encontrada":
        return responder(404, { codigo: "CONVERSA_NAO_ENCONTRADA", mensagem: "Conversa não encontrada." } satisfies ErroApi);
      case "mensagem-respondida-nao-encontrada":
        return responder(404, { codigo: "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA", mensagem: "A mensagem respondida não foi encontrada nesta conversa." } satisfies ErroApi);
      case "id-cliente-reutilizado":
        return responder(409, { codigo: "ID_CLIENTE_REUTILIZADO", mensagem: "Este identificador de envio já foi usado para outra mensagem." } satisfies ErroApi);
      case "comunicacao-bloqueada":
        return responder(403, { codigo: "COMUNICACAO_BLOQUEADA", mensagem: "Mensagens bloqueadas entre vocês." } satisfies ErroApi);
      case "limite-de-envios": {
        const falha = falhaLimiteDeEnvios(resultado.tenteNovamenteEmSegundos);
        resposta.header("retry-after", String(resultado.tenteNovamenteEmSegundos));
        return responder(falha.status, falha.erro);
      }
      case "arquivo-invalido":
        return responder(resultado.falha.status, resultado.falha.erro);
      case "armazenamento-indisponivel":
        return responder(FALHA_ARMAZENAMENTO_INDISPONIVEL.status, FALHA_ARMAZENAMENTO_INDISPONIVEL.erro);
      case "criada":
        return resposta.code(201).send(serializarMensagem(resultado.mensagem));
      case "ja-existente":
        return responder(200, serializarMensagem(resultado.mensagem));
    }
  });

  /**
   * URLs TEMPORÁRIAS (assinadas, 20 min) das imagens pedidas, para a identidade atuante. Ids que ela
   * não pode ver simplesmente não voltam. A URL nunca é gravada nem enviada por evento.
   */
  servidor.post("/conversas/:conversaId/imagens/urls", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosConversaSchema.safeParse(requisicao.params);
    const entrada = pedirUrlsImagensEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Conversa inválida.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    try {
      const resultado = await gerarUrlsAnexos(dependencias, "imagem", identidadeId, parametros.data.conversaId, entrada.data.mensagemIds);
      if (resultado.tipo === "conversa-nao-encontrada") return responderConversaNaoEncontrada(resposta);
      const corpo: UrlsImagens = { imagens: resultado.urls };
      return corpo;
    } catch (erro) {
      if (erro instanceof ArmazenamentoNaoConfiguradoErro) return resposta.code(FALHA_ARMAZENAMENTO_INDISPONIVEL.status).send(FALHA_ARMAZENAMENTO_INDISPONIVEL.erro);
      throw erro;
    }
  });

  /*
   * MENSAGEM DE VOZ na conversa (multipart). Mesmo desenho da imagem: campos de texto ANTES do
   * arquivo (`ORDEM_CAMPOS_ENVIO_AUDIO`) e o arquivo só é lido depois de autorização, idempotência,
   * limite de envios, resposta e bloqueio. O limite de tamanho é o do áudio, não o das imagens.
   */
  servidor.post("/conversas/:conversaId/mensagens/audio", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId, usuarioId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosConversaSchema.safeParse(requisicao.params);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Conversa inválida.");

    const aberto = await abrirAudioComCampos(requisicao);
    if (!aberto.ok) return resposta.code(aberto.status).send(aberto.erro);
    const { arquivo } = aberto;
    // Daqui em diante, toda resposta que não usar o arquivo descarta os bytes que ainda chegam.
    const responder = (status: number, corpo: unknown) => {
      descartarArquivo(arquivo);
      return resposta.code(status).send(corpo);
    };

    const campos = enviarMensagemAudioCamposSchema.safeParse(aberto.campos);
    if (!campos.success) {
      const erro: ErroApi = {
        codigo: "DADOS_INVALIDOS",
        mensagem: aberto.campos.idCliente === undefined || aberto.campos.duracaoMs === undefined ? "Envie idCliente e duracaoMs (e a resposta, se houver) ANTES do arquivo." : (campos.error.issues[0]?.message ?? "Dados inválidos."),
      };
      return responder(400, erro);
    }

    const resultado = await enviarMensagemAudio(dependencias, identidadeId, parametros.data.conversaId, campos.data, () => validarAudioEnviado(arquivo, campos.data.duracaoMs), usuarioId);

    switch (resultado.tipo) {
      case "conversa-nao-encontrada":
        return responder(404, { codigo: "CONVERSA_NAO_ENCONTRADA", mensagem: "Conversa não encontrada." } satisfies ErroApi);
      case "mensagem-respondida-nao-encontrada":
        return responder(404, { codigo: "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA", mensagem: "A mensagem respondida não foi encontrada nesta conversa." } satisfies ErroApi);
      case "id-cliente-reutilizado":
        return responder(409, { codigo: "ID_CLIENTE_REUTILIZADO", mensagem: "Este identificador de envio já foi usado para outra mensagem." } satisfies ErroApi);
      case "comunicacao-bloqueada":
        return responder(403, { codigo: "COMUNICACAO_BLOQUEADA", mensagem: "Mensagens bloqueadas entre vocês." } satisfies ErroApi);
      case "limite-de-envios": {
        const falha = falhaLimiteDeEnviosDeAudio(resultado.tenteNovamenteEmSegundos);
        resposta.header("retry-after", String(resultado.tenteNovamenteEmSegundos));
        return responder(falha.status, falha.erro);
      }
      case "arquivo-invalido":
        return responder(resultado.falha.status, resultado.falha.erro);
      case "armazenamento-indisponivel":
        return responder(FALHA_ARMAZENAMENTO_INDISPONIVEL.status, { codigo: "ARMAZENAMENTO_INDISPONIVEL", mensagem: "O envio de áudios ainda não está configurado neste ambiente." } satisfies ErroApi);
      case "ja-existente":
        // Retry idempotente: o arquivo desta tentativa nem foi lido.
        return responder(200, serializarMensagem(resultado.mensagem));
      case "criada":
        return resposta.code(201).send(serializarMensagem(resultado.mensagem));
    }
  });

  /* URLs TEMPORÁRIAS (assinadas, 20 min) dos ÁUDIOS pedidos — mesmas regras das imagens. */
  servidor.post("/conversas/:conversaId/audios/urls", { preHandler }, async (requisicao, resposta) => {
    const { identidadeId } = obterIdentidadeExigida(requisicao);
    const parametros = parametrosConversaSchema.safeParse(requisicao.params);
    const entrada = pedirUrlsAudiosEntradaSchema.safeParse(requisicao.body);
    if (!parametros.success) return responderDadosInvalidos(resposta, "Conversa inválida.");
    if (!entrada.success) return responderDadosInvalidos(resposta, entrada.error.issues[0]?.message);

    try {
      const resultado = await gerarUrlsAnexos(dependencias, "audio", identidadeId, parametros.data.conversaId, entrada.data.mensagemIds);
      if (resultado.tipo === "conversa-nao-encontrada") return responderConversaNaoEncontrada(resposta);
      const corpo: UrlsAudios = { audios: resultado.urls };
      return corpo;
    } catch (erro) {
      if (erro instanceof ArmazenamentoNaoConfiguradoErro) return resposta.code(FALHA_ARMAZENAMENTO_INDISPONIVEL.status).send(FALHA_ARMAZENAMENTO_INDISPONIVEL.erro);
      throw erro;
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
      case "nao-editavel": {
        const erro: ErroApi = { codigo: "MENSAGEM_NAO_EDITAVEL", mensagem: "Só mensagens de texto podem ser editadas." };
        return resposta.code(409).send(erro);
      }
      case "comunicacao-bloqueada": {
        const erro: ErroApi = { codigo: "COMUNICACAO_BLOQUEADA", mensagem: "Mensagens bloqueadas entre vocês." };
        return resposta.code(403).send(erro);
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
    const resultado = await excluirMensagem(
      {
        ...dependencias,
        // Órfão no storage: registrado só com a chave (sem credencial), para a varredura futura.
        aoFalharRemocaoArquivo: (chave, erro) => requisicao.log.warn({ chave, erro: erro instanceof Error ? erro.message : String(erro) }, "Imagem não removida do armazenamento privado."),
      },
      identidadeId,
      conversaId,
      mensagemId,
      consulta.data.escopo,
      usuarioId,
    );

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
