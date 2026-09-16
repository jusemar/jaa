import type { Banco } from "@jaa/banco";
import {
  EVENTO_CONVERSA_DEIXAR_DE_OBSERVAR,
  EVENTO_CONVERSA_OBSERVAR,
  EVENTO_DIGITANDO_INFORMAR,
  informarDigitandoEntradaSchema,
  observarConversaEntradaSchema,
  type RespostaEventoRealtime,
  type RespostaObservarConversa,
} from "@jaa/contratos";
import type { FastifyBaseLogger } from "fastify";
import { salaDaConversa, salaDePresenca } from "../../../realtime/salas.js";
import type { SocketRealtime } from "../../../realtime/tipos.js";
import type { RegistroPresenca } from "../../presenca/lib/registro-presenca.js";
import { autorizarObservacaoConversa } from "../casos-de-uso/autorizar-observacao-conversa.js";
import type { RegistroDigitando } from "../lib/registro-digitando.js";

// Uma conexão observa poucas conversas ao mesmo tempo (a aberta na tela); impede varrer presença em massa.
export const LIMITE_OBSERVACOES_POR_CONEXAO = 10;

interface DependenciasAtividadeConversa {
  banco: Banco;
  presenca: RegistroPresenca;
  digitando: RegistroDigitando;
  log: FastifyBaseLogger;
}

function responderSeFuncao<T>(responder: unknown, resposta: T) {
  if (typeof responder === "function") responder(resposta);
}

/**
 * Entrada realtime da atividade efêmera de conversa. Handlers finos: validam o payload, usam SEMPRE
 * a identidade do handshake e autorizam pela participação na conversa (banco) antes de inscrever o
 * socket nas salas de entrega. "Digitando" só é aceito de conexão que já observa a conversa.
 */
export function registrarEventosAtividadeConversa(socket: SocketRealtime, dependencias: DependenciasAtividadeConversa) {
  const { identidadeId } = socket.data.contexto;
  const { observacoes } = socket.data;

  socket.on(EVENTO_CONVERSA_OBSERVAR, async (dados, responder) => {
    const entrada = observarConversaEntradaSchema.safeParse(dados);
    if (!entrada.success) {
      responderSeFuncao<RespostaObservarConversa>(responder, { ok: false, codigo: "DADOS_INVALIDOS" });
      return;
    }
    const { conversaId } = entrada.data;

    if (!observacoes.has(conversaId) && observacoes.size >= LIMITE_OBSERVACOES_POR_CONEXAO) {
      responderSeFuncao<RespostaObservarConversa>(responder, { ok: false, codigo: "LIMITE_OBSERVACOES" });
      return;
    }

    try {
      const resultado = await autorizarObservacaoConversa(dependencias.banco, identidadeId, conversaId);
      if (resultado.tipo === "conversa-nao-encontrada" || !socket.connected) {
        responderSeFuncao<RespostaObservarConversa>(responder, { ok: false, codigo: "CONVERSA_NAO_ENCONTRADA" });
        return;
      }

      const outros = resultado.outrosParticipantesIds;
      observacoes.set(conversaId, outros);
      // Inscrição e leitura do estado atual no mesmo tick: nenhuma mudança fica entre as duas.
      void socket.join([salaDaConversa(conversaId), ...outros.map(salaDePresenca)]);
      responderSeFuncao<RespostaObservarConversa>(responder, {
        ok: true,
        presencas: outros.map((id) => ({ identidadeId: id, online: dependencias.presenca.estaOnline(id) })),
      });
    } catch (erro) {
      dependencias.log.error({ erro: erro instanceof Error ? erro.message : "desconhecido" }, "Falha ao autorizar observação de conversa");
      responderSeFuncao<RespostaObservarConversa>(responder, { ok: false, codigo: "CONVERSA_NAO_ENCONTRADA" });
    }
  });

  socket.on(EVENTO_CONVERSA_DEIXAR_DE_OBSERVAR, (dados, responder) => {
    const entrada = observarConversaEntradaSchema.safeParse(dados);
    if (!entrada.success) {
      responderSeFuncao<RespostaEventoRealtime>(responder, { ok: false, codigo: "DADOS_INVALIDOS" });
      return;
    }
    const { conversaId } = entrada.data;
    const outros = observacoes.get(conversaId);

    if (outros) {
      observacoes.delete(conversaId);
      dependencias.digitando.pararConexaoNaConversa(conversaId, socket.id);
      void socket.leave(salaDaConversa(conversaId));
      // Só deixa a presença de quem não aparece em outra conversa ainda observada (grupos, no futuro).
      const aindaObservados = new Set([...observacoes.values()].flat());
      for (const id of outros) {
        if (!aindaObservados.has(id)) void socket.leave(salaDePresenca(id));
      }
    }
    responderSeFuncao<RespostaEventoRealtime>(responder, { ok: true });
  });

  socket.on(EVENTO_DIGITANDO_INFORMAR, (dados, responder) => {
    const entrada = informarDigitandoEntradaSchema.safeParse(dados);
    if (!entrada.success) {
      responderSeFuncao<RespostaEventoRealtime>(responder, { ok: false, codigo: "DADOS_INVALIDOS" });
      return;
    }
    // Participação já verificada no banco ao observar; participantes de conversa direta não mudam.
    if (!observacoes.has(entrada.data.conversaId)) {
      responderSeFuncao<RespostaEventoRealtime>(responder, { ok: false, codigo: "CONVERSA_NAO_ENCONTRADA" });
      return;
    }

    dependencias.digitando.informar({ ...entrada.data, identidadeId, conexaoId: socket.id });
    responderSeFuncao<RespostaEventoRealtime>(responder, { ok: true });
  });
}
