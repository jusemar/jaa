"use client";

import type { EventoNotificacaoNovaMensagem, ParticipanteConversa, TipoIdentidade } from "@jaa/contratos";
import { PesquisaJaa } from "@/features/contatos/components/pesquisa-jaa";
import { useEffect, useState } from "react";
import { useConfirmacaoRecebimento } from "../hooks/use-confirmacao-recebimento";
import { useDocumentoVisivel } from "../hooks/use-documento-visivel";
import { useListaConversas } from "../hooks/use-lista-conversas";
import { useNotificacoesInternas } from "../hooks/use-notificacoes-internas";
import { abrirConversaDireta } from "../lib/api-conversas";
import { confirmarRecebimentos } from "../lib/confirmar-recebimentos";
import { rotuloNaoLidas } from "../lib/lista-conversas";
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
  aoAlterarConversaAberta,
}: {
  identidadeId: string;
  tipoIdentidade?: TipoIdentidade;
  // Avisa o app: com uma conversa aberta no celular, a barra de navegação sai do caminho.
  aoAlterarConversaAberta?: (aberta: boolean) => void;
}) {
  const lista = useListaConversas();
  const documentoVisivel = useDocumentoVisivel();
  useConfirmacaoRecebimento(identidadeId);

  // A prévia da lista exibe a última mensagem de cada conversa: ela foi recebida por este cliente.
  useEffect(() => {
    confirmarRecebimentos(identidadeId, lista.itens.map((item) => item.ultimaMensagem));
  }, [identidadeId, lista.itens]);
  const [conversaAberta, setConversaAberta] = useState<ConversaAberta | null>(null);
  const conversaEmLeituraId = documentoVisivel ? (conversaAberta?.id ?? null) : null;
  const notificacoes = useNotificacoesInternas({ identidadeId, conversaEmLeituraId });
  const totalNaoLidas = lista.itens.reduce((total, item) => total + (item.id === conversaEmLeituraId ? 0 : item.naoLidas), 0);

  // Indicação fora da página: total de não lidas no título da aba (derivado da lista, não persistido).
  useEffect(() => {
    const tituloOriginal = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = totalNaoLidas > 0 ? `(${rotuloNaoLidas(totalNaoLidas)}) ${tituloOriginal}` : tituloOriginal;
  }, [totalNaoLidas]);

  useEffect(() => {
    aoAlterarConversaAberta?.(conversaAberta !== null);
  }, [conversaAberta, aoAlterarConversaAberta]);

  function abrirPelaNotificacao(aviso: EventoNotificacaoNovaMensagem) {
    setConversaAberta({ id: aviso.conversaId, outraIdentidade: aviso.remetente });
    notificacoes.dispensar(aviso.mensagemId);
  }
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  async function abrirCom(nomeUsuario: string) {
    setErro(null);
    setAbrindo(true);
    try {
      const aberta = await abrirConversaDireta(nomeUsuario);
      if (!aberta.ok) {
        setErro(aberta.mensagem);
        return;
      }
      const outra: ParticipanteConversa | undefined = aberta.dados.participantes.find((p) => p.identidadeId !== identidadeId);
      if (outra) setConversaAberta({ id: aberta.dados.id, outraIdentidade: outra });
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <section aria-label="Mensageiro" className="flex min-h-0 flex-1">
      <aside
        aria-label="Conversas"
        className={`min-w-0 flex-col border-borda bg-fundo md:flex md:w-[21rem] md:shrink-0 md:border-r lg:w-[23rem] ${conversaAberta ? "hidden w-full" : "flex w-full"}`}
      >
        <div className="shrink-0 px-3 pb-2 pt-3">
          {/* Uma busca só: pessoas e empresas, contatos primeiro. Tocar no resultado abre a conversa. */}
          <PesquisaJaa aoAbrirConversa={(nomeUsuario) => void abrirCom(nomeUsuario)} />
          {abrindo && (
            <p role="status" className="px-1 pt-1 text-xs text-conteudo-suave">
              Abrindo conversa…
            </p>
          )}
          {erro && (
            <p role="alert" className="px-1 pt-1 text-sm text-perigo">
              {erro}
            </p>
          )}
        </div>

        <ListaConversas
          identidadeId={identidadeId}
          itens={lista.itens}
          carregando={!lista.primeiraPaginaCarregada && !lista.erro}
          erro={lista.erro}
          temMais={lista.proximoCursor !== null}
          carregandoMais={lista.carregandoMais}
          conversaAbertaId={conversaAberta?.id ?? null}
          conversaEmLeituraId={conversaEmLeituraId}
          aoAbrir={(item) => setConversaAberta({ id: item.id, outraIdentidade: item.outraIdentidade })}
          aoCarregarMais={() => void lista.carregarMais()}
        />
      </aside>

      <div className={`min-w-0 flex-1 flex-col ${conversaAberta ? "flex" : "hidden md:flex"}`}>
        {conversaAberta ? (
          // `key`: trocar de conversa recomeça o estado (histórico, envio pendente, atividade) do zero.
          <ConversaTecnica
            key={conversaAberta.id}
            identidadeId={identidadeId}
            tipoIdentidade={tipoIdentidade}
            conversa={conversaAberta}
            aoVoltar={() => setConversaAberta(null)}
            aoMensagemConfirmada={lista.registrarMensagem}
            aoMensagemAtualizada={lista.registrarAtualizacao}
            aoMensagemExcluidaParaMim={lista.registrarExclusaoParaMim}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-conversa-fundo px-6 text-center">
            <span aria-hidden className="fonte-display grid h-14 w-14 place-items-center rounded-[0.85rem_0.85rem_0.85rem_0.3rem] bg-conteudo text-2xl font-bold text-marca-conteudo shadow-suave">
              J
            </span>
            <p className="fonte-display text-base font-semibold">Escolha uma conversa</p>
            <p className="max-w-sm text-sm text-conteudo-suave">
              Selecione alguém na lista ao lado, ou use a busca para encontrar uma pessoa ou empresa pelo nome ou @usuario.
            </p>
          </div>
        )}
      </div>

      <AvisosNotificacao avisos={notificacoes.avisos} aoAbrir={abrirPelaNotificacao} aoDispensar={notificacoes.dispensar} />
    </section>
  );
}
