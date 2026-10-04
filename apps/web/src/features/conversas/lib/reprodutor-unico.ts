/*
 * UM ÁUDIO POR VEZ: quando um player começa a tocar, o que estava tocando é pausado. Um registro
 * mínimo por página (não é gerenciador de mídia): guarda só "como pausar o atual".
 */
export function criarReprodutorUnico() {
  let pausarAtual: (() => void) | null = null;
  return {
    /** Chamado pelo player que VAI tocar; pausa o anterior (se for outro). */
    assumir(pausar: () => void) {
      if (pausarAtual && pausarAtual !== pausar) pausarAtual();
      pausarAtual = pausar;
    },
    /** Chamado quando o player pausa, termina ou sai da tela. */
    liberar(pausar: () => void) {
      if (pausarAtual === pausar) pausarAtual = null;
    },
  };
}

export const reprodutorUnico = criarReprodutorUnico();
