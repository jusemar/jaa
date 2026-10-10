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
// Cada ação acontece somente depois do clique visual, sem disparar eventos de usuário.
const etapas = [
  { alvo: "repouso", clique: false, cardapio: false, montagem: false, duracao: 2200 },
  { alvo: "controle", clique: false, cardapio: false, montagem: false, duracao: 1600 },
  { alvo: "controle", clique: true, cardapio: false, montagem: false, duracao: 450 },
  { alvo: "controle", clique: false, cardapio: true, montagem: false, duracao: 1600 },
  { alvo: "prato", clique: false, cardapio: true, montagem: false, duracao: 1600 },
  { alvo: "prato", clique: true, cardapio: true, montagem: false, duracao: 450 },
  { alvo: "prato", clique: false, cardapio: true, montagem: true, duracao: 3000 },
  { alvo: "controle", clique: false, cardapio: true, montagem: true, duracao: 1600 },
  { alvo: "controle", clique: true, cardapio: true, montagem: true, duracao: 450 },
  { alvo: "controle", clique: false, cardapio: false, montagem: false, duracao: 1600 },
] as const;
const totalCiclos = 4;

// Offset local evita distorções causadas pela rotação decorativa da demonstração.
function centroLocal(elemento: HTMLElement, raiz: HTMLElement) {
  let x = elemento.offsetWidth / 2;
  let y = elemento.offsetHeight / 2;
  let atual: HTMLElement | null = elemento;
  while (atual && atual !== raiz) {
    x += atual.offsetLeft;
    y += atual.offsetTop;
    atual = atual.offsetParent instanceof HTMLElement ? atual.offsetParent : null;
  }
  return { x, y };
}

export function useConversaCardapioDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);
  const [paginaAtiva, setPaginaAtiva] = useState(true);
  const [passo, setPasso] = useState(0);
  const [manual, setManual] = useState<boolean | null>(null);
  const interrompido = useRef(false);
  const reduzido = useSyncExternalStore(assinarMovimento, movimentoReduzido, noServidor);
  const concluido = passo >= etapas.length * totalCiclos;
  const etapa = etapas[concluido ? etapas.length - 1 : passo % etapas.length];
  const automatico = !reduzido && manual === null && !concluido;
  const cardapio = manual ?? (!reduzido && etapa.cardapio);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const painel = elemento.querySelector<HTMLElement>(".lp-cardapio-demo-painel");
    const conteudo = painel?.firstElementChild;
    function medir() {
      if (!elemento) return;
      const controle = elemento.querySelector<HTMLElement>(".lp-abrir-cardapio");
      const seta = elemento.querySelector<HTMLElement>("[data-montar-produto]");
      if (controle) {
        const { x, y } = centroLocal(controle, elemento);
        elemento.style.setProperty("--lp-cursor-controle-x", `${x}px`);
        elemento.style.setProperty("--lp-cursor-controle-y", `${y}px`);
        elemento.style.setProperty("--lp-cursor-repouso-x", `${elemento.clientWidth * 0.55}px`);
        elemento.style.setProperty("--lp-cursor-repouso-y", `${y + 280}px`);
      }
      // A seta some ao abrir a montagem; mantemos o último ponto durante esse passo.
      if (seta && conteudo instanceof HTMLElement) {
        const { x, y } = centroLocal(seta, elemento);
        elemento.style.setProperty("--lp-cursor-prato-x", `${x}px`);
        elemento.style.setProperty("--lp-cursor-prato-y", `${y}px`);
        elemento.style.setProperty("--lp-altura-cardapio", `${conteudo.offsetHeight}px`);
      }
    }
    const tamanho = new ResizeObserver(medir);
    tamanho.observe(elemento);
    if (conteudo) tamanho.observe(conteudo);
    window.addEventListener("resize", medir);
    const observador = new IntersectionObserver(
      ([entrada]) => setVisivel(entrada.isIntersecting),
      { threshold: 0.25 },
    );
    const atualizarPagina = () => setPaginaAtiva(!document.hidden);
    atualizarPagina();
    observador.observe(elemento);
    document.addEventListener("visibilitychange", atualizarPagina);
    return () => {
      observador.disconnect();
      tamanho.disconnect();
      window.removeEventListener("resize", medir);
      document.removeEventListener("visibilitychange", atualizarPagina);
    };
  }, []);

  useEffect(() => {
    if (!visivel || !paginaAtiva || !automatico) return;
    const tempo = window.setTimeout(() => {
      if (!interrompido.current) setPasso((atual) => atual + 1);
    }, etapa.duracao);
    return () => window.clearTimeout(tempo);
  }, [visivel, paginaAtiva, automatico, passo, etapa.duracao]);

  return {
    ref,
    cardapio,
    automatico,
    montagem: automatico && etapa.montagem,
    cursor: visivel && paginaAtiva && automatico ? etapa.alvo : undefined,
    clique: etapa.clique,
    interromper() {
      interrompido.current = true;
      setManual((atual) => atual ?? cardapio);
    },
    alternar() {
      interrompido.current = true;
      setManual(!cardapio);
    },
  };
}
