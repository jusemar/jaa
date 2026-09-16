import type { ResumoPedido } from "@jaa/contratos";
import type { PedidoComItensRegistro } from "../repositorios/repositorio-pedidos.js";

// Mesmo resumo que o card da conversa exibe (o SQL em resumo-pedido-sql.ts monta o mesmo formato):
// o card referencia o Pedido real, então basta substituir o resumo quando o status muda.
export function montarResumoPedido({ pedido, itens }: PedidoComItensRegistro): ResumoPedido {
  return {
    id: pedido.id,
    status: pedido.status,
    formaPagamentoNaEntrega: pedido.formaPagamentoNaEntrega,
    trocoParaCentavos: pedido.trocoParaCentavos,
    totalCentavos: pedido.totalCentavos,
    itens: itens.map((item) => ({ nomeProduto: item.nomeProduto, quantidade: item.quantidade, subtotalCentavos: item.subtotalCentavos })),
  };
}
