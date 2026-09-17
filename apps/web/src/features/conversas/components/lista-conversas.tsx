"use client";

import type { ItemListaConversas } from "@jaa/contratos";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { rotuloNaoLidas } from "../lib/lista-conversas";

/*
 * LISTA DE CONVERSAS no padrão da referência de UI/UX aprovada: avatar, nome (+ selo Empresa), hora
 * à direita, prévia em uma linha e o contador de não lidas no fim da prévia.
 *
 * Diferença deliberada em relação ao protótipo: ALI cada linha tinha uma bolinha de presença. Aqui
 * não — o Jaa só conhece a presença da conversa ABERTA (o servidor a entrega a quem está observando
 * aquela conversa, e respeitando a privacidade de cada um). Pintar bolinha em toda a lista seria
 * inventar informação que o produto não tem.
 */

const formatoHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const formatoDiaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const formatoData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Hoje → hora; ontem → "ontem"; nos últimos 7 dias → dia da semana; antes disso → data. */
export function formatarHorarioDaLista(iso: string, agora = new Date()): string {
  const data = new Date(iso);
  const dia = (valor: Date) => new Date(valor.getFullYear(), valor.getMonth(), valor.getDate()).getTime();
  const diferencaEmDias = Math.round((dia(agora) - dia(data)) / 86_400_000);

  if (diferencaEmDias <= 0) return formatoHora.format(data);
  if (diferencaEmDias === 1) return "ontem";
  if (diferencaEmDias < 7) return formatoDiaSemana.format(data).replace(".", "");
  return formatoData.format(data);
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
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="flex h-11 shrink-0 items-center px-4 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-conteudo-suave">Conversas</p>

      {props.carregando && (
        <p role="status" className="px-4 py-3 text-sm text-conteudo-suave">
          Carregando conversas…
        </p>
      )}

      {!props.carregando && props.itens.length === 0 && !props.erro && (
        <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
          <p className="fonte-display text-sm font-semibold">Nenhuma conversa ainda</p>
          <p className="max-w-[16rem] text-sm text-conteudo-suave">
            Use a busca acima para encontrar uma pessoa ou empresa pelo nome ou @usuario e começar a conversar.
          </p>
        </div>
      )}

      {props.itens.length > 0 && (
        <ol aria-label="Conversas" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {props.itens.map((item) => {
            const { outraIdentidade, ultimaMensagem } = item;
            const aberta = item.id === props.conversaAbertaId;
            const autor = ultimaMensagem.remetenteIdentidadeId === props.identidadeId ? "Você: " : "";
            const mostrarNaoLidas = item.naoLidas > 0 && item.id !== props.conversaEmLeituraId;

            return (
              <li key={item.id} data-conversa-id={item.id}>
                <button
                  type="button"
                  aria-current={aberta ? "true" : undefined}
                  onClick={() => props.aoAbrir(item)}
                  className={`flex min-h-[4.35rem] w-full items-center gap-3 rounded-jaa p-3 text-left transition-colors ${
                    aberta ? "bg-marca-suave shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--cor-marca)_19%,transparent)]" : "hover:bg-superficie-suave"
                  }`}
                >
                  <AvatarIdentidade identidade={outraIdentidade} />

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="fonte-display min-w-0 truncate text-[0.91rem] font-semibold">{outraIdentidade.nomeExibicao}</span>
                      {outraIdentidade.tipo === "empresarial" && (
                        <span data-tipo-participante="empresarial" className="shrink-0 rounded-full border border-ouro/60 px-1.5 text-[0.55rem] uppercase tracking-wide text-aviso">
                          Empresa
                        </span>
                      )}
                      <time dateTime={ultimaMensagem.criadoEm} className="ml-auto shrink-0 text-[0.65rem] text-conteudo-suave">
                        {formatarHorarioDaLista(ultimaMensagem.criadoEm)}
                      </time>
                    </span>

                    <span className="mt-0.5 flex min-w-0 items-center gap-2">
                      <span data-previa className="min-w-0 flex-1 truncate text-[0.79rem] text-conteudo-suave">
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
                      {mostrarNaoLidas && (
                        <span
                          data-nao-lidas={item.naoLidas}
                          aria-label={`${item.naoLidas} ${item.naoLidas === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
                          className="grid h-[1.15rem] min-w-[1.15rem] shrink-0 place-items-center rounded-full bg-marca px-1 text-[0.62rem] font-semibold text-marca-conteudo"
                        >
                          {rotuloNaoLidas(item.naoLidas)}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}

          {props.temMais && (
            <li className="px-1 pt-2">
              <button
                type="button"
                disabled={props.carregandoMais}
                onClick={props.aoCarregarMais}
                className="min-h-11 w-full rounded-jaa text-sm text-conteudo-suave hover:bg-superficie-suave disabled:opacity-50"
              >
                {props.carregandoMais ? "Carregando…" : "Carregar mais conversas"}
              </button>
            </li>
          )}
        </ol>
      )}

      {props.erro && (
        <p role="alert" className="px-4 py-2 text-sm text-perigo">
          {props.erro}
        </p>
      )}
    </div>
  );
}
