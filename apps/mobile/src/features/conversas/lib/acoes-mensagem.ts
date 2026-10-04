import { PREVIA_AUDIO, PREVIA_IMAGEM, type Mensagem } from "@jaa/contratos";

/*
 * AÇÕES DE UMA MENSAGEM — as MESMAS regras do menu da Web (`balao-mensagem.tsx` de lá), na mesma ordem:
 * Responder, Editar, Apagar para mim, Apagar para todos. É só o que a interface OFERECE; quem autoriza
 * cada ação continua sendo a API.
 */
export type IdAcaoMensagem = "responder" | "editar" | "apagar-para-mim" | "apagar-para-todos";

export const ROTULO_ACAO_MENSAGEM: Record<IdAcaoMensagem, string> = {
  responder: "Responder",
  editar: "Editar",
  "apagar-para-mim": "Apagar para mim",
  "apagar-para-todos": "Apagar para todos",
};

type MensagemParaAcoes = Pick<Mensagem, "remetenteIdentidadeId" | "excluidaEm" | "tipo" | "pedido">;

export function acoesDisponiveisDaMensagem(mensagem: MensagemParaAcoes, identidadeAtualId: string): IdAcaoMensagem[] {
  const propria = mensagem.remetenteIdentidadeId === identidadeAtualId;
  const excluida = mensagem.excluidaEm !== null;
  const ehPedido = mensagem.tipo === "pedido" && mensagem.pedido !== null;
  // Imagem e áudio se respondem e se apagam, mas não se editam.
  const ehMidia = mensagem.tipo === "imagem" || mensagem.tipo === "audio";
  const acoes: IdAcaoMensagem[] = [];
  // Card de pedido não se responde (o pedido tem a sua própria tela); mensagem excluída também não.
  if (!excluida && !ehPedido) acoes.push("responder");
  // Só texto próprio: imagem (nem a legenda), áudio e pedido não se editam.
  if (propria && !excluida && !ehPedido && !ehMidia) acoes.push("editar");
  acoes.push("apagar-para-mim");
  if (propria && !excluida) acoes.push("apagar-para-todos");
  return acoes;
}

/** Texto da mensagem em prévias (resposta em composição, lista): imagem sem legenda = "Foto"; áudio = "Áudio". */
export function conteudoParaPrevia(mensagem: Pick<Mensagem, "tipo" | "conteudo">): string {
  if (mensagem.tipo === "audio") return PREVIA_AUDIO;
  return mensagem.tipo === "imagem" && mensagem.conteudo === "" ? PREVIA_IMAGEM : mensagem.conteudo;
}
