"use client";

import {
  ROTULO_PAGAMENTO_ENTREGA,
  enderecoTemLocalizacaoConfirmada,
  formatarEnderecoResumido,
  type EnderecoCliente,
  type FormaPagamentoEntrega,
} from "@jaa/contratos";
import { useState } from "react";
import {
  IconeCartao,
  IconeCesta,
  IconeCheck,
  IconeDinheiro,
  IconeFechar,
  IconeImagem,
  IconeLixeira,
  IconeLocal,
  IconeMais,
  IconeMenos,
  IconeSacola,
  IconeSeta,
  IconeVoltar,
} from "@/components/ui/icones";
import {
  formatarPrecoCentavos,
  interpretarPrecoDigitado,
} from "@/features/produtos/lib/precos";
import {
  quantidadeTotal,
  totalCentavos,
  type Carrinho,
  type ItemCarrinho,
} from "../lib/carrinho";

/*
 * "SEU PEDIDO": a coluna que acompanha a conversa, no formato da referência de UI/UX aprovada —
 * cabeçalho, bloco de ENTREGA, lista de ITENS, bloco de PAGAMENTO e o fecho da conta no rodapé.
 *
 * No desktop é a terceira coluna (fica aberta ao lado da conversa); no celular abre sobre ela. O
 * componente é o mesmo: quem decide onde ele aparece é a conversa.
 *
 * O Jaa não processa pagamento: o cliente só informa como pretende pagar quando receber. E o painel
 * nunca é autoridade de dinheiro — tudo é recalculado pelo servidor na confirmação.
 */

export type ConfirmacaoPedido = {
  forma: FormaPagamentoEntrega;
  trocoParaCentavos: number | null;
};

const ICONE_PAGAMENTO = {
  dinheiro: IconeDinheiro,
  cartao: IconeCartao,
} as const;

/** Cabeçalho do painel, na mesma altura do cabeçalho da conversa (72px): as colunas se alinham. */
function CabecalhoPedido({
  acessorio,
  aoFechar,
}: {
  acessorio?: string;
  aoFechar: () => void;
}) {
  return (
    /*
     * Duas formas de sair, uma por contexto, como na referência: em tela reduzida o pedido é uma
     * TELA, então sai por uma SETA de voltar à esquerda; na coluna do desktop ele é um painel, e
     * fecha por um X à direita. É o mesmo `aoFechar` nos dois — muda só o que faz sentido ali.
     */
    <header className="flex h-[4.5rem] shrink-0 items-center gap-2 border-b border-borda px-3 sm:px-4">
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Voltar à conversa"
        title="Voltar à conversa"
        className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-jaa-compacto text-conteudo-suave transition-colors hover:bg-realce hover:text-conteudo xl:hidden"
      >
        <IconeVoltar className="h-5 w-5" />
      </button>
      <IconeCesta className="h-5 w-5 shrink-0 text-marca" />
      <h3 className="fonte-display min-w-0 flex-1 truncate text-base font-bold">
        Seu pedido
      </h3>
      {acessorio && (
        <span
          aria-hidden
          className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-marca px-1.5 text-xs font-bold text-marca-conteudo"
        >
          {acessorio}
        </span>
      )}
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar seu pedido"
        title="Fechar seu pedido"
        className="hidden h-9 w-9 shrink-0 place-items-center rounded-jaa-compacto text-conteudo-suave transition-colors hover:bg-realce hover:text-conteudo xl:grid"
      >
        <IconeFechar className="h-4 w-4" />
      </button>
    </header>
  );
}

/**
 * Painel VAZIO: no desktop, com o cardápio aberto, a coluna já existe e convida a escolher — é o
 * comportamento da referência. Sem isso a terceira coluna apareceria do nada no primeiro item.
 */
export function PainelPedidoVazio({ aoFechar }: { aoFechar: () => void }) {
  return (
    <section
      aria-label="Seu pedido"
      className="painel-entrando flex min-h-0 min-w-0 grow flex-col"
    >
      <CabecalhoPedido aoFechar={aoFechar} />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <IconeSacola className="h-8 w-8 text-conteudo-suave" />
        <p className="mt-3 text-sm font-bold">Seu pedido está vazio</p>
        <p className="mt-1 text-xs text-conteudo-suave">
          Escolha os itens no cardápio e eles aparecem aqui.
        </p>
      </div>
    </section>
  );
}

