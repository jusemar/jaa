"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const consulta = "(prefers-reduced-motion: reduce)";
function assinarMovimento(avisar: () => void) {
  const preferencia = window.matchMedia(consulta);
  preferencia.addEventListener("change", avisar);
  return () => preferencia.removeEventListener("change", avisar);
}
const movimentoReduzido = () => window.matchMedia(consulta).matches;
const noServidor = () => true;

// Uma passagem, pausada fora da tela. A interação manual encerra a narrativa automática.
export function useNarrativa(ultimoPasso: number, intervalo = 1000) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);
  const [passo, setPasso] = useState(0);
  const [manual, setManual] = useState(false);
  const reduzido = useSyncExternalStore(
    assinarMovimento,
    movimentoReduzido,
    noServidor,
  );

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento || !("IntersectionObserver" in window)) return;
    const observador = new IntersectionObserver(
      ([entrada]) => setVisivel(entrada.isIntersecting),
      { threshold: 0.25 },
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (!visivel || manual || reduzido || passo >= ultimoPasso) return;
    const tempo = window.setTimeout(
      () => setPasso((atual) => atual + 1),
      intervalo,
    );
    return () => window.clearTimeout(tempo);
  }, [visivel, manual, reduzido, passo, ultimoPasso, intervalo]);

  return {
    ref,
    passo: reduzido && !manual ? ultimoPasso : passo,
    reduzido,
    escolher(proximo: number) {
      setManual(true);
      setPasso(proximo);
    },
    repetir() {
      setManual(false);
      setPasso(0);
    },
  };
}
