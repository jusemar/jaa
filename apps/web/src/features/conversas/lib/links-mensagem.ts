import { nomeUsuarioDoSegmento } from "@/features/link/lib/link-do-jaa";

/*
 * LINKS em mensagem de texto. A mensagem NUNCA vira HTML: ela é dividida em pedaços — texto comum e
 * endereços — e cada pedaço é renderizado pelo React (`TextoComLinks`), que escapa tudo.
 *
 * Só http:// e https:// viram link. `javascript:`, `data:`, endereços sem protocolo e qualquer coisa
 * que o navegador não consiga interpretar como URL continuam sendo texto.
 */
export type TrechoMensagem = { tipo: "texto"; texto: string } | { tipo: "link"; texto: string; url: string };

const CANDIDATO = /https?:\/\/[^\s<>"'`]+/gi;
// Pontuação que encerra a frase, não o endereço ("veja https://jaa.com.br/@pizza.").
const PONTUACAO_FINAL = /[.,;:!?…]+$/;

function apararFim(endereco: string): string {
  let aparado = endereco.replace(PONTUACAO_FINAL, "");
  // Parêntese/colchete de fechamento sem o par correspondente pertence à frase: "(https://x.y/a)".
  for (const [abre, fecha] of [["(", ")"], ["[", "]"]] as const) {
    while (aparado.endsWith(fecha) && aparado.split(fecha).length > aparado.split(abre).length) {
      aparado = aparado.slice(0, -1).replace(PONTUACAO_FINAL, "");
    }
  }
  return aparado;
}

function urlSegura(endereco: string): string | null {
  try {
    const url = new URL(endereco);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "" ? url.href : null;
  } catch {
    return null;
  }
}

export function segmentarMensagem(texto: string): TrechoMensagem[] {
  const trechos: TrechoMensagem[] = [];
  let cursor = 0;
  const acrescentarTexto = (parte: string) => {
    if (!parte) return;
    const ultimo = trechos.at(-1);
    if (ultimo?.tipo === "texto") ultimo.texto += parte;
    else trechos.push({ tipo: "texto", texto: parte });
  };

  for (const achado of texto.matchAll(CANDIDATO)) {
    const inicio = achado.index;
    const endereco = apararFim(achado[0]);
    const url = urlSegura(endereco);
    if (!url) continue;
    acrescentarTexto(texto.slice(cursor, inicio));
    // O texto exibido é exatamente o que a pessoa escreveu; `url` é o destino já validado.
    trechos.push({ tipo: "link", texto: endereco, url });
    cursor = inicio + endereco.length;
  }
  acrescentarTexto(texto.slice(cursor));
  return trechos;
}

/**
 * Para onde um link leva:
 * - `conversa`: Link do Jaa (`/@usuario`) DESTE site — abre a conversa aqui mesmo, sem recarregar;
 * - `interno`: outro endereço deste site — mesma aba;
 * - `externo`: outro site — nova aba, sem dar à página aberta acesso a esta (`noopener`) nem informar
 *   de onde veio (`noreferrer`).
 */
export type DestinoDoLinkDaMensagem = { tipo: "conversa"; nomeUsuario: string } | { tipo: "interno" } | { tipo: "externo" };

export function destinoDoLink(url: string, origemDoSite: string | null): DestinoDoLinkDaMensagem {
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return { tipo: "externo" };
  }
  if (!origemDoSite || alvo.origin !== origemDoSite) return { tipo: "externo" };
  const segmentos = alvo.pathname.split("/").filter(Boolean);
  const nomeUsuario = segmentos.length === 1 ? nomeUsuarioDoSegmento(segmentos[0] as string) : null;
  return nomeUsuario ? { tipo: "conversa", nomeUsuario } : { tipo: "interno" };
}

/** Texto que a ação "Copiar" leva para a área de transferência; null = nada copiável. */
export function textoCopiavel(mensagem: { conteudo: string; excluidaEm: string | null }): string | null {
  if (mensagem.excluidaEm !== null) return null;
  return mensagem.conteudo.trim() === "" ? null : mensagem.conteudo;
}
