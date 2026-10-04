"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { IconePainelLateral } from "@/components/ui/icones";
import { preferenciaPainel } from "@/lib/preferencia-painel";

/*
 * MESTRE-DETALHE: painel lateral SECUNDÁRIO (lista de conversas, contatos…) + conteúdo principal, ao
 * lado da barra de navegação do Jaa — o formato dos mensageiros de desktop.
 *
 *   janela larga (a partir de `md`, quando a barra do Jaa é coluna):  | barra | painel | conteúdo |
 *   painel recolhido pela pessoa:                                      | barra | conteúdo          |
 *   janela estreita (celular):                    uma área por vez — painel OU conteúdo, com "voltar"
 *
 * O breakpoint é o MESMO da barra principal de propósito: assim nunca existem dois painéis lado a lado
 * com a navegação de celular (sem "voltar"), nem o contrário. Em `md` sobram ~692 px ao lado da barra:
 * 300 px de painel + ~390 px de conversa, que é a largura de um celular. Acima disso o painel cresce
 * até 24rem e o resto é do conteúdo. Nada disso depende de qual área está aberta.
 */

/** Painel recolhido/aberto: preferência visual deste navegador (o servidor não conhece). */
export function usePainelRecolhido(): { recolhido: boolean; alternar: () => void } {
  const recolhido = useSyncExternalStore(preferenciaPainel.assinar, preferenciaPainel.recolhido, () => false);
  return { recolhido, alternar: preferenciaPainel.alternar };
}

export function classesDoPainel({ recolhido, conteudoEmFoco }: { recolhido: boolean; conteudoEmFoco: boolean }): string {
  // Estreito: o painel é a tela, a menos que o conteúdo esteja em foco. Largo: coluna, a menos que recolhido.
  const estreito = conteudoEmFoco ? "hidden" : "flex";
  const largo = recolhido ? "md:hidden" : "md:flex";
  return `min-h-0 min-w-0 w-full flex-col border-borda bg-superficie ${estreito} ${largo} md:w-[clamp(18.75rem,30vw,24rem)] md:shrink-0 md:border-r`;
}

export function classesDoConteudo({ conteudoEmFoco }: { conteudoEmFoco: boolean }): string {
  // Estreito: só aparece quando está em foco. Largo: sempre visível, ocupando o que sobra.
  return `min-h-0 min-w-0 flex-1 flex-col ${conteudoEmFoco ? "flex" : "hidden"} md:flex`;
}

export function MestreDetalhe({
  rotuloPainel,
  painel,
  conteudo,
  conteudoEmFoco,
  recolhido,
}: {
  rotuloPainel: string;
  painel: ReactNode;
  conteudo: ReactNode;
  // Só importa na janela estreita: o conteúdo (ex.: a conversa aberta) toma a tela no lugar do painel.
  conteudoEmFoco: boolean;
  recolhido: boolean;
}) {
  return (
    <div
      data-mestre-detalhe
      data-painel={recolhido ? "recolhido" : "aberto"}
      data-conteudo-em-foco={conteudoEmFoco}
      className="flex min-h-0 min-w-0 flex-1"
    >
      <aside aria-label={rotuloPainel} data-painel-lateral className={classesDoPainel({ recolhido, conteudoEmFoco })}>
        {painel}
      </aside>
      <div data-conteudo-principal className={classesDoConteudo({ conteudoEmFoco })}>
        {conteudo}
      </div>
    </div>
  );
}

/*
 * RECOLHER / ABRIR o painel. Ícone de painel lateral (não é "voltar"). Só existe na janela larga: na
 * estreita o painel já é uma tela inteira e quem alterna é a navegação.
 */
export function BotaoPainelLateral({ recolhido, aoAlternar, className = "" }: { recolhido: boolean; aoAlternar: () => void; className?: string }) {
  const rotulo = recolhido ? "Abrir painel lateral" : "Recolher painel lateral";
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={!recolhido}
      data-alternar-painel={recolhido ? "abrir" : "recolher"}
      onClick={aoAlternar}
      className={`hidden h-9 w-9 shrink-0 place-items-center rounded-jaa-compacto text-conteudo-suave transition-colors hover:bg-realce hover:text-conteudo md:grid ${className}`}
    >
      <IconePainelLateral className="h-5 w-5" />
    </button>
  );
}
