import type { Banco } from "@jaa/banco";
import type { CanalEventosMensagens, EventoDominioMensagens } from "../../mensagens/lib/eventos-mensagens.js";
import { contarNaoLidas } from "../repositorios/repositorio-conversas.js";

/**
 * Mantém os clientes com a contagem de não lidas CORRETA, sem contador paralelo: sempre que um fato
 * persistido pode mudá-la, recalcula a partir do banco e publica `nao-lidas-atualizadas` só para a
 * identidade afetada.
 * - mensagem criada → destinatários (nunca o remetente); edição → nada;
 * - leitura → leitor; excluída para todos → quem ainda a via (menos o autor); excluída para mim → ela.
 * Concorrência: um recálculo por vez para cada (identidade, conversa); pedidos durante um recálculo
 * são agrupados em UM novo recálculo depois dele. Assim o último valor emitido reflete o último commit,
 * mesmo com eventos simultâneos.
 */
export function criarAtualizadorNaoLidas({
  banco,
  eventosMensagens,
  aoFalhar,
}: {
  banco: Banco;
  eventosMensagens: CanalEventosMensagens;
  aoFalhar: (erro: unknown) => void;
}) {
  const emAndamento = new Map<string, Promise<void>>();
  const repetir = new Set<string>();

  async function recalcular(identidadeId: string, conversaId: string) {
    const naoLidas = await contarNaoLidas(banco, conversaId, identidadeId);
    if (naoLidas === null) return;
    eventosMensagens.publicar({ tipo: "nao-lidas-atualizadas", conversaId, naoLidas, destinatariosIdentidadeIds: [identidadeId] });
  }

  function agendar(identidadeId: string, conversaId: string) {
    const chave = `${identidadeId}|${conversaId}`;
    if (emAndamento.has(chave)) {
      repetir.add(chave);
      return;
    }
    const execucao = (async () => {
      do {
        repetir.delete(chave);
        try {
          await recalcular(identidadeId, conversaId);
        } catch (erro) {
          aoFalhar(erro);
        }
      } while (repetir.has(chave));
    })().finally(() => emAndamento.delete(chave));
    emAndamento.set(chave, execucao);
  }

  function identidadesAfetadas(evento: EventoDominioMensagens): { conversaId: string; identidadeIds: string[] } | null {
    switch (evento.tipo) {
      case "mensagem-criada":
        return {
          conversaId: evento.mensagem.conversaId,
          identidadeIds: evento.destinatariosIdentidadeIds.filter((id) => id !== evento.mensagem.remetenteIdentidadeId),
        };
      case "mensagem-atualizada":
        return evento.mensagem.excluidaParaTodosEm
          ? {
              conversaId: evento.mensagem.conversaId,
              identidadeIds: evento.destinatariosIdentidadeIds.filter((id) => id !== evento.mensagem.remetenteIdentidadeId),
            }
          : null;
      case "mensagens-lidas":
        return { conversaId: evento.conversaId, identidadeIds: [evento.leitorIdentidadeId] };
      case "mensagem-excluida-para-mim":
        return { conversaId: evento.conversaId, identidadeIds: evento.destinatariosIdentidadeIds };
      case "mensagens-entregues":
      case "nao-lidas-atualizadas":
      case "notificacao-nova-mensagem":
        return null;
    }
  }

  const cancelar = eventosMensagens.inscrever((evento) => {
    const afetadas = identidadesAfetadas(evento);
    for (const identidadeId of afetadas?.identidadeIds ?? []) agendar(identidadeId, afetadas!.conversaId);
  });

  return {
    // Para de ouvir e espera os recálculos em andamento (antes de fechar o banco).
    async encerrar() {
      cancelar();
      while (emAndamento.size > 0) await Promise.all([...emAndamento.values()]);
    },
  };
}
