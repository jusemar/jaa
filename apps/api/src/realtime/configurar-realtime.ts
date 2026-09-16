import type { Banco } from "@jaa/banco";
import {
  EVENTO_CONVERSA_NAO_LIDAS,
  EVENTO_DIGITANDO_ATUALIZADO,
  EVENTO_MENSAGEM_ATUALIZADA,
  EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM,
  EVENTO_MENSAGEM_NOVA,
  EVENTO_MENSAGENS_ENTREGUES,
  EVENTO_MENSAGENS_LIDAS,
  EVENTO_NOTIFICACAO_NOVA_MENSAGEM,
  EVENTO_ENTREGA_ATUALIZADA,
  EVENTO_ENTREGADOR_DISPONIBILIDADE,
  EVENTO_DESPACHO_ATUALIZADO,
  EVENTO_FILA_ATUALIZADA,
  EVENTO_PEDIDO_FILA,
  EVENTO_SITUACAO_OPERACIONAL,
  EVENTO_SAIDA_ATUALIZADA,
  EVENTO_PEDIDO_STATUS_ATUALIZADO,
  EVENTO_PRESENCA_ATUALIZADA,
  type CodigoErroConexaoRealtime,
  type ErroConexaoRealtime,
} from "@jaa/contratos";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";
import type { Autenticacao } from "../features/autenticacao/autenticacao.js";
import { autenticarIdentidade } from "../features/autenticacao/casos-de-uso/autenticar-identidade.js";
import type { AvisoSessoesEncerradas } from "../features/autenticacao/lib/sessoes-encerradas.js";
import { registrarEventosAtividadeConversa } from "../features/conversas/eventos/eventos-atividade-conversa.js";
import { criarAtualizadorNaoLidas } from "../features/conversas/lib/atualizador-nao-lidas.js";
import { criarRegistroDigitandoEmMemoria, type RegistroDigitando } from "../features/conversas/lib/registro-digitando.js";
import type { CanalEventosMensagens } from "../features/mensagens/lib/eventos-mensagens.js";
import { serializarMensagem } from "../features/mensagens/lib/serializar-mensagem.js";
import { criarNotificadorNovasMensagens } from "../features/notificacoes/lib/notificador-novas-mensagens.js";
import { criarCanalEventosEntregas, type CanalEventosEntregas } from "../features/entregas/lib/eventos-entregas.js";
import { criarCanalEventosPedidos, type CanalEventosPedidos } from "../features/pedidos/lib/eventos-pedidos.js";
import { criarRegistroPresencaEmMemoria, type RegistroPresenca } from "../features/presenca/lib/registro-presenca.js";
import { salaDaConversa, salaDaIdentidade, salaDaSessao, salaDePresenca } from "./salas.js";
import type { ServidorRealtime } from "./tipos.js";

interface DependenciasRealtime {
  autenticacao: Autenticacao;
  banco: Banco;
  sessoesEncerradas: AvisoSessoesEncerradas;
  eventosMensagens: CanalEventosMensagens;
  eventosPedidos?: CanalEventosPedidos;
  eventosEntregas?: CanalEventosEntregas;
  origensPermitidas: string[];
  // Opcionais: por padrão, implementações em memória (uma instância da API).
  presenca?: RegistroPresenca;
  digitando?: RegistroDigitando;
}

const MENSAGENS_ERRO_CONEXAO: Record<CodigoErroConexaoRealtime, string> = {
  NAO_AUTENTICADO: "Sessão ausente ou expirada.",
  CADASTRO_INCOMPLETO: "Conclua o cadastro para usar o realtime.",
  IDENTIDADE_NAO_AUTORIZADA: "Você não pode agir como esta identidade.",
  ERRO_INTERNO: "Não foi possível autenticar a conexão.",
};

function erroDeConexao(codigo: CodigoErroConexaoRealtime) {
  const dados: ErroConexaoRealtime = { codigo, mensagem: MENSAGENS_ERRO_CONEXAO[codigo] };
  // O Socket.IO entrega `message` e `data` ao cliente em `connect_error`.
  return Object.assign(new Error(codigo), { data: dados });
}

