import type { EmpresaPublica, Pedido, PedidoDaEmpresa } from "@jaa/contratos";
import type { PedidoComItensRegistro, PedidoDaEmpresaRegistro } from "../repositorios/repositorio-pedidos.js";

// Campos escolhidos um a um: nada de conta, membros, permissões, empresaId interno — e nenhum dado de
// pagamento além da forma escolhida (o Jaa não processa pagamento).
export function serializarPedido(registro: PedidoComItensRegistro, empresa: EmpresaPublica): Pedido {
  const { pedido, itens, cliente, historico, destino } = registro;
  return {
    id: pedido.id,
    numero: pedido.numero,
    origem: pedido.origem,
    conversaId: pedido.conversaId,
    empresa,
    cliente,
    status: pedido.status,
    motivoCancelamento: pedido.motivoCancelamento,
    historico,
    formaPagamentoNaEntrega: pedido.formaPagamentoNaEntrega,
    trocoParaCentavos: pedido.trocoParaCentavos,
    totalCentavos: pedido.totalCentavos,
    itens,
    destino,
    criadoEm: pedido.criadoEm.toISOString(),
    atualizadoEm: pedido.atualizadoEm.toISOString(),
  };
}

// Linha da lista operacional da empresa: nunca a conta que operou nem o empresaId interno.
export function serializarPedidoDaEmpresa(registro: PedidoDaEmpresaRegistro): PedidoDaEmpresa {
  return {
    id: registro.id,
    numero: registro.numero,
    status: registro.status,
    cliente: registro.cliente,
    conversaId: registro.conversaId,
    quantidadeItens: registro.quantidadeItens,
    totalCentavos: registro.totalCentavos,
    formaPagamentoNaEntrega: registro.formaPagamentoNaEntrega,
    trocoParaCentavos: registro.trocoParaCentavos,
    criadoEm: registro.criadoEm.toISOString(),
  };
}