export function PainelCarrinho({
  carrinho,
  endereco,
  coberturaAprovada,
  enviando,
  erro,
  aoAlterarQuantidade,
  aoRemover,
  aoTrocarEndereco,
  aoConfirmar,
  aoFechar,
  aoLimpar,
}: {
  carrinho: Carrinho;
  // Destino já escolhido e com ponto confirmado; sem ele não há como confirmar o pedido.
  endereco: EnderecoCliente | null;
  coberturaAprovada: boolean;
  enviando: boolean;
  erro: string | null;
  // Quantidade e remoção agem sobre a LINHA do carrinho: o mesmo produto pode estar em duas montagens.
  aoAlterarQuantidade: (linhaId: string, quantidade: number) => void;
  aoRemover: (linhaId: string) => void;
  aoTrocarEndereco: () => void;
  aoConfirmar: (confirmacao: ConfirmacaoPedido) => void;
  aoFechar: () => void;
  aoLimpar?: (() => void) | undefined;
}) {
  /*
   * DUAS áreas, e só duas: "Itens" e "Entrega e pagamento". O painel empilhava tudo numa coluna
   * estreita e virava uma rolagem longa em que o total ficava longe dos itens. A troca é só de
   * APRESENTAÇÃO: o estado do pedido (itens, endereço, pagamento, troco) continua um só e vivo nas
   * duas — mudar de aba não perde nada do que já foi escolhido.
   */
  const [aba, setAba] = useState<"itens" | "entrega-pagamento">("itens");
  const [forma, setForma] = useState<FormaPagamentoEntrega>("dinheiro");
  const [precisaTroco, setPrecisaTroco] = useState(false);
  const [trocoDigitado, setTrocoDigitado] = useState("");
  const [erroTroco, setErroTroco] = useState<string | null>(null);
  const total = totalCentavos(carrinho);
  const itens = quantidadeTotal(carrinho);
  const podeConfirmar =
    !enviando &&
    carrinho.itens.length > 0 &&
    endereco !== null &&
    enderecoTemLocalizacaoConfirmada(endereco) &&
    coberturaAprovada;

  function confirmar() {
    // Cartão nunca leva troco; dinheiro só leva quando o cliente diz que precisa.
    if (forma === "cartao" || !precisaTroco) {
      setErroTroco(null);
      aoConfirmar({ forma, trocoParaCentavos: null });
      return;
    }
    const trocoParaCentavos = interpretarPrecoDigitado(trocoDigitado);
    if (trocoParaCentavos === null || trocoParaCentavos < total) {
      setErroTroco(
        `Informe um valor de troco igual ou maior que ${formatarPrecoCentavos(total)}.`,
      );
      return;
    }
    setErroTroco(null);
    aoConfirmar({ forma, trocoParaCentavos });
  }

  return (
    /*
     * `grow` é o que põe a AÇÃO PRINCIPAL na parte de baixo: sem ele o painel tinha a altura do
     * conteúdo e o rodapé vinha logo depois dos itens, no meio da coluna. Ocupando a altura
     * disponível, o corpo (`min-h-0 flex-1 overflow-y-auto`) fica com a sobra e rola sozinho,
     * enquanto cabeçalho, abas e rodapé são `shrink-0`. Vale igual na tela única e na coluna do
     * desktop, porque quem dá a altura é a célula do grid da conversa — nada de `position: fixed`.
     *
     * `grow` (base automática) e não `flex-1` (base 0): quando o painel divide a coluna com outro
     * bloco — o detalhe de um pedido aberto, por exemplo — base 0 o esmagaria até desaparecer.
     * Assim ele cresce quando há sobra e encolhe até rolar por dentro quando falta.
     */
    <section
      aria-label="Seu pedido"
      className="painel-entrando flex min-h-0 min-w-0 grow flex-col"
    >
      <CabecalhoPedido acessorio={String(itens)} aoFechar={aoFechar} />

      <div
        role="tablist"
        aria-label="Seções do pedido"
        className="flex shrink-0 gap-1 border-b border-borda px-2 pt-2"
      >
        {(
          [
            ["itens", "Itens"],
            ["entrega-pagamento", "Entrega e pagamento"],
          ] as const
        ).map(([id, rotulo]) => {
          const ativa = aba === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ativa}
              data-aba-pedido={id}
              onClick={() => setAba(id)}
              className={`min-h-10 flex-1 rounded-t-jaa-compacto border-b-2 px-2 text-xs font-medium transition-colors ${
                ativa
                  ? "border-marca text-marca"
                  : "border-transparent text-conteudo-suave hover:bg-realce hover:text-conteudo"
              }`}
            >
              {rotulo}
            </button>
          );
        })}
      </div>

      {/* Corpo com rolagem própria: o fecho da conta e a ação principal ficam sempre visíveis embaixo. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ENTREGA antes do pagamento: pedido de entrega não existe sem endereço confirmado. */}
        <section
          aria-label="Entrega"
          data-endereco-selecionado={endereco?.id ?? ""}
          className={`border-b border-borda p-4 ${aba === "entrega-pagamento" ? "" : "hidden"}`}
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold">Entrega</h4>
            <button
              type="button"
              data-escolher-endereco
              onClick={aoTrocarEndereco}
              className="shrink-0 text-xs font-semibold text-marca hover:underline"
            >
              {endereco ? "Trocar" : "Escolher endereço"}
            </button>
          </div>
          {endereco ? (
            /*
              O endereço QUEBRA LINHA e nunca alarga a coluna: o contêiner do texto é `min-w-0`
              (senão o conteúdo mínimo do texto empurraria o flex) e `overflow-wrap: anywhere` corta
              até uma palavra sem espaço, como um nome de rua muito longo. Nada é escondido com
              `truncate` — o endereço da entrega precisa ser lido inteiro.
            */
            <div className="mt-3 flex gap-3 rounded-jaa-compacto bg-marca-suave p-3">
              <IconeLocal className="mt-0.5 h-4 w-4 shrink-0 text-marca" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold [overflow-wrap:anywhere]">
                  {endereco.apelido} · {formatarEnderecoResumido(endereco)}
                </p>
                <p className="mt-0.5 text-[11px] text-conteudo-suave [overflow-wrap:anywhere]">
                  {endereco.bairro} · {endereco.cidade}/{endereco.uf}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-marca">
                  <IconeCheck className="h-3 w-3 shrink-0" />
                  Ponto de entrega confirmado
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-jaa-compacto bg-aviso/10 p-3 text-xs text-aviso">
              Escolha o endereço de entrega.
            </p>
          )}
        </section>

        <section
          aria-label="Itens do pedido"
          className={`border-b border-borda p-4 ${aba === "itens" ? "" : "hidden"}`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold">Itens</h4>
            {aoLimpar && (
              <button
                type="button"
                onClick={aoLimpar}
                className="shrink-0 text-xs font-semibold text-marca hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
          <ol>
            {carrinho.itens.map((item) => (
              <ItemDoPedido
                key={item.linhaId}
                item={item}
                aoAlterarQuantidade={aoAlterarQuantidade}
                aoRemover={aoRemover}
              />
            ))}
          </ol>
        </section>

        {/*
          `div role="group" + aria-labelledby` no lugar de `fieldset/legend`: o `<legend>` é
          posicionado na BORDA do fieldset e escapa da caixa de padding do bloco. A semântica de
          agrupamento para leitor de tela é a mesma.
        */}
        <div
          role="group"
          aria-labelledby="pagamento-entrega-titulo"
          className={`border-b border-borda p-4 ${aba === "entrega-pagamento" ? "" : "hidden"}`}
        >
          <p id="pagamento-entrega-titulo" className="text-sm font-bold">
            Pagamento na entrega
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {(["dinheiro", "cartao"] as const).map((opcao) => {
              const IconeDaForma = ICONE_PAGAMENTO[opcao];
              return (
                <label
                  key={opcao}
                  className="group/pagamento grid min-h-11 cursor-pointer grid-cols-[1rem_1rem_minmax(0,1fr)] items-center gap-2.5 rounded-jaa-compacto border border-borda px-3 text-sm transition-colors has-[:checked]:border-selecionado-borda has-[:checked]:bg-selecionado-fundo has-[:checked]:font-medium sm:min-h-10 [&:not(:has(:checked)):hover]:bg-superficie-suave has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca"
                >
                  <input
                    type="radio"
                    name="formaPagamento"
                    value={opcao}
                    checked={forma === opcao}
                    onChange={() => {
                      setForma(opcao);
                      setErroTroco(null);
                    }}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="grid h-4 w-4 place-items-center rounded-full border border-borda group-has-[:checked]/pagamento:border-marca"
                  >
                    <span className="h-2 w-2 rounded-full bg-marca opacity-0 group-has-[:checked]/pagamento:opacity-100" />
                  </span>
                  <IconeDaForma className="h-4 w-4 text-conteudo-suave" />
                  {ROTULO_PAGAMENTO_ENTREGA[opcao]}
                </label>
              );
            })}
          </div>

          {/* "Troco para quanto?" existe SOMENTE para dinheiro, e só quando o cliente precisa de troco. */}
          {forma === "dinheiro" && (
            <div
              data-opcoes-troco
              className="mt-2 flex flex-col gap-1 pl-3 text-xs"
            >
              <label className="flex min-h-9 cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="precisaTroco"
                  checked={!precisaTroco}
                  onChange={() => setPrecisaTroco(false)}
                  className="accent-[var(--cor-marca)]"
                />
                Não preciso de troco
              </label>
              <label className="flex min-h-9 cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="precisaTroco"
                  checked={precisaTroco}
                  onChange={() => setPrecisaTroco(true)}
                  className="accent-[var(--cor-marca)]"
                />
                Preciso de troco
              </label>
              {precisaTroco && (
                <label className="mt-1 flex flex-col gap-1 font-medium">
                  Troco para quanto?
                  <input
                    name="trocoPara"
                    value={trocoDigitado}
                    inputMode="decimal"
                    placeholder="100,00"
                    onChange={(evento) => setTrocoDigitado(evento.target.value)}
                    className="min-h-11 rounded-jaa-compacto border border-borda px-3 text-base font-normal sm:min-h-10"
                  />
                </label>
              )}
            </div>
          )}
        </div>

        {/*
         * Pagamento ONLINE ainda não existe no Jaa: nada de gateway, cobrança, QR, token ou dado
         * bancário. As opções aparecem só como lembrete visual, desabilitadas, como as mídias do chat.
         */}
        <fieldset
          disabled
          aria-labelledby="pagamento-online-titulo"
          className={`border-0 p-4 text-conteudo-suave/70 ${aba === "entrega-pagamento" ? "" : "hidden"}`}
        >
          {/*
            Aqui o `fieldset` fica: é ele que DESABILITA os controles de uma vez (`disabled`). Mas o
            título sai do `<legend>` (que seria desenhado na borda) para um parágrafo rotulador.
          */}
          <p id="pagamento-online-titulo" className="text-xs font-medium">
            Pagamento online — em breve
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {[
              { valor: "pix-online", rotulo: "Pix online" },
              { valor: "cartao-online", rotulo: "Cartão online" },
            ].map((opcao) => (
              <label
                key={opcao.valor}
                className="flex items-center gap-2 text-xs"
              >
                <input
                  type="radio"
                  name="pagamentoOnline"
                  value={opcao.valor}
                  disabled
                  data-pagamento-online={opcao.valor}
                />
                {opcao.rotulo} <span>(Em breve)</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {/*
       * Cada aba fecha com o passo dela: em "Itens" o subtotal e o caminho para a entrega; em
       * "Entrega e pagamento" o total e a confirmação. A ação principal nunca fica fora da vista.
       *
       * O SUBTOTAL é a soma dos itens — a única conta que o carrinho conhece. A linha de taxa de
       * entrega NÃO é montada aqui: frete (cálculo, cobertura e snapshot) é do domínio de entrega e
       * entra entre o subtotal e o total quando aquela etapa a fornecer.
       */}
      <div className="shrink-0 border-t border-borda p-4">
        <div className={aba === "itens" ? "" : "hidden"}>
          <p
            data-subtotal-carrinho
            className="flex items-baseline justify-between"
          >
            <span className="text-sm font-bold">Subtotal</span>
            <span className="fonte-display text-base font-bold">
              {formatarPrecoCentavos(total)}
            </span>
          </p>
          <button
            type="button"
            data-ir-para-entrega
            onClick={() => setAba("entrega-pagamento")}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-jaa-compacto bg-marca px-4 text-sm font-medium text-marca-conteudo shadow-suave transition-colors hover:bg-marca/90"
          >
            Continuar
            <IconeSeta className="h-4 w-4" />
          </button>
        </div>

        <div className={aba === "entrega-pagamento" ? "" : "hidden"}>
          <p className="flex items-baseline justify-between text-xs text-conteudo-suave">
            <span>Subtotal</span>
            <span>{formatarPrecoCentavos(total)}</span>
          </p>
          <p
            data-total-carrinho
            className="my-4 flex items-baseline justify-between"
          >
            <span className="fonte-display font-bold">Total</span>
            <span className="fonte-display text-xl font-bold text-marca">
              {formatarPrecoCentavos(total)}
            </span>
          </p>

          <button
            type="button"
            disabled={!podeConfirmar}
            onClick={confirmar}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-jaa-compacto bg-marca px-4 text-sm font-medium text-marca-conteudo shadow-suave transition-colors hover:bg-marca/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? "Enviando pedido…" : "Confirmar pedido"}
            {!enviando && <IconeSeta className="h-4 w-4" />}
          </button>
        </div>

        {(erroTroco ?? erro) && (
          <p role="alert" className="mt-2 text-xs text-perigo">
            {erroTroco ?? erro}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Linha do pedido. Quando o item foi MONTADO, as escolhas aparecem embaixo do nome: é o que
 * transforma "Monte seu prato" em algo conferível ("Grande", "Bife bovino", "Arroz"…).
 */
function ItemDoPedido({
  item,
  aoAlterarQuantidade,
  aoRemover,
}: {
  item: ItemCarrinho;
  aoAlterarQuantidade: (linhaId: string, quantidade: number) => void;
  aoRemover: (linhaId: string) => void;
}) {
  return (
    /*
     * Linha COMPACTA: imagem, nome, preço e — na MESMA faixa — o seletor de quantidade e o excluir.
     * O "(1 × R$ 9,00)" saiu: era repetir o que o próprio seletor já diz, e empurrava os controles
     * para uma linha extra. O preço mostrado é o da LINHA (unitário × quantidade), que é o que soma.
     */
    <li
      data-item-carrinho={item.linhaId}
      className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-borda py-2.5 first:pt-0 last:border-0 last:pb-0"
    >
      <Miniatura url={item.imagemUrl} nome={item.nome} />

      <div className="min-w-0">
        <p className="truncate text-xs font-bold">{item.nome}</p>
        <p data-subtotal className="fonte-display text-xs font-bold text-marca">
          {formatarPrecoCentavos(item.precoUnitarioCentavos * item.quantidade)}
        </p>

        {item.escolhas.length > 0 && (
          <ul
            data-escolhas-item
            className="mt-0.5 flex flex-col gap-0.5 text-[11px] leading-4 text-conteudo-suave"
          >
            {item.escolhas.map((escolha) => (
              <li key={escolha.opcaoId} className="flex gap-1.5">
                <span aria-hidden className="text-marca">
                  •
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {escolha.opcaoNome}
                  {escolha.precoAdicionalCentavos > 0 &&
                    ` (+${formatarPrecoCentavos(escolha.precoAdicionalCentavos)})`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Observação DESTA linha: é o que a cozinha precisa ler junto do item, não um recado geral. */}
        {item.observacao && (
          <p
            data-observacao-item
            className="mt-0.5 text-[11px] italic leading-4 text-conteudo-suave [overflow-wrap:anywhere]"
          >
            “{item.observacao}”
          </p>
        )}
      </div>

      {/* Quantidade e excluir na MESMA região, à direita do item. */}
      <div className="flex shrink-0 items-center gap-0.5">
        <span className="flex items-center rounded-jaa-compacto border border-borda">
          <button
            type="button"
            aria-label={`Diminuir ${item.nome}`}
            onClick={() =>
              aoAlterarQuantidade(item.linhaId, item.quantidade - 1)
            }
            className="grid h-9 w-8 place-items-center rounded-jaa-compacto text-conteudo-suave transition-colors hover:bg-realce sm:h-7"
          >
            <IconeMenos className="h-3.5 w-3.5" />
          </button>
          <span data-quantidade className="w-5 text-center text-xs font-bold">
            {item.quantidade}
          </span>
          <button
            type="button"
            aria-label={`Aumentar ${item.nome}`}
            onClick={() =>
              aoAlterarQuantidade(item.linhaId, item.quantidade + 1)
            }
            className="grid h-9 w-8 place-items-center rounded-jaa-compacto text-conteudo-suave transition-colors hover:bg-realce sm:h-7"
          >
            <IconeMais className="h-3.5 w-3.5" />
          </button>
        </span>
        <button
          type="button"
          aria-label={`Remover ${item.nome}`}
          onClick={() => aoRemover(item.linhaId)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-jaa-compacto text-conteudo-suave transition-colors hover:bg-perigo/10 hover:text-perigo sm:h-7 sm:w-7"
        >
          <IconeLixeira className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

/** Miniatura do produto. Sem imagem cadastrada, um marcador neutro — nunca um espaço vazio quebrado. */
function Miniatura({ url, nome }: { url: string | null; nome: string }) {
  if (!url) {
    return (
      <span
        aria-hidden
        className="grid h-12 w-12 shrink-0 place-items-center rounded-jaa-compacto bg-superficie-suave text-conteudo-suave/60"
      >
        <IconeImagem className="h-5 w-5" />
      </span>
    );
  }
  // <img> comum: a URL vem do armazenamento da API e o componente é usado dentro de listas rolantes.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={nome}
      loading="lazy"
      className="h-12 w-12 shrink-0 rounded-jaa-compacto object-cover"
    />
  );
}
