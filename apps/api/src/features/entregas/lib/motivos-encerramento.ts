/*
 * Motivo gravado na atribuição (e na parada) quando o pedido é ENTREGUE. `motivo_encerramento` é texto
 * livre no banco, e é este valor que identifica "a atribuição que terminou em entrega" — o crédito do
 * histórico do entregador depende dele. Quem grava e quem consulta usam esta mesma constante.
 * Não mudar o texto: as linhas já gravadas deixariam de ser reconhecidas.
 */
export const MOTIVO_ENCERRAMENTO_PEDIDO_ENTREGUE = "Pedido entregue";
