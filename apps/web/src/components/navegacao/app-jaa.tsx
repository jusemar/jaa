"use client";

import type { ContaAtual } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { MensageiroTecnico } from "@/features/conversas/components/mensageiro-tecnico";
import { useAvisosMensagens } from "@/features/conversas/hooks/use-avisos-mensagens";
import { AreaEmpresas } from "@/features/empresas/components/area-empresas";
import { AreaMinhasEntregas } from "@/features/entregas/components/area-minhas-entregas";
import { AreaLogisticaEmpresa } from "@/features/entregas/components/area-logistica-empresa";
import { SeletorIdentidade } from "@/features/identidades/components/seletor-identidade";
import { useIdentidadeAtiva } from "@/features/identidades/hooks/use-identidade-ativa";
import { AreaPedidosEmpresa } from "@/features/pedidos/components/area-pedidos-empresa";
import { usePedidosAguardando } from "@/features/pedidos/hooks/use-pedidos-aguardando";
import { AreaPerfil } from "@/features/perfil/components/area-perfil";
import { HorariosDeFuncionamento } from "@/features/empresas/components/horarios-de-funcionamento";
import { AreaProdutos } from "@/features/produtos/components/area-produtos";
import { AvisosDeAcao } from "@/components/ui/avisos";
import { Botao, Carregando, Secao } from "@/components/ui/primitivos";
import type { DestinoDoLink } from "@/features/link/lib/link-do-jaa";
import { areaValida, areasDaIdentidade } from "./areas";
import { NavegacaoApp } from "./navegacao-app";

/*
 * O APLICATIVO depois de entrar.
 *
 * UMA área por vez. A pilha antiga — empresas, pedidos, saídas, entregadores, operação, zonas e o
 * mensageiro, tudo aberto ao mesmo tempo na mesma página — era o principal problema de usabilidade:
 * nada tinha foco e no celular era impossível achar o que interessava.
 *
 * CONVERSAS e CONTATOS são o mensageiro em mestre-detalhe (painel lateral + conversa); as demais
 * áreas são uma coluna de conteúdo com respiro e largura de leitura.
 *
 * A área aberta vive no ENDEREÇO (#pedidos). Assim o F5 volta para onde a pessoa estava, o botão
 * "voltar" do navegador funciona e um link leva direto à tela certa.
 */

