"use client";

import type { EmpresaPublica, EventoNotificacaoNovaMensagem, ParticipanteConversa, TipoIdentidade } from "@jaa/contratos";
import { DescobertaEmpresasTecnica } from "@/features/catalogo/components/descoberta-empresas-tecnica";
import { useEffect, useState, type FormEvent } from "react";
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

// Interface TÉCNICA e TEMPORÁRIA: lista de conversas ao lado da conversa aberta. Não é o design do Jaa.

// `identidadeId` = identidade ATUANTE (pessoal ou empresa operada). A inbox é carregada pela API para ela.
export function MensageiroTecnico({ identidadeId, tipoIdentidade = "pessoal" }: { identidadeId: string; tipoIdentidade?: TipoIdentidade }) {
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

  function abrirPelaNotificacao(aviso: EventoNotificacaoNovaMensagem) {
    setConversaAberta({ id: aviso.conversaId, outraIdentidade: aviso.remetente });
    notificacoes.dispensar(aviso.mensagemId);
  }
  const [destino, setDestino] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  async function abrirPorNomeUsuario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await abrirCom(destino);
  }

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
    <section
      aria-label="Mensageiro"
      className="grid gap-6 border-t border-zinc-200 pt-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-4">
        {tipoIdentidade === "pessoal" && <DescobertaEmpresasTecnica aoConversar={(empresa: EmpresaPublica) => void abrirCom(empresa.nomeUsuario)} />}
        <form onSubmit={(evento) => void abrirPorNomeUsuario(evento)} className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            @usuario do contato
            <input
              name="destino"
              value={destino}
              onChange={(evento) => setDestino(evento.target.value)}
              placeholder="@usuario"
              required
              className="min-w-0 rounded border border-zinc-300 px-3 py-2 text-base"
            />
          </label>
          <button type="submit" disabled={abrindo} className="shrink-0 whitespace-nowrap rounded border px-3 py-2 text-sm disabled:opacity-50">
            Abrir conversa
          </button>
        </form>
        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}

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
      </div>

      {conversaAberta ? (
        // `key`: trocar de conversa recomeça o estado (histórico, envio pendente, atividade) do zero.
        <ConversaTecnica
          key={conversaAberta.id}
          identidadeId={identidadeId}
          tipoIdentidade={tipoIdentidade}
          conversa={conversaAberta}
          aoMensagemConfirmada={lista.registrarMensagem}
          aoMensagemAtualizada={lista.registrarAtualizacao}
          aoMensagemExcluidaParaMim={lista.registrarExclusaoParaMim}
        />
      ) : (
        <p className="text-sm text-zinc-500">Selecione uma conversa.</p>
      )}
      <AvisosNotificacao avisos={notificacoes.avisos} aoAbrir={abrirPelaNotificacao} aoDispensar={notificacoes.dispensar} />
    </section>
  );
}
