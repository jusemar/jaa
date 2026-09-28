"use client";

/*
 * BLOQUEIO na interface: um símbolo discreto (🚫) junto de quem está do outro lado — sem aviso
 * textual ocupando a conversa. Quem decide é o servidor (recusa envio e "digitando"); o símbolo só
 * diz a verdade, com nome acessível e dica ao passar o mouse.
 */
export const DESCRICAO_BLOQUEIO = "Comunicação bloqueada com este usuário";

export function SimboloBloqueio() {
  return (
    <span role="img" aria-label={DESCRICAO_BLOQUEIO} title={DESCRICAO_BLOQUEIO} data-comunicacao-bloqueada className="shrink-0 text-sm leading-none">
      🚫
    </span>
  );
}
