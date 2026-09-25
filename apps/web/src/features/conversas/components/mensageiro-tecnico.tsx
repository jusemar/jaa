"use client";

import type {
  EventoNotificacaoNovaMensagem,
  ParticipanteConversa,
  TipoIdentidade,
} from "@jaa/contratos";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { IconeConversa } from "@/components/ui/icones";
import { PesquisaJaa } from "@/features/contatos/components/pesquisa-jaa";
import { useEffect, useState } from "react";
import { useConfirmacaoRecebimento } from "../hooks/use-confirmacao-recebimento";
import { useDocumentoVisivel } from "../hooks/use-documento-visivel";
import { useListaConversas } from "../hooks/use-lista-conversas";
import { useNotificacoesInternas } from "../hooks/use-notificacoes-internas";
import { abrirConversaDireta } from "../lib/api-conversas";
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
 * O MENSAGEIRO em dois painéis, como na referência de UI/UX aprovada: a lista de conversas à
 * esquerda e a conversa aberta à direita.
 *
 * No CELULAR só um painel existe por vez — a lista ocupa a tela, e abrir uma conversa a substitui
 * (com "voltar" no cabeçalho). É a diferença que mais pesa na experiência: antes a conversa era uma
 * caixinha de altura fixa embaixo da lista, e no celular isso era impraticável.
 *
 * Nada da mecânica mudou: inbox por identidade ATUANTE, realtime, confirmação de recebimento,
 * leitura e notificações continuam exatamente como estavam.
 */

