"use client";

import type {
  EventoNotificacaoNovaMensagem,
  IdentidadeVisivel,
  ParticipanteConversa,
  TipoIdentidade,
} from "@jaa/contratos";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { IconeConversa } from "@/components/ui/icones";
import { PesquisaJaa } from "@/features/contatos/components/pesquisa-jaa";
import { useEffect, useState, type ReactNode } from "react";
import { BotaoPainelLateral, MestreDetalhe, usePainelRecolhido } from "@/components/navegacao/mestre-detalhe";
import { AreaContatos } from "@/features/contatos/components/area-contatos";
import { useConfirmacaoRecebimento } from "../hooks/use-confirmacao-recebimento";
import { useDocumentoVisivel } from "../hooks/use-documento-visivel";
import { useListaConversas } from "../hooks/use-lista-conversas";
import { useNotificacoesInternas } from "../hooks/use-notificacoes-internas";
import { EVENTO_CONVERSA_ESTADO_PESSOAL, eventoConversaEstadoPessoalSchema } from "@jaa/contratos";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { bloquearIdentidade, desbloquearIdentidade } from "../lib/api-bloqueios";
import { abrirConversaDireta, apagarConversa, limparConversa } from "../lib/api-conversas";
import type { AcaoConversa, AlvoAcaoConversa } from "./acoes-conversa";
import { confirmarRecebimentos } from "../lib/confirmar-recebimentos";
import {
  FILTROS_CONVERSAS,
  ROTULO_FILTRO_CONVERSAS,
  contarConversasNaoLidas,
  filtrarConversas,
  rotuloNaoLidas,
  type FiltroConversas,
} from "../lib/lista-conversas";
import { AvisosNotificacao } from "./avisos-notificacao";
import { ConversaTecnica, type ConversaAberta } from "./conversa-tecnica";
import { ListaConversas } from "./lista-conversas";

/*
 * O MENSAGEIRO em mestre-detalhe (`MestreDetalhe`): painel lateral à esquerda e a conversa aberta à
 * direita, sempre que a janela comporta os dois; a pessoa pode recolher o painel.
 *
 * O painel mostra a LISTA DE CONVERSAS ou os CONTATOS (`painel`), conforme a área aberta no app. A
 * conversa é a mesma nos dois casos — uma só, com o mesmo estado: trocar de área não a fecha.
 *
 * Na janela ESTREITA só um lado existe por vez — o painel ocupa a tela, e abrir uma conversa o
 * substitui (com "voltar" no cabeçalho).
 *
 * Nada da mecânica mudou: inbox por identidade ATUANTE, realtime, confirmação de recebimento,
 * leitura e notificações continuam exatamente como estavam.
 */

export type PainelMensageiro = "conversas" | "contatos";

