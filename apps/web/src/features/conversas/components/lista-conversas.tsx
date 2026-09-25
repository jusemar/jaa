"use client";

import type { ItemListaConversas } from "@jaa/contratos";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { rotuloNaoLidas } from "../lib/lista-conversas";

/*
 * LISTA DE CONVERSAS no padrão da referência de UI/UX aprovada: grade de três colunas — avatar,
 * bloco de texto (nome, tipo e prévia) e, à direita, o horário sobre o contador de não lidas.
 *
 * Diferença deliberada em relação ao protótipo: ALI cada linha tinha uma bolinha de presença. Aqui
 * não — o Jaa só conhece a presença da conversa ABERTA (o servidor a entrega a quem está observando
 * aquela conversa, e respeitando a privacidade de cada um). Pintar bolinha em toda a lista seria
 * inventar informação que o produto não tem.
 */

const formatoHora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});
const formatoDiaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const formatoData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

/** Hoje → hora; ontem → "ontem"; nos últimos 7 dias → dia da semana; antes disso → data. */
export function formatarHorarioDaLista(
  iso: string,
  agora = new Date(),
): string {
  const data = new Date(iso);
  const dia = (valor: Date) =>
    new Date(valor.getFullYear(), valor.getMonth(), valor.getDate()).getTime();
  const diferencaEmDias = Math.round((dia(agora) - dia(data)) / 86_400_000);

  if (diferencaEmDias <= 0) return formatoHora.format(data);
  if (diferencaEmDias === 1) return "ontem";
  if (diferencaEmDias < 7)
    return formatoDiaSemana.format(data).replace(".", "");
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
      {props.carregando && (
        <p role="status" className="px-4 py-3 text-sm text-conteudo-suave">
          Carregando conversas…
        </p>
      )}

      {!props.carregando && props.itens.length === 0 && !props.erro && (
        <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
          <p className="fonte-display text-sm font-semibold">
            Nenhuma conversa ainda
          </p>
          <p className="max-w-[16rem] text-sm text-conteudo-suave">
            Use a busca acima para encontrar uma pessoa ou empresa pelo nome ou
            @usuario e começar a conversar.
          </p>
        </div>
      )}

      {props.itens.length > 0 && (
        <ol
          aria-label="Conversas"
          className="min-h-0 flex-1 overflow-y-auto py-2"
        >
          {props.itens.map((item) => {
            const { outraIdentidade, ultimaMensagem } = item;
            const aberta = item.id === props.conversaAbertaId;
            const autor =
              ultimaMensagem.remetenteIdentidadeId === props.identidadeId
                ? "Você: "
                : "";
            const mostrarNaoLidas =
              item.naoLidas > 0 && item.id !== props.conversaEmLeituraId;

            return (
              <li key={item.id} data-conversa-id={item.id}>
                <button
                  type="button"
                  aria-current={aberta ? "true" : undefined}
                  onClick={() => props.aoAbrir(item)}
                  className={`grid w-full grid-cols-[2.75rem_minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-colors ${
                    aberta ? "bg-superficie-suave" : "hover:bg-superficie-suave"
                  }`}
                >
                  <AvatarIdentidade identidade={outraIdentidade} />

                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {outraIdentidade.nomeExibicao}
                    </span>
                    {/*
                      Linha de TIPO, como na referência (ali: "Restaurante", "Farmácia"). O Jaa não
                      conhece o ramo da empresa, então diz só o que realmente sabe — e para PESSOA
                      não diz nada: repetir o @usuario aqui sobrecarregava a linha, e a decisão de
                      não exibi-lo continua valendo.
                    */}
                    {outraIdentidade.tipo === "empresarial" && (
                      <span
                        data-tipo-participante="empresarial"
                        className="block truncate text-xs font-medium text-aviso"
                      >
                        Empresa
                      </span>
                    )}
                    <span
                      data-previa
                      className="mt-1 block truncate text-xs text-conteudo-suave"
                    >
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
                  </span>

                  <span className="flex flex-col items-end gap-2 text-[11px] text-conteudo-suave">
                    <time dateTime={ultimaMensagem.criadoEm}>
                      {formatarHorarioDaLista(ultimaMensagem.criadoEm)}
                    </time>
                    {mostrarNaoLidas && (
                      <span
                        data-nao-lidas={item.naoLidas}
                        aria-label={`${item.naoLidas} ${item.naoLidas === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
                        className="grid h-5 min-w-5 place-items-center rounded-full bg-marca px-1 text-[10px] font-bold text-marca-conteudo"
                      >
                        {rotuloNaoLidas(item.naoLidas)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}

          {props.temMais && (
            <li className="px-4 pt-2">
              <button
                type="button"
                disabled={props.carregandoMais}
                onClick={props.aoCarregarMais}
                className="min-h-11 w-full rounded-jaa-compacto text-sm text-conteudo-suave hover:bg-superficie-suave disabled:opacity-50"
              >
                {props.carregandoMais
                  ? "Carregando…"
                  : "Carregar mais conversas"}
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
