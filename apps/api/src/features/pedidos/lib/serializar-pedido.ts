import type { EmpresaPublica, Pedido } from "@jaa/contratos";
import type { PedidoComItensRegistro } from "../repositorios/repositorio-pedidos.js";

// Campos escolhidos um a um: nada de conta, membros, permissões, empresaId interno — e nenhum dado de
// pagamento além da forma escolhida (o Jaa não processa pagamento).
export function serializarPedido(registro: PedidoComItensRegistro, empresa: EmpresaPublica): Pedido {
  const { pedido, itens, cliente } = registro;
  return {
    id: pedido.id,
    origem: pedido.origem,
    conversaId: pedido.conversaId,
    empresa,
    cliente,
    status: pedido.status,
    formaPagamentoNaEntrega: pedido.formaPagamentoNaEntrega,
    trocoParaCentavos: pedido.trocoParaCentavos,
    totalCentavos: pedido.totalCentavos,
    itens,
    criadoEm: pedido.criadoEm.toISOString(),
    atualizadoEm: pedido.atualizadoEm.toISOString(),
  };
}
