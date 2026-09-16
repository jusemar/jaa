import type { Banco } from "@jaa/banco";
import { PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO } from "@jaa/contratos";
import { buscarDadosPublicosIdentidade } from "../../identidades/repositorios/repositorio-identidades.js";
import type { CanalEventosMensagens } from "../../mensagens/lib/eventos-mensagens.js";

/**
 * Domínio de notificações de novas mensagens (Fase 1, sem provedor externo).
 * Regra única, no servidor: cada mensagem CRIADA gera uma notificação para cada destinatário, nunca
 * para o remetente. Retry idempotente não recria a mensagem, logo não notifica de novo; edição e
 * exclusão não são mensagem nova. O estado persistente continua sendo lista + não lidas.
 *
 * Canais: publica `notificacao-nova-mensagem` no canal interno. Hoje o realtime entrega às conexões
 * do destinatário (aviso in-app); push Web/mobile futuro será outro assinante deste mesmo fato,
 * decidindo por conta própria (ex.: só quando não houver conexão ativa), sem mudar esta regra.
 */
export function criarNotificadorNovasMensagens({
  banco,
  eventosMensagens,
  aoFalhar,
}: {
  banco: Banco;
  eventosMensagens: CanalEventosMensagens;
  aoFalhar: (erro: unknown) => void;
}) {
  const emAndamento = new Set<Promise<void>>();

  const cancelar = eventosMensagens.inscrever((evento) => {
    if (evento.tipo !== "mensagem-criada") return;
    const { mensagem } = evento;
    const destinatarios = evento.destinatariosIdentidadeIds.filter((id) => id !== mensagem.remetenteIdentidadeId);
    if (destinatarios.length === 0) return;

    const execucao = (async () => {
      try {
        const remetente = await buscarDadosPublicosIdentidade(banco, mensagem.remetenteIdentidadeId);
        if (!remetente) return;
        const caracteres = [...mensagem.conteudo];
        eventosMensagens.publicar({
          tipo: "notificacao-nova-mensagem",
          conversaId: mensagem.conversaId,
          mensagemId: mensagem.id,
          remetente,
          previaConteudo: caracteres.slice(0, PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO).join(""),
          conteudoTruncado: caracteres.length > PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO,
          criadoEm: mensagem.criadoEm,
          destinatariosIdentidadeIds: destinatarios,
        });
      } catch (erro) {
        aoFalhar(erro);
      }
    })();
    emAndamento.add(execucao);
    void execucao.finally(() => emAndamento.delete(execucao));
  });

  return {
    async encerrar() {
      cancelar();
      await Promise.all([...emAndamento]);
    },
  };
}
