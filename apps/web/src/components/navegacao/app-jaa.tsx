"use client";

import type { ContaAtual } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { AreaContatos } from "@/features/contatos/components/area-contatos";
import { MensageiroTecnico } from "@/features/conversas/components/mensageiro-tecnico";
import { AreaEmpresas } from "@/features/empresas/components/area-empresas";
import { AreaMinhasEntregas } from "@/features/entregas/components/area-minhas-entregas";
import { AreaLogisticaEmpresa } from "@/features/entregas/components/area-logistica-empresa";
import { SeletorIdentidade } from "@/features/identidades/components/seletor-identidade";
import { useIdentidadeAtiva } from "@/features/identidades/hooks/use-identidade-ativa";
import { AreaPedidosEmpresa } from "@/features/pedidos/components/area-pedidos-empresa";
import { AreaPerfil } from "@/features/perfil/components/area-perfil";
import { AreaProdutos } from "@/features/produtos/components/area-produtos";
import { Botao, Carregando, Secao } from "@/components/ui/primitivos";
import { areaValida, areasDaIdentidade } from "./areas";
import { NavegacaoApp } from "./navegacao-app";

/*
 * O APLICATIVO depois de entrar.
 *
 * UMA área por vez. A pilha antiga — empresas, pedidos, saídas, entregadores, operação, zonas e o
 * mensageiro, tudo aberto ao mesmo tempo na mesma página — era o principal problema de usabilidade:
 * nada tinha foco e no celular era impossível achar o que interessava.
 *
 * CONVERSAS ocupa a tela inteira (dois painéis, como na referência de UI/UX aprovada); as demais
 * áreas são uma coluna de conteúdo com respiro e largura de leitura.
 *
 * A área aberta vive no ENDEREÇO (#pedidos). Assim o F5 volta para onde a pessoa estava, o botão
 * "voltar" do navegador funciona e um link leva direto à tela certa.
 */

function areaDoEndereco(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.hash.replace(/^#/, "") || null;
}

export function AppJaa({ conta, aoSair, saindo }: { conta: ContaAtual; aoSair: () => void; saindo: boolean }) {
  const identidadePessoalId = conta.identidadePessoal?.id ?? "";
  const identidades = useIdentidadeAtiva(identidadePessoalId);
  const [areaPedida, setAreaPedida] = useState<string | null>(null);
  const [conversaAberta, setConversaAberta] = useState(false);

  // Primeira leitura só no cliente (o servidor não conhece o #, e ler no primeiro render quebraria a
  // hidratação) e depois a cada "voltar" do navegador.
  useEffect(() => {
    const aoMudar = () => setAreaPedida(areaDoEndereco());
    void Promise.resolve().then(aoMudar);
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);

  const areas = areasDaIdentidade(identidades.ativa);
  const areaAtiva = areaValida(areas, areaPedida);

  function abrir(id: string) {
    setAreaPedida(id);
    if (typeof window !== "undefined") window.location.hash = id;
  }

  const ativa = identidades.ativa;
  const ehEmpresa = ativa?.tipo === "empresarial";
  const ehConversas = areaAtiva === "conversas";
  const registrarConversaAberta = useCallback((aberta: boolean) => setConversaAberta(aberta), []);

  const sair = (
    <Botao aparencia="discreto" disabled={saindo} onClick={aoSair} aria-label="Sair da conta" className="!min-h-10 !px-2 text-[0.62rem]">
      {saindo ? "Saindo…" : "Sair"}
    </Botao>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-fundo">
      <NavegacaoApp
        areas={areas}
        areaAtiva={areaAtiva}
        aoAbrir={abrir}
        ocultarNoCelular={ehConversas && conversaAberta}
        rodape={
          <>
            <SeletorIdentidade
              compacto
              operaveis={identidades.operaveis}
              ativa={ativa}
              erro={identidades.erro}
              aoSelecionar={(identidadeId) => void identidades.selecionar(identidadeId)}
            />
            {sair}
          </>
        }
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Celular: a marca e a identidade atuante no topo. Some quando a conversa toma a tela. */}
        <div
          className={`shrink-0 items-center gap-2 border-b border-borda bg-superficie px-3 py-2 md:hidden ${ehConversas && conversaAberta ? "hidden" : "flex"}`}
          style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
        >
          <span aria-hidden className="fonte-display grid h-9 w-9 place-items-center rounded-[0.7rem_0.7rem_0.7rem_0.25rem] bg-conteudo text-base font-bold text-marca-conteudo">
            J
          </span>
          <div className="min-w-0 flex-1">
            <SeletorIdentidade
              operaveis={identidades.operaveis}
              ativa={ativa}
              erro={identidades.erro}
              aoSelecionar={(identidadeId) => void identidades.selecionar(identidadeId)}
            />
          </div>
          {sair}
        </div>

        {!ativa && <Carregando texto="Carregando suas identidades…" />}

        {ativa && ehConversas && (
          // `key`: trocar de identidade recomeça inbox, conversa aberta, confirmações e avisos do zero.
          <MensageiroTecnico
            key={ativa.identidadeId}
            identidadeId={ativa.identidadeId}
            tipoIdentidade={ativa.tipo}
            aoAlterarConversaAberta={registrarConversaAberta}
          />
        )}

        {ativa && !ehConversas && (
          // pb-24 no celular: a barra de navegação inferior não pode cobrir o fim do conteúdo.
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4 md:px-8 md:pb-10">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
              {areaAtiva === "contatos" && <AreaContatos key={ativa.identidadeId} aoAbrirConversa={() => abrir("conversas")} />}

              {areaAtiva === "entregas" && <AreaMinhasEntregas />}

              {areaAtiva === "perfil" && (
                <div className="flex flex-col gap-8">
                  <AreaPerfil key={ativa.identidadeId} ehEmpresa={ehEmpresa} />
                  {!ehEmpresa && (
                    <Secao titulo="Minhas empresas" descricao="Crie uma empresa para vender pelo Jaa. Para administrá-la, escolha-a em “Agindo como”.">
                      <AreaEmpresas aoEmpresaCriada={() => void identidades.recarregar()} />
                    </Secao>
                  )}
                </div>
              )}

              {ativa.tipo === "empresarial" && areaAtiva === "pedidos" && (
                <AreaPedidosEmpresa key={ativa.empresa.id} empresaId={ativa.empresa.id} nomeEmpresa={ativa.nomeExibicao} />
              )}

              {ativa.tipo === "empresarial" && areaAtiva === "produtos" && (
                <AreaProdutos key={ativa.empresa.id} empresaId={ativa.empresa.id} nomeEmpresa={ativa.nomeExibicao} />
              )}

              {ativa.tipo === "empresarial" && areaAtiva === "logistica" && (
                <AreaLogisticaEmpresa key={ativa.empresa.id} empresaId={ativa.empresa.id} nomeEmpresa={ativa.nomeExibicao} />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
