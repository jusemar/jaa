import type { ReactNode } from "react";
import { IconeConversa } from "@/components/ui/icones";
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

/*
 * Item de navegação no padrão da referência: ícone de 20px com rótulo pequeno e em NEGRITO embaixo;
 * ativo em jade, inativo em texto suave. É a mesma linguagem nos dois lugares (coluna e barra).
 */
function Item({ area, ativa, aoAbrir, compacto }: { area: AreaApp; ativa: boolean; aoAbrir: (id: string) => void; compacto: boolean }) {
  const { Icone } = area;
  return (
    <button
      type="button"
      data-area={area.id}
      aria-current={ativa ? "page" : undefined}
      onClick={() => aoAbrir(area.id)}
      title={area.descricao}
      className={
        compacto
          ? `flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] transition-colors ${ativa ? "font-bold text-marca" : "text-conteudo-suave"}`
          : `flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-1 rounded-jaa-compacto text-[10px] transition-colors ${
              ativa ? "bg-marca-suave font-bold text-marca" : "text-conteudo-suave hover:bg-realce hover:text-conteudo"
            }`
      }
    >
      <Icone className="h-5 w-5" />
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
        {/* Marca no topo da coluna, no mesmo formato do avatar da referência: círculo jade com o ícone. */}
        <span aria-hidden className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-marca text-marca-conteudo shadow-suave">
          <IconeConversa className="h-5 w-5" />
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
