import type { Banco } from "@jaa/banco";
import { CANAL_PUSH_MENSAGENS, TEXTO_PUSH_NOVA_MENSAGEM, TITULO_PUSH_NOVA_MENSAGEM } from "@jaa/contratos";
import type { CanalEventosMensagens, NotificacaoNovaMensagem } from "../../mensagens/lib/eventos-mensagens.js";
import { buscarAlvosPush, invalidarTokensPush, type AlvoPush } from "../repositorios/repositorio-dispositivos-push.js";
import { ERRO_DISPOSITIVO_NAO_REGISTRADO, type MensagemPush, type ProvedorPush } from "./provedor-push.js";

// O Expo recomenda consultar o recibo ~15 min depois do envio (antes disso ele pode não existir).
const ESPERA_RECIBOS_MS = 15 * 60_000;
// Memória limitada: o que excede é descartado (o pior caso é não invalidar um token AGORA; o próximo envio a ele avisa).
const MAXIMO_RECIBOS_PENDENTES = 10_000;
// Janela da trava contra o mesmo fato chegar duas vezes ao mesmo aparelho (republicação, retry).
const JANELA_DEDUPLICACAO_MS = 60 * 60_000;

// O que o push diz: nunca o conteúdo nem o autor (passa por Expo e Google). Só o endereço da conversa.
function avisoDeNovaMensagem(evento: NotificacaoNovaMensagem, alvo: AlvoPush): Omit<MensagemPush, "token"> {
  return {
    titulo: TITULO_PUSH_NOVA_MENSAGEM,
    texto: TEXTO_PUSH_NOVA_MENSAGEM,
    dados: { v: 1, evento: "nova-mensagem", identidadeId: alvo.identidadeId, conversaId: evento.conversaId },
    canal: CANAL_PUSH_MENSAGENS,
  };
}

/**
 * PUSH — assinante do fato `notificacao-nova-mensagem`, que o notificador já decidiu (destinatários,
 * nunca a identidade remetente). Nenhuma regra nova de quem é avisado aqui, só a ENTREGA:
 * identidade destinatária → contas que podem operá-la → dispositivos válidos; no máximo UM push por
 * dispositivo e nunca para a CONTA que enviou (inclusive a de um visitante).
 *
 * Roda depois do commit e fora da transação: falhar aqui só perde o push, nunca desfaz a mensagem.
 * Sem novas tentativas: a mensagem continua na lista e nas não lidas para quando o app abrir.
 *
 * A deduplicação e os recibos ficam em MEMÓRIA desta instância: valem enquanto a API roda em uma só
 * (mesma condição de presença/digitando, CLAUDE.md seção 5). Reiniciar perde só a trava de um fato
 * já entregue, que não volta a ser publicado.
 */
export function criarServicoPush({
  banco,
  eventosMensagens,
  provedor,
  aoFalhar,
  agora = () => Date.now(),
  intervaloRecibosMs = ESPERA_RECIBOS_MS,
}: {
  banco: Banco;
  eventosMensagens: CanalEventosMensagens;
  provedor: ProvedorPush;
  aoFalhar: (erro: unknown) => void;
  agora?: () => number;
  intervaloRecibosMs?: number;
}) {
  const emAndamento = new Set<Promise<void>>();
  const enviados = new Map<string, number>();
  let recibosPendentes: { id: string; token: string; enviadoEm: number }[] = [];

  function jaEnviado(chave: string): boolean {
    const momento = agora();
    for (const [enviado, em] of enviados) {
      if (momento - em <= JANELA_DEDUPLICACAO_MS) break;
      enviados.delete(enviado);
    }
    if (enviados.has(chave)) return true;
    enviados.set(chave, momento);
    return false;
  }

  async function processar(evento: NotificacaoNovaMensagem): Promise<void> {
    const alvos = await buscarAlvosPush(banco, evento.destinatariosIdentidadeIds);
    const porDispositivo = new Map<string, AlvoPush>();
    for (const alvo of alvos) {
      if (alvo.usuarioId === evento.operadorUsuarioId || porDispositivo.has(alvo.dispositivoId)) continue;
      porDispositivo.set(alvo.dispositivoId, alvo);
    }
    const escolhidos = [...porDispositivo.values()].filter((alvo) => !jaEnviado(`mensagem:${evento.mensagemId}:${alvo.dispositivoId}`));
    if (escolhidos.length === 0) return;

    const mensagens = escolhidos.map((alvo) => ({ token: alvo.token, ...avisoDeNovaMensagem(evento, alvo) }));
    const tickets = await provedor.enviar(mensagens);
    const invalidos: string[] = [];
    tickets.forEach((ticket, indice) => {
      const token = mensagens[indice]?.token;
      if (!token) return;
      if (ticket.status === "ok") recibosPendentes.push({ id: ticket.id, token, enviadoEm: agora() });
      else if (ticket.erro === ERRO_DISPOSITIVO_NAO_REGISTRADO) invalidos.push(token);
    });
    if (recibosPendentes.length > MAXIMO_RECIBOS_PENDENTES) recibosPendentes = recibosPendentes.slice(-MAXIMO_RECIBOS_PENDENTES);
    await invalidarTokensPush(banco, invalidos);
  }

  const cancelar = eventosMensagens.inscrever((evento) => {
    if (evento.tipo !== "notificacao-nova-mensagem") return;
    const execucao = processar(evento).catch(aoFalhar);
    emAndamento.add(execucao);
    void execucao.finally(() => emAndamento.delete(execucao));
  });

  /** Recibos de envios com mais de 15 min: token morto (`DeviceNotRegistered`) deixa de receber. Uma consulta só por envio. */
  async function verificarRecibos(): Promise<void> {
    const limite = agora() - ESPERA_RECIBOS_MS;
    const prontos = recibosPendentes.filter((pendente) => pendente.enviadoEm <= limite);
    if (prontos.length === 0) return;
    recibosPendentes = recibosPendentes.filter((pendente) => pendente.enviadoEm > limite);
    try {
      const recibos = await provedor.consultarRecibos(prontos.map((pendente) => pendente.id));
      const invalidos = prontos.filter((pendente) => {
        const recibo = recibos.get(pendente.id);
        return recibo?.status === "erro" && recibo.erro === ERRO_DISPOSITIVO_NAO_REGISTRADO;
      });
      await invalidarTokensPush(
        banco,
        invalidos.map((pendente) => pendente.token),
      );
    } catch (erro) {
      aoFalhar(erro);
    }
  }

  const relogio = setInterval(() => void verificarRecibos(), intervaloRecibosMs);
  relogio.unref();

  // Espera os envios em curso (testes e encerramento).
  async function ocioso() {
    while (emAndamento.size > 0) await Promise.all([...emAndamento]);
  }

  return {
    verificarRecibos,
    ocioso,
    async encerrar() {
      cancelar();
      clearInterval(relogio);
      await ocioso();
    },
  };
}
