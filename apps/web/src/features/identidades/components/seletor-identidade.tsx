"use client";

import type { IdentidadeOperavel } from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { Selo } from "@/components/ui/primitivos";

/*
 * "AGINDO COMO" — trocar de identidade é a decisão mais importante da interface do Jaa, porque muda
 * a caixa de entrada inteira. Por isso é um seletor VISUAL (avatar + nome + @usuario), não um
 * <select> técnico: a pessoa precisa RECONHECER quem ela é agora, não ler uma linha de texto.
 *
 * Continua sendo apenas intenção de interface: quem autoriza cada chamada é o servidor.
 */

export function SeletorIdentidade({
  operaveis,
  ativa,
  erro,
  aoSelecionar,
  compacto = false,
}: {
  operaveis: IdentidadeOperavel[];
  ativa: IdentidadeOperavel | null;
  erro: string | null;
  aoSelecionar: (identidadeId: string) => void;
  // Só o avatar, para caber na coluna estreita de navegação do desktop.
  compacto?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const container = useRef<HTMLDivElement | null>(null);

  // Clicar fora e Esc fecham: menu que só fecha no próprio botão prende o usuário.
  useEffect(() => {
    if (!aberto) return;
    function aoClicar(evento: MouseEvent) {
      if (!container.current?.contains(evento.target as Node)) setAberto(false);
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  const pessoais = operaveis.filter((identidade) => identidade.tipo === "pessoal");
  const empresariais = operaveis.filter((identidade) => identidade.tipo === "empresarial");

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Agindo como ${ativa?.nomeExibicao ?? "—"}. Trocar identidade`}
        onClick={() => setAberto((valor) => !valor)}
        className={
          compacto
            ? "grid h-11 w-11 place-items-center rounded-jaa-compacto hover:bg-realce"
            : "flex min-h-11 w-full items-center gap-2 rounded-jaa-compacto border border-borda bg-superficie px-2 text-left hover:bg-realce"
        }
      >
        {ativa && <AvatarIdentidade identidade={{ identidadeId: ativa.identidadeId, nomeExibicao: ativa.nomeExibicao, tipo: ativa.tipo }} tamanho="pequeno" />}
        {!compacto && (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] uppercase tracking-wide text-conteudo-suave">Agindo como</span>
              <span data-identidade-ativa={ativa?.identidadeId} data-tipo-identidade-ativa={ativa?.tipo} className="truncate text-sm font-medium">
                {ativa?.nomeExibicao ?? "—"}
              </span>
            </span>
            <span aria-hidden className="px-1 text-conteudo-suave">
              ⌄
            </span>
          </>
        )}
        {compacto && <span data-identidade-ativa={ativa?.identidadeId} data-tipo-identidade-ativa={ativa?.tipo} className="sr-only">{ativa?.nomeExibicao ?? "—"}</span>}
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label="Escolher identidade"
          className={`absolute bottom-full z-30 mb-1 flex min-w-60 flex-col overflow-hidden rounded-jaa border border-borda bg-superficie shadow-suave ${compacto ? "left-0" : "left-0 w-full md:bottom-auto md:top-full md:mb-0 md:mt-1"}`}
        >
          <Grupo titulo="Pessoa" itens={pessoais} ativa={ativa} aoSelecionar={aoSelecionar} fechar={() => setAberto(false)} />
          {empresariais.length > 0 && <Grupo titulo="Empresas" itens={empresariais} ativa={ativa} aoSelecionar={aoSelecionar} fechar={() => setAberto(false)} />}
        </div>
      )}

      {ativa?.tipo === "empresarial" && !compacto && (
        <p role="note" className="mt-1 px-1 text-[11px] leading-snug text-aviso">
          Você responde como {ativa.nomeExibicao}. Suas conversas pessoais não aparecem aqui.
        </p>
      )}
      {erro && !compacto && (
        <p role="alert" className="mt-1 px-1 text-xs text-perigo">
          {erro}
        </p>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  itens,
  ativa,
  aoSelecionar,
  fechar,
}: {
  titulo: string;
  itens: IdentidadeOperavel[];
  ativa: IdentidadeOperavel | null;
  aoSelecionar: (identidadeId: string) => void;
  fechar: () => void;
}) {
  return (
    <div className="flex flex-col border-b border-borda last:border-b-0">
      <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-conteudo-suave">{titulo}</p>
      {itens.map((identidade) => {
        const selecionada = identidade.identidadeId === ativa?.identidadeId;
        return (
          <button
            key={identidade.identidadeId}
            type="button"
            role="menuitemradio"
            aria-checked={selecionada}
            data-opcao-identidade={identidade.identidadeId}
            onClick={() => {
              aoSelecionar(identidade.identidadeId);
              fechar();
            }}
            className={`flex min-h-12 items-center gap-2 px-3 text-left text-sm hover:bg-superficie-suave ${selecionada ? "bg-marca-suave" : ""}`}
          >
            <AvatarIdentidade identidade={{ identidadeId: identidade.identidadeId, nomeExibicao: identidade.nomeExibicao, tipo: identidade.tipo }} tamanho="pequeno" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{identidade.nomeExibicao}</span>
              <span className="truncate text-xs text-conteudo-suave">@{identidade.nomeUsuario}</span>
            </span>
            {selecionada && <Selo tom="marca">Ativa</Selo>}
          </button>
        );
      })}
    </div>
  );
}
