"use client";

import type { ContaAtual } from "@jaa/contratos";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { DialogoConfirmacao } from "@/components/ui/confirmacao";
import { Janela } from "@/components/ui/janela";
import { ouvirContaNecessaria } from "@/lib/conta-necessaria";
import { preferenciaPainel } from "@/lib/preferencia-painel";
import type { DestinoDoLink } from "@/features/link/lib/link-do-jaa";
import { areaComPainelLateral, areaValida, areasDaIdentidade } from "./areas";
import { NavegacaoApp } from "./navegacao-app";
import { ProvedorCapacidades, TITULO_CONTA_NECESSARIA, type CapacidadesSessao } from "./capacidades-sessao";

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
 *
 * VISITANTE do Link do Jaa: é ESTE mesmo app (mesma navegação, conversas, pesquisa, Perfil), não uma
 * tela à parte. O que muda são as CAPACIDADES (`capacidades-sessao`): o que exige conta continua à
 * vista e, ao ser usado, pede "Criar conta / Entrar". Quem garante é o servidor (CONTA_NECESSARIA);
 * toda AÇÃO recusada assim também abre a mesma janela.
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
  aoCriarConta,
  aoEntrar,
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
  // Visitante: levam à criação de conta / entrada (a conversa vai junto, decisão do servidor).
  aoCriarConta?: (() => void) | undefined;
  aoEntrar?: (() => void) | undefined;
}) {
  const identidadePessoalId = conta.identidadePessoal?.id ?? "";
  const visitante = conta.visitante ?? null;
  const identidades = useIdentidadeAtiva(identidadePessoalId, visitante);

  /*
   * "Crie sua conta para usar este recurso." — aberta por uma tela (antes de tentar) ou por QUALQUER
   * ação que o servidor recusou com CONTA_NECESSARIA. `undefined` = fechada; o texto é o motivo.
   */
  const [contaPedida, setContaPedida] = useState<string | null | undefined>(undefined);
  /*
   * SAIR DA SESSÃO DE VISITANTE: o mesmo logout da conta (Better Auth), com uma confirmação antes —
   * depois de sair, aquela sessão não volta (não há conta para entrar nela de novo).
   */
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  useEffect(() => ouvirContaNecessaria((motivo) => setContaPedida(motivo)), []);
  const capacidades = useMemo<CapacidadesSessao>(
    () => ({
      visitante: visitante !== null,
      exigirConta: (motivo?: string) => setContaPedida(motivo ?? null),
      criarConta: () => {
        setContaPedida(undefined);
        aoCriarConta?.();
      },
      entrar: () => {
        setContaPedida(undefined);
        aoEntrar?.();
      },
    }),
    [visitante, aoCriarConta, aoEntrar],
  );
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

  const areas = areasDaIdentidade(identidades.ativa, { visitante: visitante !== null });
  const areaAtiva = areaValida(areas, areaPedida);

  /*
   * Tocar em Conversas/Contatos NA NAVEGAÇÃO é pedir a lista: o painel lateral abre, mesmo que tenha sido
   * recolhido antes. Recolher continua sendo do botão próprio do painel; aberturas por código ("Conversar
   * com…") não mexem na preferência.
   */
  function abrirPelaNavegacao(id: string) {
    if (areaComPainelLateral(id)) preferenciaPainel.definir(false);
    abrir(id);
  }

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

  // Conta: sai direto. Visitante: confirma antes (a sessão dele não pode ser retomada).
  const pedirSaida = visitante ? () => setConfirmandoSaida(true) : aoSair;
  const sair = (
    <Botao
      aparencia="discreto"
      disabled={saindo}
      onClick={pedirSaida}
      aria-label={visitante ? "Sair da sessão de visitante" : "Sair da conta"}
      data-sair-visitante={visitante ? true : undefined}
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
    <ProvedorCapacidades value={capacidades}>
      <div className="mx-auto flex h-dvh w-full max-w-[100rem] overflow-hidden border-borda bg-fundo shadow-suave lg:border-x">
        <AvisosDeAcao />
        <NavegacaoApp
          areas={areas}
          areaAtiva={areaAtiva}
          aoAbrir={abrirPelaNavegacao}
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
                  visitante ? (
                    <>
                      <button type="button" role="menuitem" data-menu-criar-conta onClick={capacidades.criarConta} className="flex min-h-12 items-center px-3 text-left text-sm font-medium text-marca hover:bg-superficie-suave">
                        Criar conta
                      </button>
                      <button type="button" role="menuitem" data-menu-entrar onClick={capacidades.entrar} className="flex min-h-12 items-center px-3 text-left text-sm text-conteudo-suave hover:bg-superficie-suave">
                        Entrar
                      </button>
                      <button type="button" role="menuitem" data-menu-sair-visitante disabled={saindo} onClick={pedirSaida} className="flex min-h-12 items-center px-3 text-left text-sm text-conteudo-suave hover:bg-superficie-suave disabled:opacity-50">
                        {saindo ? "Saindo…" : "Sair"}
                      </button>
                    </>
                  ) : (
                    <button type="button" role="menuitem" data-sair-da-conta disabled={saindo} onClick={aoSair} className="flex min-h-12 items-center px-3 text-left text-sm text-conteudo-suave hover:bg-superficie-suave disabled:opacity-50">
                      {saindo ? "Saindo…" : "Sair da conta"}
                    </button>
                  )
                }
              />
            </div>
          </div>

          {visitante && (
            /*
             * Visitante: quem ele é agora e o caminho para a conta, sempre à vista (no celular, some quando
             * a conversa toma a tela, como a barra do topo).
             */
            <div
              data-faixa-visitante
              className={`shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-borda bg-marca-suave px-4 py-2 ${ehConversas && conversaAberta ? "hidden md:flex" : "flex"}`}
            >
              <p className="min-w-0 flex-1 text-xs text-conteudo-suave">
                <span className="font-semibold text-conteudo">Você está como visitante.</span> Sem conta, suas conversas expiram após 24 h sem uso.
              </p>
              <div className="flex gap-2">
                <Botao aparencia="secundario" data-visitante-entrar onClick={capacidades.entrar} className="!min-h-9">
                  Entrar
                </Botao>
                <Botao data-visitante-criar-conta onClick={capacidades.criarConta} className="!min-h-9">
                  Criar conta
                </Botao>
              </div>
            </div>
          )}

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
                {areaAtiva === "entregas" && !visitante && <AreaMinhasEntregas aoAbrirConversa={abrirConversaCom} />}

                {areaAtiva === "perfil" && (
                  /* O Perfil é organizado por abas; "Horários" (da empresa) e "Minhas empresas" (da conta) são abas dele. */
                  <AreaPerfil
                    // Visitante que acabou de criar a conta mantém a identidade: a chave muda para reler o perfil de verdade.
                    key={`${ativa.identidadeId}:${visitante ? "visitante" : "conta"}`}
                    ehEmpresa={ehEmpresa}
                    visitante={visitante}
                    {...(ativa.tipo === "empresarial"
                      ? { horarios: <HorariosDeFuncionamento key={ativa.empresa.id} empresaId={ativa.empresa.id} /> }
                      : {
                          empresas: (
                            <Secao
                              titulo="Minhas empresas"
                              descricao="Crie uma empresa para vender pelo Jaaa. Para administrá-la, toque no seu nome (no topo) e escolha a empresa."
                            >
                              <AreaEmpresas aoEmpresaCriada={() => void identidades.recarregar()} />
                            </Secao>
                          ),
                        })}
                  />
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

        {confirmandoSaida && (
          <DialogoConfirmacao
            titulo="Sair da sessão de visitante?"
            texto="Suas conversas deixam de aparecer aqui e esta sessão não poderá ser retomada. Para guardá-las, crie uma conta antes de sair."
            rotuloConfirmar="Sair"
            rotuloCancelar="Continuar aqui"
            ocupado={saindo}
            dados={{ "data-confirmar-saida-visitante": true }}
            idTitulo="titulo-sair-visitante"
            aoCancelar={() => setConfirmandoSaida(false)}
            aoConfirmar={aoSair}
          />
        )}

        {contaPedida !== undefined && (
          <Janela
            rotulo="Conta necessária"
            titulo={TITULO_CONTA_NECESSARIA}
            largura="estreita"
            aoFechar={() => setContaPedida(undefined)}
            rodape={
              <div className="flex flex-wrap justify-end gap-2">
                <Botao aparencia="discreto" onClick={() => setContaPedida(undefined)}>
                  Agora não
                </Botao>
                <Botao aparencia="secundario" data-conta-pedida-entrar onClick={capacidades.entrar}>
                  Entrar
                </Botao>
                <Botao data-conta-pedida-criar onClick={capacidades.criarConta}>
                  Criar conta
                </Botao>
              </div>
            }
          >
            <div data-conta-necessaria className="flex flex-col gap-2 text-sm">
              {contaPedida && <p>{contaPedida}</p>}
              <p className="text-conteudo-suave">Suas conversas não se perdem: ao criar sua conta ou entrar, elas continuam com você, aqui mesmo.</p>
            </div>
          </Janela>
        )}
      </div>
    </ProvedorCapacidades>
  );
}