function areaDoEndereco(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.hash.replace(/^#/, "") || null;
}

export function AppJaa({
  conta,
  aoSair,
  saindo,
  destinoInicial,
}: {
  /*
   * A pessoa chegou por um Link do Jaa (`/@usuario`): o app abre direto na conversa com aquela
   * identidade — já autenticada ou logo depois de entrar/cadastrar. É sempre uma conversa do próprio
   * Jaa (um @usuario), nunca um endereço.
   */
  destinoInicial?: DestinoDoLink | undefined;
  conta: ContaAtual;
  aoSair: () => void;
  saindo: boolean;
}) {
  const identidadePessoalId = conta.identidadePessoal?.id ?? "";
  const identidades = useIdentidadeAtiva(identidadePessoalId);
  const [areaPedida, setAreaPedida] = useState<string | null>(null);
  const [conversaAberta, setConversaAberta] = useState(false);

  // Chegando por um Link do Jaa, a área é Conversas — qualquer que seja o # que veio no endereço.
  // (Antes da leitura abaixo: ela já encontra o endereço certo.)
  const chegouPorLink = destinoInicial !== undefined;
  useEffect(() => {
    if (chegouPorLink) window.location.hash = "conversas";
  }, [chegouPorLink]);

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

  // "Conversar com…" de qualquer área: vai para Conversas e abre a conversa DIRETA com esse @usuario.
  const [conversaSolicitada, setConversaSolicitada] = useState<string | null>(destinoInicial?.nomeUsuario ?? null);
  // O cardápio abre junto só para a conversa do link; conversas pedidas depois abrem normalmente.
  const [cardapioDaSolicitada, setCardapioDaSolicitada] = useState(destinoInicial?.abrirCardapio ?? false);
  function abrirConversaCom(nomeUsuario: string) {
    setCardapioDaSolicitada(false);
    setConversaSolicitada(nomeUsuario);
    abrir("conversas");
  }
  const conversaAtendida = useCallback(() => setConversaSolicitada(null), []);

  const ativa = identidades.ativa;
  // Não lidas + som de mensagem recebida da identidade ATUANTE, em qualquer área (não só em Conversas).
  // Agindo como EMPRESA, um pedido novo toca o som de pedido (não o de mensagem).
  const naoLidasConversas = useAvisosMensagens(ativa?.identidadeId ?? null, ativa?.tipo === "empresarial");
  // Pedido não é conversa: o que espera a empresa aparece no item Pedidos, nunca em Conversas.
  const pedidosAguardando = usePedidosAguardando(ativa?.tipo === "empresarial" ? ativa.empresa.id : null);
  /*
   * A identidade PESSOAL da conta, da mesma lista operável que alimenta o "Agindo como": é ela que
   * o topo da lista de conversas mostra, mesmo quando a pessoa está agindo como empresa.
   */
  const pessoal =
    identidades.operaveis.find((identidade) => identidade.tipo === "pessoal") ??
    null;
  const ehEmpresa = ativa?.tipo === "empresarial";
  /*
   * Conversas e Contatos são o MESMO mensageiro (uma instância só): muda apenas o que o painel lateral
   * lista. Por isso a conversa aberta sobrevive à troca entre as duas áreas.
   */
  const ehConversas = areaAtiva === "conversas" || areaAtiva === "contatos";
  const registrarConversaAberta = useCallback(
    (aberta: boolean) => setConversaAberta(aberta),
    [],
  );

  const sair = (
    <Botao
      aparencia="discreto"
      disabled={saindo}
      onClick={aoSair}
      aria-label="Sair da conta"
      className="!min-h-10 !px-2 text-[0.62rem]"
    >
      {saindo ? "Saindo…" : "Sair"}
    </Botao>
  );

  return (
    /*
     * O app inteiro dentro de um contêiner CENTRADO e com bordas laterais, como na referência de
     * UI/UX aprovada: em telas muito largas a interface não se esparrama, e as colunas (navegação,
     * conversas, conversa, pedido) mantêm proporção legível.
     */
    <div className="mx-auto flex h-dvh w-full max-w-[100rem] overflow-hidden border-borda bg-fundo shadow-suave lg:border-x">
      <AvisosDeAcao />
      <NavegacaoApp
        areas={areas}
        areaAtiva={areaAtiva}
        aoAbrir={abrir}
        ocultarNoCelular={ehConversas && conversaAberta}
        naoLidasConversas={naoLidasConversas}
        pedidosAguardando={pedidosAguardando}
        rodape={
          <>
            <SeletorIdentidade
              compacto
              operaveis={identidades.operaveis}
              ativa={ativa}
              erro={identidades.erro}
              aoSelecionar={(identidadeId) =>
                void identidades.selecionar(identidadeId)
              }
            />
            {sair}
          </>
        }
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Celular: a marca e a identidade atuante no topo. Some quando a conversa toma a tela. */}
        <div
          className={`shrink-0 items-center gap-2.5 border-b border-borda bg-superficie px-4 py-3 md:hidden ${ehConversas && conversaAberta ? "hidden" : "flex"}`}
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          {/* Só a identidade, limpa. "Sair da conta" fica no fim do menu dela. */}
          <div className="min-w-0 flex-1">
            <SeletorIdentidade
              operaveis={identidades.operaveis}
              ativa={ativa}
              erro={identidades.erro}
              aoSelecionar={(identidadeId) =>
                void identidades.selecionar(identidadeId)
              }
              rodapeDoMenu={
                <button type="button" role="menuitem" data-sair-da-conta disabled={saindo} onClick={aoSair} className="flex min-h-12 items-center px-3 text-left text-sm text-conteudo-suave hover:bg-superficie-suave disabled:opacity-50">
                  {saindo ? "Saindo…" : "Sair da conta"}
                </button>
              }
            />
          </div>
        </div>

        {!ativa && <Carregando texto="Carregando suas identidades…" />}

        {ativa && ehConversas && (
          // `key`: trocar de identidade recomeça inbox, conversa aberta, confirmações e avisos do zero.
          <MensageiroTecnico
            key={ativa.identidadeId}
            identidadeId={ativa.identidadeId}
            painel={areaAtiva === "contatos" ? "contatos" : "conversas"}
            tipoIdentidade={ativa.tipo}
            pessoa={pessoal}
            aoAlterarConversaAberta={registrarConversaAberta}
            abrirConversaCom={conversaSolicitada}
            abrirCardapioDaSolicitada={cardapioDaSolicitada}
            aoAbrirConversaSolicitada={conversaAtendida}
            /*
             * "Meus pedidos" no cabeçalho da conversa leva para a área que JÁ existe — e só aparece
             * quando ela existe para a identidade atual. Nada de destino inventado.
             */
            {...(areas.some((area) => area.id === "pedidos")
              ? { aoAbrirPedidos: () => abrir("pedidos") }
              : {})}
          />
        )}

        {ativa && !ehConversas && (
          // pb-24 no celular: a barra de navegação inferior não pode cobrir o fim do conteúdo.
          /*
           * MESMA superfície do painel de Conversas (`bg-superficie`), e não o cinza do fundo: Produtos,
           * Pedidos, Logística e Perfil são a mesma aplicação que a lista de conversas. Quem separa os
           * blocos aqui dentro são as bordas (`border-borda`) e a superfície suave, como lá.
           */
          <div data-area-de-trabalho className="min-h-0 flex-1 overflow-y-auto bg-superficie px-4 pb-24 pt-4 md:px-8 md:pb-10">
            {/* Produtos tem tela de duas colunas (formulário + prévia do cliente): precisa de mais largura. */}
            <div className={`mx-auto flex w-full flex-col gap-6 ${areaAtiva === "produtos" ? "max-w-6xl" : "max-w-3xl"}`}>
              {areaAtiva === "entregas" && <AreaMinhasEntregas aoAbrirConversa={abrirConversaCom} />}

              {areaAtiva === "perfil" && (
                <div className="flex flex-col gap-8">
                  <AreaPerfil key={ativa.identidadeId} ehEmpresa={ehEmpresa} />
                  {/* Da EMPRESA: quando ela recebe pedidos. Fica no perfil dela, junto dos dados públicos. */}
                  {ativa.tipo === "empresarial" && <HorariosDeFuncionamento key={ativa.empresa.id} empresaId={ativa.empresa.id} />}
                  {!ehEmpresa && (
                    <Secao
                      titulo="Minhas empresas"
                      descricao="Crie uma empresa para vender pelo Jaaa. Para administrá-la, toque no seu nome (no topo) e escolha a empresa."
                    >
                      <AreaEmpresas
                        aoEmpresaCriada={() => void identidades.recarregar()}
                      />
                    </Secao>
                  )}
                </div>
              )}

              {ativa.tipo === "empresarial" && areaAtiva === "pedidos" && (
                <AreaPedidosEmpresa
                  key={ativa.empresa.id}
                  empresaId={ativa.empresa.id}
                  nomeEmpresa={ativa.nomeExibicao}
                  aoAbrirConversa={abrirConversaCom}
                />
              )}

              {ativa.tipo === "empresarial" && areaAtiva === "produtos" && (
                <AreaProdutos
                  key={ativa.empresa.id}
                  empresaId={ativa.empresa.id}
                  nomeEmpresa={ativa.nomeExibicao}
                />
              )}

              {ativa.tipo === "empresarial" && areaAtiva === "logistica" && (
                <AreaLogisticaEmpresa
                  key={ativa.empresa.id}
                  empresaId={ativa.empresa.id}
                  nomeEmpresa={ativa.nomeExibicao}
                  aoAbrirConversa={abrirConversaCom}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
