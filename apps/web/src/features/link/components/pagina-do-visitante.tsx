"use client";

import type { IdentidadePublica } from "@jaa/contratos";
import type { ReactNode } from "react";
import { Cartao } from "@/components/ui/primitivos";
import { CatalogoDaEmpresa } from "@/features/catalogo/components/catalogo-da-empresa";
import { ApresentacaoIdentidade } from "@/features/perfil/components/apresentacao-identidade";

/*
 * O QUE UM VISITANTE (sem conta) VÊ ao abrir o Link do Jaa: com quem ele vai falar, a ENTRADA de
 * sempre já na página (sem botão intermediário) e, se for empresa com cardápio, o cardápio — o MESMO
 * componente e a mesma consulta pública da conversa, só para olhar.
 *
 * Nada privado acontece aqui: tentar adicionar um produto traz a entrada à vista (`aoPedirEntrada`), e
 * depois dela o Jaa abre a conversa com esta identidade. O carrinho do Jaa é guardado por identidade de
 * quem compra — visitante ainda não tem uma —, então a escolha dos produtos acontece depois de entrar.
 *
 * LAYOUT: tudo no fluxo normal da página, que rola inteira — nenhuma barra fixa, nenhuma altura fixa.
 * Assim nada fica cortado em tela baixa nem atrás do teclado. Coluna única até `lg`; a partir daí o
 * cardápio fica à esquerda e a identidade + entrada à direita, acompanhando a rolagem.
 */
export function PaginaDoVisitante({ identidade, entrada, aoPedirEntrada }: { identidade: IdentidadePublica; entrada: ReactNode; aoPedirEntrada: () => void }) {
  const { temCardapio } = identidade;
  return (
    <main data-pagina-do-visitante className="min-h-dvh bg-fundo" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div
        className={`mx-auto flex w-full flex-col gap-4 px-4 py-6 ${
          temCardapio ? "max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6" : "max-w-md"
        }`}
      >
        <p className="text-center text-2xl font-bold text-marca lg:col-span-2">Jaa</p>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-2">
          <Cartao className="flex flex-col gap-3 p-5">
            <ApresentacaoIdentidade identidade={identidade} fraseStatus={identidade.fraseStatus} sobre={identidade.sobre} />
            {temCardapio && (
              // Só na coluna única: em telas largas o cardápio já está ao lado.
              <a href="#cardapio" data-ver-cardapio className="self-start text-sm font-medium text-marca underline decoration-1 underline-offset-2 lg:hidden">
                Ver o cardápio
              </a>
            )}
          </Cartao>
          {entrada}
        </div>

        {temCardapio && (
          <Cartao className="min-w-0 scroll-mt-4 overflow-hidden lg:col-start-1 lg:row-start-2">
            <div id="cardapio">
              <CatalogoDaEmpresa
                identidadeEmpresaId={identidade.identidadeId}
                // Escolher um produto é o primeiro passo do pedido: exige conta.
                aoAdicionarAoCarrinho={aoPedirEntrada}
              />
            </div>
          </Cartao>
        )}
      </div>
    </main>
  );
}
