"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useState } from "react";

/**
 * MENU "⋯" de ações SECUNDÁRIAS de uma linha (ex.: apagar). É o lugar das ações que não devem disputar
 * atenção com a tarefa principal: ficam a um toque de distância, nunca espalhadas pela tela.
 *
 * Radix cuida de foco, teclado, Esc e leitor de tela — o mesmo menu das conversas. O conteúdo é
 * desenhado acima de folhas e diálogos (`z-[1100]`). Alvo de toque de 44px.
 */
export interface ItemDoMenuMais {
  id: string;
  rotulo: string;
  perigosa?: boolean;
  aoEscolher: () => void;
}

export function MenuMais({
  rotulo,
  itens,
  disabled = false,
  vertical = false,
}: {
  rotulo: string;
  itens: ItemDoMenuMais[];
  disabled?: boolean;
  // Três pontos na vertical (⋮): o desenho de "mais ações" em listas de aplicativo.
  vertical?: boolean;
}) {
  /*
   * O menu (Radix) só existe no navegador: ele é desenhado num portal e gera identificadores próprios.
   * Na marcação inicial vai só o botão, idêntico — o menu é ligado a ele logo depois de montar.
   */
  const [noNavegador, setNoNavegador] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() => setNoNavegador(true));
  }, []);

  const gatilho = (
    <button
      type="button"
      data-menu-mais
      aria-label={rotulo}
      title={rotulo}
      aria-haspopup="menu"
      disabled={disabled}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg leading-none text-conteudo-suave hover:bg-realce hover:text-conteudo focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {vertical ? "⋮" : "⋯"}
    </button>
  );
  if (!noNavegador) return gatilho;

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{gatilho}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-[1100] min-w-44 rounded-jaa border border-borda bg-superficie p-1 text-sm shadow-suave">
          {itens.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              data-item-menu={item.id}
              onSelect={item.aoEscolher}
              className={`flex min-h-11 cursor-pointer items-center rounded-jaa-compacto px-3 outline-none data-[highlighted]:bg-realce ${item.perigosa ? "text-perigo" : "text-conteudo"}`}
            >
              {item.rotulo}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
