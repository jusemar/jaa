/*
 * AÇÃO INDISPONÍVEL QUE EXPLICA O PORQUÊ.
 *
 * O atributo `disabled` do HTML some com o clique: a pessoa toca e nada acontece, sem saber por quê.
 * Aqui a ação PARECE indisponível (`aria-disabled` + aparência apagada), a ação real não roda, e o
 * toque — ou Enter/Espaço, porque o botão continua focável — chama a explicação.
 */

export const APARENCIA_INDISPONIVEL = "cursor-not-allowed opacity-50";

/** Props do botão: com `motivo`, o clique explica; sem ele, executa a ação normalmente. */
export function acaoOuExplicacao(motivo: string | null | undefined, aoExplicar: (() => void) | undefined, acao: () => void): { "aria-disabled"?: true; onClick: () => void } {
  return motivo ? { "aria-disabled": true, onClick: () => aoExplicar?.() } : { onClick: acao };
}