// `identidadeId` = identidade ATUANTE (pessoal ou empresa operada). A inbox é carregada pela API para ela.
export function MensageiroTecnico({
  identidadeId,
  tipoIdentidade = "pessoal",
  pessoa,
  aoAlterarConversaAberta,
  aoAbrirPedidos,
}: {
  identidadeId: string;
  tipoIdentidade?: TipoIdentidade;
  /*
   * Quem está USANDO o Jaa: a identidade PESSOAL da conta, que é o que o topo da lista identifica.
   * Não é a identidade atuante (`identidadeId`) — agindo como empresa, a inbox é da empresa, mas a
   * pessoa sentada no aplicativo continua sendo a mesma. Vem da lista de identidades operáveis que
   * o servidor já devolve (a mesma fonte do "Agindo como"): nenhum estado novo.
   */
  pessoa: Pick<
    ParticipanteConversa,
    "identidadeId" | "nomeExibicao" | "nomeUsuario" | "tipo"
  > | null;
  // Avisa o app: com uma conversa aberta no celular, a barra de navegação sai do caminho.
  aoAlterarConversaAberta?: (aberta: boolean) => void;
  // Abre a área de pedidos do aplicativo; ausente quando a identidade atual não tem essa área.
  aoAbrirPedidos?: (() => void) | undefined;
}) {
  const lista = useListaConversas();
  const documentoVisivel = useDocumentoVisivel();
  useConfirmacaoRecebimento(identidadeId);

  // A prévia da lista exibe a última mensagem de cada conversa: ela foi recebida por este cliente.
  useEffect(() => {
    confirmarRecebimentos(
      identidadeId,
      lista.itens.map((item) => item.ultimaMensagem),
    );
  }, [identidadeId, lista.itens]);
  const [conversaAberta, setConversaAberta] = useState<ConversaAberta | null>(
    null,
  );
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
    setConversaAberta({
      id: aviso.conversaId,
      outraIdentidade: aviso.remetente,
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

  async function abrirCom(nomeUsuario: string) {
    setErro(null);
    setAbrindo(true);
    try {
      const aberta = await abrirConversaDireta(nomeUsuario);
      if (!aberta.ok) {
        setErro(aberta.mensagem);
        return;
      }
      const outra: ParticipanteConversa | undefined =
        aberta.dados.participantes.find((p) => p.identidadeId !== identidadeId);
      if (outra)
        setConversaAberta({ id: aberta.dados.id, outraIdentidade: outra });
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <section aria-label="Mensageiro" className="flex min-h-0 min-w-0 flex-1">
      {/* Coluna da inbox: 300px no desktop, como na referência de UI/UX aprovada. */}
      <aside
        aria-label="Conversas"
        className={`min-w-0 flex-col border-borda bg-superficie xl:flex xl:w-[18.75rem] xl:shrink-0 xl:border-r ${conversaAberta ? "hidden w-full" : "flex w-full"}`}
      >
        {/*
          QUEM ESTÁ USANDO o Jaa, no alto da lista — e não o nome do aplicativo, que a pessoa já sabe.
          Mesma altura do cabeçalho da conversa (72px): as duas se alinham.
          Acompanha a barra do topo do aplicativo (`md`), não as colunas (`xl`): abaixo de `md` quem
          identifica a conta é aquela barra, e daí para cima é aqui — em nenhuma largura a inbox fica
          sem cabeçalho. A troca de identidade continua no "Agindo como", que é o lugar dela.
        */}
        <div className="hidden h-[4.5rem] shrink-0 items-center gap-2.5 border-b border-borda px-4 md:flex">
          {pessoa && (
            <>
              <AvatarIdentidade identidade={pessoa} tamanho="pequeno" />
              <span className="min-w-0">
                <span
                  data-identidade-em-uso
                  className="block truncate text-sm font-bold"
                >
                  {pessoa.nomeExibicao}
                </span>
                <span className="block truncate text-xs text-conteudo-suave">
                  @{pessoa.nomeUsuario}
                </span>
              </span>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-b border-borda p-4">
          {/* Uma busca só: pessoas e empresas, contatos primeiro. Tocar no resultado abre a conversa. */}
          <PesquisaJaa
            aoAbrirConversa={(nomeUsuario) => void abrirCom(nomeUsuario)}
          />

          <div
            role="tablist"
            aria-label="Filtrar conversas"
            className="flex gap-2"
          >
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
                    ativo
                      ? "bg-marca text-marca-conteudo"
                      : "text-conteudo-suave hover:bg-realce hover:text-conteudo"
                  }`}
                >
                  {ROTULO_FILTRO_CONVERSAS[opcao]}
                  {opcao === "nao-lidas" && conversasNaoLidas > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ativo ? "bg-marca-conteudo/20" : "bg-marca text-marca-conteudo"}`}
                    >
                      {conversasNaoLidas}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

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
          aoAbrir={(item) =>
            setConversaAberta({
              id: item.id,
              outraIdentidade: item.outraIdentidade,
            })
          }
          aoCarregarMais={() => void lista.carregarMais()}
        />
      </aside>

      <div
        className={`min-w-0 flex-1 flex-col ${conversaAberta ? "flex" : "hidden xl:flex"}`}
      >
        {conversaAberta ? (
          // `key`: trocar de conversa recomeça o estado (histórico, envio pendente, atividade) do zero.
          <ConversaTecnica
            key={conversaAberta.id}
            identidadeId={identidadeId}
            tipoIdentidade={tipoIdentidade}
            conversa={conversaAberta}
            aoVoltar={() => setConversaAberta(null)}
            {...(aoAbrirPedidos ? { aoAbrirPedidos } : {})}
            aoMensagemConfirmada={lista.registrarMensagem}
            aoMensagemAtualizada={lista.registrarAtualizacao}
            aoMensagemExcluidaParaMim={lista.registrarExclusaoParaMim}
          />
        ) : (
          <div className="chat-wallpaper flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <span
              aria-hidden
              className="grid h-14 w-14 place-items-center rounded-full bg-marca text-marca-conteudo shadow-suave"
            >
              <IconeConversa className="h-7 w-7" />
            </span>
            <p className="fonte-display text-base font-bold">
              Escolha uma conversa
            </p>
            <p className="max-w-sm text-sm text-conteudo-suave">
              Selecione alguém na lista ao lado, ou use a busca para encontrar
              uma pessoa ou empresa pelo nome ou @usuario.
            </p>
          </div>
        )}
      </div>

      <AvisosNotificacao
        avisos={notificacoes.avisos}
        aoAbrir={abrirPelaNotificacao}
        aoDispensar={notificacoes.dispensar}
      />
    </section>
  );
}
