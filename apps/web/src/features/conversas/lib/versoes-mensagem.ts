import type { Mensagem } from "@jaa/contratos";

// Duas cópias da MESMA mensagem (mesmo id) vindas de fontes diferentes (histórico HTTP, resposta da
// edição, evento realtime) podem chegar fora de ordem. Vence a versão mais recente do conteúdo:
// exclusão para todos é definitiva; senão, a de edição mais nova (null = nunca editada).
// Empate: a que acabou de chegar.
export function versaoMaisRecente(atual: Mensagem, recebida: Mensagem): Mensagem {
  if (atual.excluidaEm && !recebida.excluidaEm) return atual;
  if (recebida.excluidaEm) return recebida;
  const edicaoAtual = atual.editadaEm ?? "";
  const edicaoRecebida = recebida.editadaEm ?? "";
  return edicaoAtual > edicaoRecebida ? atual : recebida;
}
