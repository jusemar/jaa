/*
 * `idCliente` das tentativas de envio (mensagem, pedido): um UUID v4 que identifica A TENTATIVA, para o
 * servidor não duplicar num reenvio. É chave de idempotência, não segredo — por isso `Math.random` basta
 * (o React Native não tem `crypto.randomUUID`, que é o que a Web usa).
 */
export function gerarIdCliente(): string {
  const hex = (quantidade: number) => Array.from({ length: quantidade }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const variante = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variante}${hex(3)}-${hex(12)}`;
}
