import type { Banco } from "@jaa/banco";
import { EVENTO_MENSAGEM_NOVA, type CodigoErroConexaoRealtime, type ErroConexaoRealtime } from "@jaa/contratos";
import type { FastifyInstance } from "fastify";
import { Server } from "socket.io";
import type { Autenticacao } from "../features/autenticacao/autenticacao.js";
import { autenticarIdentidade } from "../features/autenticacao/casos-de-uso/autenticar-identidade.js";
import type { AvisoSessoesEncerradas } from "../features/autenticacao/lib/sessoes-encerradas.js";
import type { CanalEventosMensagens } from "../features/mensagens/lib/eventos-mensagens.js";
import { serializarMensagem } from "../features/mensagens/lib/serializar-mensagem.js";
import type { ServidorRealtime } from "./tipos.js";

interface DependenciasRealtime {
  autenticacao: Autenticacao;
  banco: Banco;
  sessoesEncerradas: AvisoSessoesEncerradas;
  eventosMensagens: CanalEventosMensagens;
  origensPermitidas: string[];
}

const MENSAGENS_ERRO_CONEXAO: Record<CodigoErroConexaoRealtime, string> = {
  NAO_AUTENTICADO: "Sessão ausente ou expirada.",
  CADASTRO_INCOMPLETO: "Conclua o cadastro para usar o realtime.",
  ERRO_INTERNO: "Não foi possível autenticar a conexão.",
};

// Salas TÉCNICAS internas, sempre definidas pelo servidor (o cliente não entra em salas).
// Não são salas de conversa nem substituem a autorização de domínio, feita na API/banco.
// sessao:<id>     → encerrar só as conexões de uma sessão (logout/revogação).
// identidade:<id> → entregar eventos a todas as conexões de uma identidade (abas e dispositivos).
const salaDaSessao = (sessaoId: string) => `sessao:${sessaoId}`;
const salaDaIdentidade = (identidadeId: string) => `identidade:${identidadeId}`;

function erroDeConexao(codigo: CodigoErroConexaoRealtime) {
  const dados: ErroConexaoRealtime = { codigo, mensagem: MENSAGENS_ERRO_CONEXAO[codigo] };
  // O Socket.IO entrega `message` e `data` ao cliente em `connect_error`.
  return Object.assign(new Error(codigo), { data: dados });
}

export function configurarRealtime(servidor: FastifyInstance, dependencias: DependenciasRealtime): ServidorRealtime {
  const origens = new Set(dependencias.origensPermitidas);

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
  // usuarioId/identidadeId/sessaoId vêm só do servidor; dados enviados pelo cliente são ignorados.
  realtime.use(async (socket, next) => {
    try {
      const resultado = await autenticarIdentidade(dependencias, socket.handshake.headers);

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
    const { usuarioId, identidadeId, sessaoId } = socket.data.contexto;
    void socket.join([salaDaSessao(sessaoId), salaDaIdentidade(identidadeId)]);

    servidor.log.info({ socketId: socket.id, usuarioId, identidadeId }, "Cliente conectado ao realtime");

    socket.on("disconnect", (motivo) => {
      servidor.log.info({ socketId: socket.id, usuarioId, motivo }, "Cliente desconectado do realtime");
    });
  });

  // Sessão encerrada (ex.: logout) → derruba imediatamente só as conexões daquela sessão.
  const cancelarInscricao = dependencias.sessoesEncerradas.inscrever((sessaoId) => {
    realtime.in(salaDaSessao(sessaoId)).disconnectSockets(true);
  });

  // Ao desligar a API, fecha só o transporte (sem pacote de "desconexão pelo servidor"):
  // assim os clientes tratam como queda, reconectam sozinhos e passam de novo pelo handshake.
  // Mensagem já persistida → entrega a todas as conexões das identidades participantes.
  const cancelarEntregaMensagens = dependencias.eventosMensagens.inscrever(({ mensagem, destinatariosIdentidadeIds }) => {
    realtime.to(destinatariosIdentidadeIds.map(salaDaIdentidade)).emit(EVENTO_MENSAGEM_NOVA, {
      mensagem: serializarMensagem(mensagem),
    });
  });

  servidor.addHook("preClose", async () => {
    realtime.engine.close();
  });

  servidor.addHook("onClose", async () => {
    cancelarInscricao();
    cancelarEntregaMensagens();
    // O servidor HTTP já foi fechado pelo Fastify; aqui só são liberados os recursos do Socket.IO.
    await new Promise<void>((resolver) => {
      void realtime.close(() => resolver());
    });
  });

  return realtime;
}
