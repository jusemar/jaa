"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { IconeSetaBaixo } from "@/components/ui/icones";
import { ehTeclaDeFechar } from "../lib/trava-rolagem";

/*
 * MENU DA MENSAGEM: uma seta discreta no canto superior direito do PRÓPRIO balão abre as ações
 * (responder, copiar, editar, apagar). Só aparecem as ações permitidas; quem autoriza cada uma é a API.
 *
 * Não depende de hover: a seta é um botão de verdade (foco por teclado, clique e toque) e fica sempre
 * visível em telas sem hover. Fecha ao escolher uma opção, ao clicar fora e com Esc.
 */

export type AcaoMensagem = {
  id: "responder" | "copiar" | "editar" | "apagar-para-mim" | "apagar-para-todos";
  rotulo: string;
  Icone: ComponentType<SVGProps<SVGSVGElement>>;
  executar: () => void;
  perigosa?: boolean;
};

// Altura do menu com as cinco ações + folga para o compositor (px).
const ALTURA_RESERVADA_MENU = 300;

export function MenuMensagem({
  acoes,
  emBalaoProprio,
  abertoInicialmente = false,
  aoMudarAberto,
}: {
  // Avisa o balão: a LINHA da mensagem com o menu aberto precisa subir acima das outras linhas.
  aoMudarAberto?: (aberto: boolean) => void;
  acoes: AcaoMensagem[];
  // Define a cor de fundo da seta (a do balão) e para que lado o menu abre sem sair da conversa.
  emBalaoProprio: boolean;
  abertoInicialmente?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoInicialmente);

  useEffect(() => {
    aoMudarAberto?.(aberto);
  }, [aberto, aoMudarAberto]);
  // Perto do fim da tela (última mensagem, logo acima do compositor) o menu abre PARA CIMA.
  const [paraCima, setParaCima] = useState(false);
  const container = useRef<HTMLDivElement | null>(null);
  const gatilho = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (evento: MouseEvent) => {
      if (!container.current?.contains(evento.target as Node)) setAberto(false);
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (!ehTeclaDeFechar(evento.key)) return;
      setAberto(false);
      // O foco volta para a seta: quem navega por teclado não perde o lugar.
      gatilho.current?.focus();
    };
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  if (acoes.length === 0) return null;

  return (
    <div ref={container} data-menu-mensagem className="absolute right-1 top-1 z-10">
      <button
        ref={gatilho}
        type="button"
        aria-label="Ações da mensagem"
        title="Ações da mensagem"
        aria-haspopup="menu"
        aria-expanded={aberto}
        data-gatilho-menu-mensagem
        onClick={(evento) => {
          const espacoAbaixo = window.innerHeight - evento.currentTarget.getBoundingClientRect().bottom;
          setParaCima(espacoAbaixo < ALTURA_RESERVADA_MENU);
          setAberto(!aberto);
        }}
        /*
         * Discreta: só aparece ao passar o mouse no balão, ao receber foco ou com o menu aberto. Em
         * telas sem hover (toque) fica sempre visível — não existe "passar o mouse" para revelá-la.
         */
        className={`grid h-6 w-6 place-items-center rounded-full text-conteudo-suave opacity-0 shadow-suave transition-opacity hover:text-conteudo focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 ${
          emBalaoProprio ? "bg-mensagem-enviada" : "bg-mensagem-recebida"
        } ${aberto ? "!opacity-100" : ""}`}
      >
        <IconeSetaBaixo className="h-4 w-4" />
      </button>

      {aberto && (
        <ul
          role="menu"
          aria-label="Ações da mensagem"
          className={`absolute z-20 ${paraCima ? "bottom-full mb-1" : "top-full mt-1"} flex min-w-48 flex-col rounded-jaa border border-borda bg-superficie py-1 text-sm text-conteudo shadow-suave ${
            emBalaoProprio ? "right-0" : "left-0"
          }`}
        >
          {acoes.map(({ id, rotulo, Icone, executar, perigosa }) => (
            <li key={id} role="none">
              <button
                type="button"
                role="menuitem"
                data-acao-mensagem={id}
                onClick={() => {
                  setAberto(false);
                  executar();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-superficie-suave focus-visible:bg-superficie-suave ${perigosa ? "text-perigo" : ""}`}
              >
                <Icone className="h-4 w-4 shrink-0" />
                {rotulo}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
