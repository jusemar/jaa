// Salas TÉCNICAS internas, sempre definidas pelo servidor (o cliente não entra em salas).
// Não substituem a autorização de domínio, feita na API/banco ANTES de o servidor inscrever o socket.
// sessao:<id>     → encerrar só as conexões de uma sessão (logout/revogação).
// identidade:<id> → entregar eventos a todas as conexões de uma identidade (abas e dispositivos).
// presenca:<id>   → conexões autorizadas a observar a presença da identidade (conversa aberta com ela).
// conversa:<id>   → conexões de participantes que observam a conversa (recebem "digitando").
export const salaDaSessao = (sessaoId: string) => `sessao:${sessaoId}`;
export const salaDaIdentidade = (identidadeId: string) => `identidade:${identidadeId}`;
export const salaDePresenca = (identidadeId: string) => `presenca:${identidadeId}`;
export const salaDaConversa = (conversaId: string) => `conversa:${conversaId}`;
