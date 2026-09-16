"use client";

import type { ItemListaConversas } from "@jaa/contratos";
import { rotuloNaoLidas } from "../lib/lista-conversas";

// Interface TÉCNICA e TEMPORÁRIA para validar a lista de conversas. Não é o design do Jaa.

const formatoHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

function formatarHorario(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  const mesmoDia = data.toDateString() === hoje.toDateString();
  return mesmoDia ? formatoHora.format(data) : formatoData.format(data);
}

export function ListaConversas(props: {
  identidadeId: string;
  itens: ItemListaConversas[];
  carregando: boolean;
  erro: string | null;
  temMais: boolean;
  carregandoMais: boolean;
  conversaAbertaId: string | null;
  // Conversa aberta e visível: está sendo lida agora, então o contador não é exibido nela.
  conversaEmLeituraId?: string | null;
  aoAbrir: (item: ItemListaConversas) => void;
  aoCarregarMais: () => void;
}) {
  return (
    <section aria-label="Lista de conversas" className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">Conversas</h2>

      {props.carregando && <p className="text-sm text-zinc-500">Carregando conversas…</p>}
      {!props.carregando && props.itens.length === 0 && !props.erro && (
        <p className="text-sm text-zinc-500">Nenhuma conversa ainda.</p>
      )}

      {props.itens.length > 0 && (
        <ol aria-label="Conversas" className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200">
          {props.itens.map((item) => {
            const { outraIdentidade, ultimaMensagem } = item;
            const aberta = item.id === props.conversaAbertaId;
            const autor = ultimaMensagem.remetenteIdentidadeId === props.identidadeId ? "Você: " : "";
            return (
              <li key={item.id} data-conversa-id={item.id}>
                <button
                  type="button"
                  aria-current={aberta ? "true" : undefined}
                  onClick={() => props.aoAbrir(item)}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm ${aberta ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate">
                      <span className="font-medium">{outraIdentidade.nomeExibicao}</span>{" "}
                      <span className="text-zinc-500">@{outraIdentidade.nomeUsuario}</span>
                      {outraIdentidade.tipo === "empresarial" && <span data-tipo-participante="empresarial" className="ml-1 rounded bg-zinc-100 px-1 text-xs text-zinc-600">Empresa</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <time dateTime={ultimaMensagem.criadoEm} className="text-xs text-zinc-500">
                        {formatarHorario(ultimaMensagem.criadoEm)}
                      </time>
                      {item.naoLidas > 0 && item.id !== props.conversaEmLeituraId && (
                        <span
                          data-nao-lidas={item.naoLidas}
                          aria-label={`${item.naoLidas} ${item.naoLidas === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
                          className="min-w-5 rounded-full bg-emerald-600 px-1.5 text-center text-xs font-semibold leading-5 text-white"
                        >
                          {rotuloNaoLidas(item.naoLidas)}
                        </span>
                      )}
                    </span>
                  </span>
                  <span data-previa className="truncate text-zinc-600">
                    {ultimaMensagem.excluidaEm ? (
                      <span className="italic">Mensagem excluída</span>
                    ) : ultimaMensagem.tipo === "pedido" ? (
                      <>
                        {autor}
                        <span>Pedido</span>
                      </>
                    ) : (
                      <>
                        {autor}
                        {ultimaMensagem.conteudo}
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {props.temMais && (
        <button
          type="button"
          disabled={props.carregandoMais}
          onClick={props.aoCarregarMais}
          className="self-start text-sm underline disabled:opacity-50"
        >
          {props.carregandoMais ? "Carregando…" : "Carregar mais conversas"}
        </button>
      )}

      {props.erro && (
        <p role="alert" className="text-sm text-red-600">
          {props.erro}
        </p>
      )}
    </section>
  );
}