export function configurarRealtime(servidor: FastifyInstance, dependencias: DependenciasRealtime): ServidorRealtime {
  const origens = new Set(dependencias.origensPermitidas);
  const presenca = dependencias.presenca ?? criarRegistroPresencaEmMemoria();
  const digitando = dependencias.digitando ?? criarRegistroDigitandoEmMemoria();
  const eventosPedidos = dependencias.eventosPedidos ?? criarCanalEventosPedidos();
  const eventosEntregas = dependencias.eventosEntregas ?? criarCanalEventosEntregas();
  const atualizadorNaoLidas = criarAtualizadorNaoLidas({
    banco: dependencias.banco,
    eventosMensagens: dependencias.eventosMensagens,
    aoFalhar: (erro) => servidor.log.error({ erro: erro instanceof Error ? erro.message : "desconhecido" }, "Falha ao recalcular não lidas"),
  });
  // Serviços de domínio que reagem a fatos já persistidos; vivem com o canal/realtime desta instância.
  const notificador = criarNotificadorNovasMensagens({
    banco: dependencias.banco,
    eventosMensagens: dependencias.eventosMensagens,
    aoFalhar: (erro) => servidor.log.error({ erro: erro instanceof Error ? erro.message : "desconhecido" }, "Falha ao notificar nova mensagem"),
  });

  const realtime: ServidorRealtime = new Server(servidor.server, {
    cors: {
      origin: dependencias.origensPermitidas,
      methods: ["GET", "POST"],
      // O cookie de sessão precisa acompanhar o handshake vindo do web.
      credentials: true,
    },
    // CORS não protege o upgrade WebSocket: a origem do navegador também é conferida aqui.
    // Clientes nativos (futuro app Expo) não enviam Origin e seguem para a validação da sessão.
    allowRequest: (requisicao, responder) => {
      const origem = requisicao.headers.origin;
      responder(null, origem === undefined || origens.has(origem));
    },
  });

  // Middleware oficial de handshake: nenhuma conexão é aceita sem sessão válida e identidade pessoal.
  // usuarioId/sessaoId vêm só do servidor. A identidade ATUANTE da conexão é a pessoal, ou a pedida em
  // `auth.identidadeId` SE a conta puder operá-la (senão a conexão é recusada). Cada conexão age como
  // UMA identidade: trocar de identidade no cliente = nova conexão, com nova autorização.
  realtime.use(async (socket, next) => {
    try {
      const auth: unknown = socket.handshake.auth;
      const identidadeSolicitada = typeof auth === "object" && auth !== null && "identidadeId" in auth ? auth.identidadeId : undefined;
      const resultado = await autenticarIdentidade(dependencias, socket.handshake.headers, identidadeSolicitada);

      if (!resultado.ok) {
        servidor.log.info({ motivo: resultado.codigo }, "Conexão realtime recusada");
        next(erroDeConexao(resultado.codigo));
        return;
      }

      socket.data.contexto = resultado.contexto;
      next();
    } catch (erro) {
      // Nunca registrar cabeçalhos do handshake: contêm o cookie de sessão.
      servidor.log.error({ erro: erro instanceof Error ? erro.message : "desconhecido" }, "Falha ao autenticar conexão realtime");
      next(erroDeConexao("ERRO_INTERNO"));
    }
  });

  realtime.on("connection", (socket) => {
    // `identidadeId` = identidade atuante autorizada: salas, presença e digitando são dela.
    // Presença de identidade empresarial agrega as conexões de todos os seus operadores.
    const { usuarioId, identidadeId, sessaoId } = socket.data.contexto;
    socket.data.observacoes = new Map();
    void socket.join([salaDaSessao(sessaoId), salaDaIdentidade(identidadeId)]);
    presenca.conectar(identidadeId, socket.id);
    registrarEventosAtividadeConversa(socket, { banco: dependencias.banco, presenca, digitando, log: servidor.log });

    servidor.log.info({ socketId: socket.id, usuarioId, identidadeId }, "Cliente conectado ao realtime");

    socket.on("disconnect", (motivo) => {
      // Queda da conexão encerra imediatamente o "digitando" dela; presença respeita a tolerância.
      digitando.encerrarConexao(socket.id);
      presenca.desconectar(identidadeId, socket.id);
      servidor.log.info({ socketId: socket.id, usuarioId, motivo }, "Cliente desconectado do realtime");
    });
  });

  // Presença: só para quem observa uma conversa com a identidade. Nunca broadcast global.
  const cancelarPresenca = presenca.inscrever(({ identidadeId, online }) => {
    realtime.to(salaDePresenca(identidadeId)).emit(EVENTO_PRESENCA_ATUALIZADA, { identidadeId, online });
  });

  // Digitando: para quem observa a conversa, exceto as conexões da própria identidade.
  const cancelarDigitando = digitando.inscrever(({ conversaId, identidadeId, digitando: estaDigitando }) => {
    realtime
      .to(salaDaConversa(conversaId))
      .except(salaDaIdentidade(identidadeId))
      .emit(EVENTO_DIGITANDO_ATUALIZADO, { conversaId, identidadeId, digitando: estaDigitando });
  });

  // Sessão encerrada (ex.: logout) → derruba imediatamente só as conexões daquela sessão.
  const cancelarInscricao = dependencias.sessoesEncerradas.inscrever((sessaoId) => {
    realtime.in(salaDaSessao(sessaoId)).disconnectSockets(true);
  });

  // Fato já persistido → entrega a todas as conexões das identidades participantes.
  // Emitir NÃO altera estado: "entregue" só existe após a confirmação do cliente destinatário.
  const cancelarEntregaMensagens = dependencias.eventosMensagens.inscrever((evento) => {
    const salas = evento.destinatariosIdentidadeIds.map(salaDaIdentidade);

    switch (evento.tipo) {
      case "mensagem-criada":
        // Quem enviou parou de digitar: o indicador some antes de a mensagem aparecer.
        digitando.pararIdentidade(evento.mensagem.conversaId, evento.mensagem.remetenteIdentidadeId);
        realtime.to(salas).emit(EVENTO_MENSAGEM_NOVA, { mensagem: serializarMensagem(evento.mensagem) });
        return;
      case "mensagem-atualizada":
        realtime.to(salas).emit(EVENTO_MENSAGEM_ATUALIZADA, { mensagem: serializarMensagem(evento.mensagem) });
        return;
      case "mensagem-excluida-para-mim":
        realtime.to(salas).emit(EVENTO_MENSAGEM_EXCLUIDA_PARA_MIM, {
          conversaId: evento.conversaId,
          mensagemId: evento.mensagemId,
          ultimaMensagem: evento.ultimaMensagem && serializarMensagem(evento.ultimaMensagem),
        });
        return;
      case "nao-lidas-atualizadas":
        realtime.to(salas).emit(EVENTO_CONVERSA_NAO_LIDAS, { conversaId: evento.conversaId, naoLidas: evento.naoLidas });
        return;
      case "notificacao-nova-mensagem":
        realtime.to(salas).emit(EVENTO_NOTIFICACAO_NOVA_MENSAGEM, {
          conversaId: evento.conversaId,
          mensagemId: evento.mensagemId,
          remetente: evento.remetente,
          previaConteudo: evento.previaConteudo,
          conteudoTruncado: evento.conteudoTruncado,
          criadoEm: evento.criadoEm.toISOString(),
        });
        return;
      case "mensagens-entregues":
        realtime.to(salas).emit(EVENTO_MENSAGENS_ENTREGUES, {
          conversaId: evento.conversaId,
          destinatarioIdentidadeId: evento.destinatarioIdentidadeId,
          mensagemIds: evento.mensagemIds,
        });
        return;
      case "mensagens-lidas":
        realtime.to(salas).emit(EVENTO_MENSAGENS_LIDAS, {
          conversaId: evento.conversaId,
          leitorIdentidadeId: evento.leitorIdentidadeId,
          ateMensagemId: evento.ateMensagemId,
        });
        return;
    }
  });

  /*
   * Status do pedido mudou (já commitado): entrega só às identidades com relação real com o pedido
   * (cliente dono e identidade da empresa). Não é mensagem — não mexe em conversa nem em não lidas.
   */
  const cancelarEntregaPedidos = eventosPedidos.inscrever((evento) => {
    realtime.to(evento.destinatariosIdentidadeIds.map(salaDaIdentidade)).emit(EVENTO_PEDIDO_STATUS_ATUALIZADO, {
      conversaId: evento.conversaId,
      pedido: evento.pedido,
      motivoCancelamento: evento.motivoCancelamento,
      ocorridoEm: evento.ocorridoEm.toISOString(),
    });
  });

  /*
   * Entregas: só as conexões do entregador envolvido. `entrega: null` = saiu da lista dele
   * (reatribuída, encerrada ou vínculo revogado) — a interface remove o que ele não pode mais ver.
   */
  const cancelarEntregaEntregas = eventosEntregas.inscrever((evento) => {
    const salas = evento.destinatariosIdentidadeIds.map(salaDaIdentidade);
    if (evento.tipo === "entrega-atualizada") {
      realtime.to(salas).emit(EVENTO_ENTREGA_ATUALIZADA, { pedidoId: evento.pedidoId, entrega: evento.entrega });
      return;
    }
    if (evento.tipo === "saida-atualizada") {
      // Saída inteira: só empresa e entregador daquela operação.
      realtime.to(salas).emit(EVENTO_SAIDA_ATUALIZADA, { saida: evento.saida });
      return;
    }
    if (evento.tipo === "painel-operacional-atualizado") {
      // Painel da base: só para a empresa daquela base.
      realtime.to(salas).emit(EVENTO_FILA_ATUALIZADA, { painel: evento.painel });
      return;
    }
    if (evento.tipo === "situacao-operacional-atualizada") {
      // Situação própria: só para o entregador dela.
      realtime.to(salas).emit(EVENTO_SITUACAO_OPERACIONAL, { situacao: evento.situacao });
      return;
    }
    if (evento.tipo === "fila-atualizada") {
      // Cliente: só a posição do PRÓPRIO pedido, nunca a sequência.
      realtime.to(salas).emit(EVENTO_PEDIDO_FILA, evento.fila);
      return;
    }
    if (evento.tipo === "despacho-atualizado") {
      // Zonas e pendências da automação: assunto interno da empresa.
      realtime.to(salas).emit(EVENTO_DESPACHO_ATUALIZADO, { painel: evento.painel });
      return;
    }
    // Disponibilidade: só para quem opera a empresa DAQUELE vínculo (nunca outra empresa).
    realtime.to(salas).emit(EVENTO_ENTREGADOR_DISPONIBILIDADE, { entregador: evento.entregador });
  });

  // Ao desligar a API, fecha só o transporte (sem pacote de "desconexão pelo servidor"):
  // assim os clientes tratam como queda, reconectam sozinhos e passam de novo pelo handshake.
  servidor.addHook("preClose", async () => {
    realtime.engine.close();
  });

  servidor.addHook("onClose", async () => {
    cancelarInscricao();
    cancelarEntregaMensagens();
    cancelarEntregaPedidos();
    cancelarEntregaEntregas();
    cancelarPresenca();
    cancelarDigitando();
    await atualizadorNaoLidas.encerrar();
    await notificador.encerrar();
    presenca.encerrar();
    digitando.encerrar();
    // O servidor HTTP já foi fechado pelo Fastify; aqui só são liberados os recursos do Socket.IO.
    await new Promise<void>((resolver) => {
      void realtime.close(() => resolver());
    });
  });

  return realtime;
}
