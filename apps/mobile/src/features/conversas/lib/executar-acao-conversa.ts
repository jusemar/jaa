import type { AcaoConversa, AlvoAcaoConversa } from "../components/acoes-conversa";
import { bloquearIdentidade, desbloquearIdentidade } from "./api-bloqueios";
import { apagarConversa, limparConversa } from "./api-conversas";

/*
 * Ações do menu da conversa NO SERVIDOR — a mesma chamada para o toque longo na lista e para o cabeçalho
 * da conversa aberta. Limpar/apagar mexem SÓ no estado desta identidade; bloquear/desbloquear só existem
 * com pessoa (o servidor confere tudo de novo). Devolve a mensagem de erro, ou null.
 */
export async function executarAcaoConversaNoServidor(acao: AcaoConversa, alvo: AlvoAcaoConversa): Promise<string | null> {
  if (acao === "limpar" || acao === "apagar") {
    const resposta = acao === "limpar" ? await limparConversa(alvo.id) : await apagarConversa(alvo.id);
    return resposta.ok ? null : resposta.mensagem;
  }
  const resposta = acao === "bloquear" ? await bloquearIdentidade(alvo.outraIdentidade.identidadeId) : await desbloquearIdentidade(alvo.outraIdentidade.identidadeId);
  return resposta.ok ? null : resposta.mensagem;
}