// `identidadeId` = identidade ATUANTE (pessoal ou empresa operada). A inbox é carregada pela API para ela.
export function MensageiroTecnico({
  identidadeId,
  painel = "conversas",
  tipoIdentidade = "pessoal",
  pessoa,
  aoAlterarConversaAberta,
  aoAbrirPedidos,
  abrirConversaCom,
  aoAbrirConversaSolicitada,
}: {
  identidadeId: string;
  // O que o painel lateral lista. A conversa aberta ao lado é a mesma nos dois.
  painel?: PainelMensageiro;
  tipoIdentidade?: TipoIdentidade;
  /*
   * Quem está USANDO o Jaa: a identidade PESSOAL da conta, que é o que o topo da lista identifica.
   * Não é a identidade atuante (`identidadeId`) — agindo como empresa, a inbox é da empresa, mas a
   * pessoa sentada no aplicativo continua sendo a mesma. Vem da lista de identidades operáveis que
   * o servidor já devolve (a mesma fonte do "Agindo como"): nenhum estado novo.
   */
  pessoa: (Pick<
    ParticipanteConversa,
    "identidadeId" | "nomeExibicao" | "nomeUsuario" | "tipo"
  > & { fotoUrl?: string | null }) | null;
  // Avisa o app: com uma conversa aberta no celular, a barra de navegação sai do caminho.
  aoAlterarConversaAberta?: (aberta: boolean) => void;
  // Abre a área de pedidos do aplicativo; ausente quando a identidade atual não tem essa área.
  aoAbrirPedidos?: (() => void) | undefined;
  /*
   * Outra área pediu para conversar com alguém (ex.: "Conversar" numa entrega): abre a conversa
   * DIRETA de sempre com esse @usuario, na identidade atuante, e avisa o app que atendeu o pedido.
   */
  abrirConversaCom?: string | null | undefined;
  aoAbrirConversaSolicitada?: (() => void) | undefined;
}) {
  const lista = useListaConversas();
  const documentoVisivel = useDocumentoVisivel();
  useConfirmacaoRecebimento(identidadeId);

  // A prévia da lista exibe a última mensagem de cada conversa: ela foi recebida por este cliente.
  useEffect(() => {
    confirmarRecebimentos(
      identidadeId,
      lista.itens.flatMap((item) => (item.ultimaMensagem ? [item.ultimaMensagem] : [])),
    );
  }, [identidadeId, lista.itens]);
  const [conversaAberta, setConversaAberta] = useState<ConversaAberta | null>(
    null,
  );
  // Muda quando a conversa aberta é LIMPA: remonta a conversa, que relê o histórico (já sem o limpo).
  const [versaoLimpeza, setVersaoLimpeza] = useState(0);

  // Limpar/apagar feito em OUTRA aba desta identidade: a conversa aberta aqui acompanha.
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoMudar = (evento: unknown) => {
      const lido = eventoConversaEstadoPessoalSchema.safeParse(evento);
      if (!lido.success) return;
      setConversaAberta((atual) => (atual?.id === lido.data.conversaId && lido.data.acao === "apagada" ? null : atual));
      if (lido.data.acao === "limpa") setVersaoLimpeza((versao) => versao + 1);
    };
    socket.on(EVENTO_CONVERSA_ESTADO_PESSOAL, aoMudar);
    return () => {
      socket.off(EVENTO_CONVERSA_ESTADO_PESSOAL, aoMudar);
    };
  }, []);

  /*
   * Ações do menu da conversa — a MESMA função para o menu da lista, o botão direito e o cabeçalho.
   * Limpar/apagar mexem SÓ no estado desta identidade; bloquear/desbloquear só existem com pessoa (o
   * servidor confere tudo de novo). Devolve o erro para a confirmação mostrar.
   */
  async function executarAcaoConversa(acao: AcaoConversa, item: AlvoAcaoConversa): Promise<string | null> {
    if (acao === "limpar" || acao === "apagar") {
      const resposta = acao === "limpar" ? await limparConversa(item.id) : await apagarConversa(item.id);
      if (!resposta.ok) return resposta.mensagem;
      lista.registrarEstadoPessoal({ conversaId: item.id, acao: acao === "limpar" ? "limpa" : "apagada" });
      if (acao === "apagar") setConversaAberta((atual) => (atual?.id === item.id ? null : atual));
      else setVersaoLimpeza((versao) => versao + 1);
      return null;
    }
    const resposta = acao === "bloquear" ? await bloquearIdentidade(item.outraIdentidade.identidadeId) : await desbloquearIdentidade(item.outraIdentidade.identidadeId);
    if (!resposta.ok) return resposta.mensagem;
    void lista.recarregarPrimeiraPagina();
    return null;
  }
  const conversaEmLeituraId = documentoVisivel
    ? (conversaAberta?.id ?? null)
    : null;
  const notificacoes = useNotificacoesInternas({
    identidadeId,
    conversaEmLeituraId,
  });
  const totalNaoLidas = lista.itens.reduce(
    (total, item) =>
      total + (item.id === conversaEmLeituraId ? 0 : item.naoLidas),
    0,
  );

  // Indicação fora da página: total de não lidas no título da aba (derivado da lista, não persistido).
  useEffect(() => {
    const tituloOriginal = document.title.replace(/^\(\d+\+?\) /, "");
    document.title =
      totalNaoLidas > 0
        ? `(${rotuloNaoLidas(totalNaoLidas)}) ${tituloOriginal}`
        : tituloOriginal;
  }, [totalNaoLidas]);

  useEffect(() => {
    aoAlterarConversaAberta?.(conversaAberta !== null);
  }, [conversaAberta, aoAlterarConversaAberta]);

  function abrirPelaNotificacao(aviso: EventoNotificacaoNovaMensagem) {
    /*
     * O aviso traz só nome e @usuario do remetente. A foto (já filtrada pela privacidade no servidor)
     * vem da lista de conversas, que recebe a mesma mensagem; sem ela ainda, as iniciais.
     */
    const daLista = lista.itens.find((item) => item.id === aviso.conversaId)?.outraIdentidade;
    setConversaAberta({
      id: aviso.conversaId,
      outraIdentidade: daLista ?? { ...aviso.remetente, fotoUrl: null },
    });
    notificacoes.dispensar(aviso.mensagemId);
  }
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  // Recorte de leitura da inbox (Todas / Não lidas / Empresas), derivado da lista que já veio.
  const [filtro, setFiltro] = useState<FiltroConversas>("todas");
  const itensVisiveis = filtrarConversas(
    lista.itens,
    filtro,
    conversaEmLeituraId,
  );
  const conversasNaoLidas = contarConversasNaoLidas(
    lista.itens,
    conversaEmLeituraId,
  );

  useEffect(() => {
    if (!abrirConversaCom) return;
    // Fora do caminho síncrono do efeito: a abertura atualiza estado.
    void Promise.resolve().then(async () => {
      aoAbrirConversaSolicitada?.();
      await abrirCom(abrirConversaCom);
    });
    // Só reage a um NOVO pedido de conversa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirConversaCom]);

  async function abrirCom(nomeUsuario: string) {
    setErro(null);
    setAbrindo(true);
    try {
      const aberta = await abrirConversaDireta(nomeUsuario);
      if (!aberta.ok) {
        setErro(aberta.mensagem);
        return;
      }
      const outra: IdentidadeVisivel | undefined =
        aberta.dados.participantes.find((p) => p.identidadeId !== identidadeId);
      if (outra)
        setConversaAberta({ id: aberta.dados.id, outraIdentidade: outra });
    } finally {
      setAbrindo(false);
    }
  }

  const { recolhido, alternar } = usePainelRecolhido();
  const avisosDeAbertura = (
    <>
      {abrindo && (
        <p role="status" className="text-xs text-conteudo-suave">
          Abrindo conversa…
        </p>
      )}
      {erro && (
        <p role="alert" className="text-sm text-perigo">
          {erro}
        </p>
      )}
    </>
  );

  const painelLateral = (
    <>
      {/*
        QUEM ESTÁ USANDO o Jaa, no alto do painel — e não o nome do aplicativo, que a pessoa já sabe.
        Mesma altura do cabeçalho da conversa (72px): os dois se alinham. Só existe na janela larga
        (`md`): abaixo disso quem identifica a conta é a barra do topo do aplicativo. A troca de
        identidade continua no "Agindo como", que é o lugar dela.
      */}
      <div className="hidden h-[4.5rem] shrink-0 items-center gap-2.5 border-b border-borda px-4 md:flex">
        {pessoa && (
          <>
            <AvatarIdentidade identidade={pessoa} tamanho="pequeno" />
            <span className="min-w-0 flex-1">
              <span data-identidade-em-uso className="block truncate text-sm font-bold">
                {pessoa.nomeExibicao}
              </span>
              <span className="block truncate text-xs text-conteudo-suave">@{pessoa.nomeUsuario}</span>
            </span>
          </>
        )}
        <BotaoPainelLateral recolhido={false} aoAlternar={alternar} className="ml-auto" />
      </div>

      {painel === "contatos" ? (
        // A MESMA agenda de sempre, agora no painel: escolher alguém abre a conversa ao lado.
        <div data-painel-contatos className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 pb-24 md:pb-4">
          {avisosDeAbertura}
          <AreaContatos aoAbrirConversa={(nomeUsuario) => void abrirCom(nomeUsuario)} />
        </div>
      ) : (
        <>
          <div className="flex shrink-0 flex-col gap-3 border-b border-borda p-4">
            {/* Uma busca só: pessoas e empresas, contatos primeiro. Tocar no resultado abre a conversa. */}
            <PesquisaJaa comProfissionais aoAbrirConversa={(nomeUsuario) => void abrirCom(nomeUsuario)} />

            <div role="tablist" aria-label="Filtrar conversas" className="flex gap-2">
              {FILTROS_CONVERSAS.map((opcao) => {
                const ativo = filtro === opcao;
                return (
                  <button
                    key={opcao}
                    type="button"
                    role="tab"
                    aria-selected={ativo}
                    data-filtro-conversas={opcao}
                    onClick={() => setFiltro(opcao)}
                    className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
                      ativo ? "bg-marca text-marca-conteudo" : "text-conteudo-suave hover:bg-realce hover:text-conteudo"
                    }`}
                  >
                    {ROTULO_FILTRO_CONVERSAS[opcao]}
                    {opcao === "nao-lidas" && conversasNaoLidas > 0 && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ativo ? "bg-marca-conteudo/20" : "bg-marca text-marca-conteudo"}`}>
                        {conversasNaoLidas}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {avisosDeAbertura}
          </div>

          <ListaConversas
            identidadeId={identidadeId}
            itens={itensVisiveis}
            carregando={!lista.primeiraPaginaCarregada && !lista.erro}
            erro={lista.erro}
            // Paginar só faz sentido na lista completa: o filtro é recorte do que já está carregado.
            temMais={filtro === "todas" && lista.proximoCursor !== null}
            carregandoMais={lista.carregandoMais}
            conversaAbertaId={conversaAberta?.id ?? null}
            conversaEmLeituraId={conversaEmLeituraId}
            aoAcaoConversa={executarAcaoConversa}
            aoAbrir={(item) => setConversaAberta({ id: item.id, outraIdentidade: item.outraIdentidade })}
            aoCarregarMais={() => void lista.carregarMais()}
          />
        </>
      )}
    </>
  );

  // Painel recolhido: o caminho de volta fica no próprio conteúdo (cabeçalho da conversa ou tela vazia).
  const abrirPainel = recolhido ? <BotaoPainelLateral recolhido aoAlternar={alternar} /> : null;

  const conteudo = conversaAberta ? (
    // `key`: trocar de conversa recomeça o estado (histórico, envio pendente, atividade) do zero.
    <ConversaTecnica
      key={`${conversaAberta.id}:${versaoLimpeza}`}
      identidadeId={identidadeId}
      tipoIdentidade={tipoIdentidade}
      conversa={conversaAberta}
      aoVoltar={() => setConversaAberta(null)}
      inicioCabecalho={abrirPainel}
      {...(aoAbrirPedidos ? { aoAbrirPedidos } : {})}
      aoMensagemConfirmada={lista.registrarMensagem}
      aoMensagemAtualizada={lista.registrarAtualizacao}
      aoMensagemExcluidaParaMim={lista.registrarExclusaoParaMim}
      aoConversarCom={(nomeUsuario) => void abrirCom(nomeUsuario)}
      aoAcaoConversa={executarAcaoConversa}
    />
  ) : (
    <ConversaNaoEscolhida painel={painel} inicio={abrirPainel} />
  );

  return (
    <section aria-label="Mensageiro" className="flex min-h-0 min-w-0 flex-1">
      <MestreDetalhe
        rotuloPainel={painel === "contatos" ? "Contatos" : "Conversas"}
        painel={painelLateral}
        conteudo={conteudo}
        conteudoEmFoco={conversaAberta !== null}
        recolhido={recolhido}
      />

      <AvisosNotificacao
        avisos={notificacoes.avisos}
        aoAbrir={abrirPelaNotificacao}
        aoDispensar={notificacoes.dispensar}
      />
    </section>
  );
}

/** Lado direito sem conversa aberta. Só aparece na janela larga (na estreita o painel é a tela). */
export function ConversaNaoEscolhida({ painel, inicio }: { painel: PainelMensageiro; inicio?: ReactNode }) {
  return (
    <div data-conversa-nao-escolhida className="chat-wallpaper relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      {inicio && <div className="absolute left-3 top-4">{inicio}</div>}
      <span aria-hidden className="grid h-14 w-14 place-items-center rounded-full bg-marca text-marca-conteudo shadow-suave">
        <IconeConversa className="h-7 w-7" />
      </span>
      <p className="fonte-display text-base font-bold">Escolha uma conversa</p>
      <p className="max-w-sm text-sm text-conteudo-suave">
        {painel === "contatos"
          ? "Selecione um contato na lista ao lado, ou use a busca para encontrar uma pessoa ou empresa. A conversa abre aqui."
          : "Selecione alguém na lista ao lado, ou use a busca para encontrar uma pessoa ou empresa pelo nome ou @usuario."}
      </p>
    </div>
  );
}
