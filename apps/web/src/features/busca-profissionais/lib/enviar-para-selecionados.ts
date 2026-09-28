import type { ResultadoApi } from "@/lib/api";

/*
 * MENSAGEM para os profissionais SELECIONADOS pelo mesmo mensageiro de sempre: para cada um, abre (ou
 * reaproveita) a conversa DIRETA e envia uma mensagem normal nela. Nada de grupo, broadcast ou
 * "mensagem profissional": são N conversas independentes, cada envio autorizado pelo servidor.
 *
 * Idempotência igual à do compositor: cada destinatário tem o SEU `idCliente` por tentativa. Reenviar
 * depois de uma falha usa o mesmo id — quem já recebeu não recebe de novo.
 */

export interface Destinatario {
  identidadeId: string;
  nomeUsuario: string;
}

export type SituacaoEnvio = { tipo: "enviada"; conversaId: string } | { tipo: "erro"; mensagem: string };

export interface DependenciasEnvio {
  abrirConversa: (nomeUsuario: string) => Promise<ResultadoApi<{ id: string }>>;
  enviarMensagem: (conversaId: string, entrada: { idCliente: string; conteudo: string }) => Promise<ResultadoApi<unknown>>;
  novoIdCliente: () => string;
}

export async function enviarParaSelecionados(
  destinatarios: readonly Destinatario[],
  conteudo: string,
  // Ids desta TENTATIVA por destinatário (mesmo conteúdo = mesma tentativa). Preenchido aqui.
  idsCliente: Map<string, string>,
  dependencias: DependenciasEnvio,
  // Quem já recebeu nesta tentativa não é enviado de novo.
  jaEnviadas: ReadonlyMap<string, SituacaoEnvio> = new Map(),
): Promise<Map<string, SituacaoEnvio>> {
  const situacoes = new Map<string, SituacaoEnvio>();
  // Um por vez: previsível para o servidor e para quem lê o progresso.
  for (const destinatario of destinatarios) {
    const anterior = jaEnviadas.get(destinatario.identidadeId);
    if (anterior?.tipo === "enviada") {
      situacoes.set(destinatario.identidadeId, anterior);
      continue;
    }
    const conversa = await dependencias.abrirConversa(destinatario.nomeUsuario);
    if (!conversa.ok) {
      situacoes.set(destinatario.identidadeId, { tipo: "erro", mensagem: conversa.mensagem });
      continue;
    }
    let idCliente = idsCliente.get(destinatario.identidadeId);
    if (!idCliente) {
      idCliente = dependencias.novoIdCliente();
      idsCliente.set(destinatario.identidadeId, idCliente);
    }
    const envio = await dependencias.enviarMensagem(conversa.dados.id, { idCliente, conteudo });
    situacoes.set(destinatario.identidadeId, envio.ok ? { tipo: "enviada", conversaId: conversa.dados.id } : { tipo: "erro", mensagem: envio.mensagem });
  }
  return situacoes;
}
