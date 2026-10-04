/**
 * Bloqueia a rolagem do fundo enquanto um diálogo de tela cheia está aberto e devolve a função que
 * RESTAURA exatamente o valor anterior (não um valor fixo: outro componente pode ter mudado antes).
 */
export function travarRolagem(elemento: { style: { overflow: string } }): () => void {
  const anterior = elemento.style.overflow;
  elemento.style.overflow = "hidden";
  return () => {
    elemento.style.overflow = anterior;
  };
}

export const ehTeclaDeFechar = (tecla: string) => tecla === "Escape";
