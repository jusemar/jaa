import type { CodigoErroApi } from "@jaa/contratos";

/*
 * AÇÃO QUE EXIGE CONTA. Quem decide é o SERVIDOR: um visitante do Link do Jaa que tenta algo que
 * depende de conta permanente recebe CONTA_NECESSARIA (ou, na 6ª conversa nova,
 * LIMITE_DE_CONVERSAS_ATINGIDO). Qualquer AÇÃO recusada assim avisa o app, que mostra
 * "Criar conta / Entrar" no lugar onde a pessoa está — sem cada tela precisar conhecer a regra.
 *
 * Leituras (GET) não avisam: abrir uma área nunca deve saltar uma janela na cara da pessoa; quem lê
 * trata a recusa na própria tela.
 */
const EVENTO = "jaa:conta-necessaria";

const CODIGOS_DE_CONTA: ReadonlySet<CodigoErroApi> = new Set(["CONTA_NECESSARIA", "LIMITE_DE_CONVERSAS_ATINGIDO"]);

export function exigeConta(codigo: CodigoErroApi | null): boolean {
  return codigo !== null && CODIGOS_DE_CONTA.has(codigo);
}

export function sinalizarContaNecessaria(motivo: string | null = null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string | null>(EVENTO, { detail: motivo }));
}

/** Chamado na recusa de uma requisição: só ações (não GET) recusadas por falta de conta avisam o app. */
export function avisarSeExigirConta(metodo: string | undefined, codigo: CodigoErroApi | null, mensagem: string): void {
  if ((metodo ?? "GET").toUpperCase() !== "GET" && exigeConta(codigo)) sinalizarContaNecessaria(mensagem);
}

export function ouvirContaNecessaria(aoExigir: (motivo: string | null) => void): () => void {
  const ouvinte = (evento: Event) => aoExigir(evento instanceof CustomEvent && typeof evento.detail === "string" ? evento.detail : null);
  window.addEventListener(EVENTO, ouvinte);
  return () => window.removeEventListener(EVENTO, ouvinte);
}
