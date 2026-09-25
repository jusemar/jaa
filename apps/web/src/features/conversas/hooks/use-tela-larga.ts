"use client";

import { useSyncExternalStore } from "react";

/*
 * Tela larga o bastante para a conversa ter TRÊS colunas (conversas | conversa | seu pedido).
 *
 * 80rem é o mesmo ponto do `xl:` usado no layout, declarado aqui uma vez só: o CSS decide a POSIÇÃO
 * dos painéis e este hook decide o que faz sentido ficar ABERTO por padrão — duas perguntas
 * diferentes que precisam concordar sobre o mesmo limite, senão o painel abriria sozinho numa
 * largura em que ele ainda cobre a conversa.
 *
 * Por que 80rem e não 64rem: a barra de navegação e a lista de conversas ficam fora desta conta, e
 * a 1024px a coluna do meio sobraria com ~318px.
 */
const CONSULTA_TELA_LARGA = "(min-width: 80rem)";

function assinar(notificar: () => void) {
  const consulta = window.matchMedia(CONSULTA_TELA_LARGA);
  consulta.addEventListener("change", notificar);
  return () => consulta.removeEventListener("change", notificar);
}

export function useTelaLarga(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA_TELA_LARGA).matches,
    // No servidor não há tela: o padrão é o celular, e o primeiro render no cliente corrige.
    () => false,
  );
}
