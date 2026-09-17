import type { ReactNode } from "react";
import type { AreaApp } from "./areas";

/*
 * NAVEGAÇÃO — coluna estreita no desktop, barra inferior no celular.
 *
 * É a mesma lista nos dois lugares; muda a posição. No desktop virou uma COLUNA DE ÍCONES estreita
 * para que a conversa (dois painéis: lista + mensagens) fique com a largura que merece — é ela a
 * tela principal do produto, e não o menu.
 *
 * No celular a barra fica embaixo, onde o polegar alcança, e respeita a área segura do aparelho.
 * `aria-current="page"` marca a área aberta para leitores de tela: a cor sozinha não conta.
 */

function Item({ area, ativa, aoAbrir, compacto }: { area: AreaApp; ativa: boolean; aoAbrir: (id: string) => void; compacto: boolean }) {
  return (
    <button
      type="button"
      data-area={area.id}
      aria-current={ativa ? "page" : undefined}
      onClick={() => aoAbrir(area.id)}
      title={area.descricao}
      className={
        compacto
          ? `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium ${ativa ? "text-marca" : "text-conteudo-suave"}`
          : `flex min-h-[3.25rem] w-full flex-col items-center justify-center gap-0.5 rounded-jaa text-[0.62rem] font-medium ${
              ativa ? "bg-marca-suave text-marca" : "text-conteudo-suave hover:bg-superficie-suave"
            }`
      }
    >
      <span aria-hidden className="text-lg leading-none">
        {area.icone}
      </span>
      <span className="max-w-full truncate">{area.rotulo}</span>
    </button>
  );
}

export function NavegacaoApp({
  areas,
  areaAtiva,
  aoAbrir,
  rodape,
  ocultarNoCelular = false,
}: {
  areas: AreaApp[];
  areaAtiva: string;
  aoAbrir: (id: string) => void;
  // Identidade atuante e sair, no pé da coluna (desktop) e do lado da marca (celular).
  rodape?: ReactNode;
  // Conversa aberta no celular ocupa a tela inteira: a barra sai do caminho.
  ocultarNoCelular?: boolean;
}) {
  return (
    <>
      {/* Desktop: coluna de ícones. Some no celular, onde a barra de baixo assume. */}
      <nav aria-label="Navegação principal" className="hidden h-dvh w-[4.75rem] shrink-0 flex-col gap-1 border-r border-borda bg-superficie px-2 py-3 md:flex">
        <span aria-hidden className="fonte-display mx-auto mb-2 grid h-10 w-10 place-items-center rounded-[0.85rem_0.85rem_0.85rem_0.3rem] bg-conteudo text-xl font-bold text-marca-conteudo shadow-suave">
          J
        </span>
        {areas.map((area) => (
          <Item key={area.id} area={area} ativa={area.id === areaAtiva} aoAbrir={aoAbrir} compacto={false} />
        ))}
        {rodape && <div className="mt-auto flex flex-col items-center gap-1">{rodape}</div>}
      </nav>

      {/* Celular: barra inferior, no alcance do polegar e acima da barra de gestos. */}
      <nav
        aria-label="Navegação principal"
        className={`fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-superficie md:hidden ${ocultarNoCelular ? "hidden" : "flex"}`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {areas.map((area) => (
          <Item key={area.id} area={area} ativa={area.id === areaAtiva} aoAbrir={aoAbrir} compacto />
        ))}
      </nav>
    </>
  );
}
