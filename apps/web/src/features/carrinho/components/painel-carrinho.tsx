"use client";

import { ROTULO_PAGAMENTO_ENTREGA, formatarEnderecoResumido, type EnderecoCliente, type FormaPagamentoEntrega } from "@jaa/contratos";
import { useState } from "react";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { interpretarPrecoDigitado } from "@/features/produtos/lib/precos";
import { totalCentavos, type Carrinho } from "../lib/carrinho";

// Interface TÉCNICA do carrinho + confirmação do pedido. O Jaa não processa pagamento: o cliente só
// informa como pretende pagar NA ENTREGA. Não é o design final.

export type ConfirmacaoPedido = { forma: FormaPagamentoEntrega; trocoParaCentavos: number | null };

export function PainelCarrinho({
  carrinho,
  endereco,
  enviando,
  erro,
  aoAlterarQuantidade,
  aoRemover,
  aoTrocarEndereco,
  aoConfirmar,
  aoFechar,
}: {
  carrinho: Carrinho;
  // Destino já escolhido e com ponto confirmado; sem ele não há como confirmar o pedido.
  endereco: EnderecoCliente | null;
  enviando: boolean;
  erro: string | null;
  aoAlterarQuantidade: (produtoId: string, quantidade: number) => void;
  aoRemover: (produtoId: string) => void;
  aoTrocarEndereco: () => void;
  aoConfirmar: (confirmacao: ConfirmacaoPedido) => void;
  aoFechar: () => void;
}) {
  const [forma, setForma] = useState<FormaPagamentoEntrega>("dinheiro");
  const [precisaTroco, setPrecisaTroco] = useState(false);
  const [trocoDigitado, setTrocoDigitado] = useState("");
  const [erroTroco, setErroTroco] = useState<string | null>(null);
  const total = totalCentavos(carrinho);

  function confirmar() {
    // Cartão nunca leva troco; dinheiro só leva quando o cliente diz que precisa.
    if (forma === "cartao" || !precisaTroco) {
      setErroTroco(null);
      aoConfirmar({ forma, trocoParaCentavos: null });
      return;
    }
    const trocoParaCentavos = interpretarPrecoDigitado(trocoDigitado);
    if (trocoParaCentavos === null || trocoParaCentavos < total) {
      setErroTroco(`Informe um valor de troco igual ou maior que ${formatarPrecoCentavos(total)}.`);
      return;
    }
    setErroTroco(null);
    aoConfirmar({ forma, trocoParaCentavos });
  }

  return (
    <section aria-label="Carrinho" className="flex flex-col gap-2 rounded-jaa border border-borda bg-superficie p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Carrinho — {carrinho.empresa.nome}</h3>
        <button type="button" onClick={aoFechar} className="text-xs underline">
          Fechar carrinho
        </button>
      </div>

      <ol aria-label="Itens do carrinho" className="flex flex-col divide-y divide-borda rounded-jaa border border-borda">
        {carrinho.itens.map((item) => (
          <li key={item.produtoId} data-item-carrinho={item.produtoId} className="flex items-center justify-between gap-2 px-2 py-1.5">
            <span className="min-w-0">
              <span className="block truncate">{item.nome}</span>
              <span data-subtotal className="text-xs text-conteudo-suave">
                {item.quantidade} × {formatarPrecoCentavos(item.precoCentavos)} = {formatarPrecoCentavos(item.precoCentavos * item.quantidade)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" aria-label={`Diminuir ${item.nome}`} onClick={() => aoAlterarQuantidade(item.produtoId, item.quantidade - 1)} className="rounded-jaa border px-2">
                −
              </button>
              <span data-quantidade className="min-w-6 text-center">
                {item.quantidade}
              </span>
              <button type="button" aria-label={`Aumentar ${item.nome}`} onClick={() => aoAlterarQuantidade(item.produtoId, item.quantidade + 1)} className="rounded-jaa border px-2">
                +
              </button>
              <button type="button" aria-label={`Remover ${item.nome}`} onClick={() => aoRemover(item.produtoId)} className="rounded px-1 text-xs underline">
                Remover
              </button>
            </span>
          </li>
        ))}
      </ol>

      <p data-total-carrinho className="text-right font-semibold">
        Total: {formatarPrecoCentavos(total)}
      </p>

      {/* Destino antes do pagamento: pedido de entrega não existe sem endereço confirmado. */}
      <div data-endereco-selecionado={endereco?.id ?? ""} className="flex items-start justify-between gap-2 rounded-jaa border border-borda p-2">
        <span className="flex min-w-0 flex-col text-xs">
          <span className="font-medium">Entregar em</span>
          {endereco ? (
            <>
              <span>
                {endereco.apelido} · {formatarEnderecoResumido(endereco)}
              </span>
              <span className="text-conteudo-suave">
                {endereco.bairro}, {endereco.cidade}/{endereco.uf}
              </span>
              <span className="text-marca">📍 Ponto de entrega confirmado</span>
            </>
          ) : (
            <span className="text-aviso">Escolha o endereço de entrega para continuar.</span>
          )}
        </span>
        <button type="button" data-escolher-endereco onClick={aoTrocarEndereco} className="shrink-0 rounded-jaa border px-2 py-1 text-xs">
          {endereco ? "Trocar endereço" : "Escolher endereço"}
        </button>
      </div>

      <fieldset className="flex flex-col gap-1 rounded-jaa border border-borda p-2">
        <legend className="px-1 text-xs text-conteudo-suave">Pagamento na entrega</legend>
        {(["dinheiro", "cartao"] as const).map((opcao) => (
          <label key={opcao} className="flex items-center gap-2">
            <input
              type="radio"
              name="formaPagamento"
              value={opcao}
              checked={forma === opcao}
              onChange={() => {
                setForma(opcao);
                setErroTroco(null);
              }}
            />
            {ROTULO_PAGAMENTO_ENTREGA[opcao]}
          </label>
        ))}
        {/* "Troco para quanto?" existe SOMENTE para dinheiro, e só quando o cliente precisa de troco. */}
        {forma === "dinheiro" && (
          <div data-opcoes-troco className="ml-5 flex flex-col gap-1">
            <label className="flex items-center gap-2">
              <input type="radio" name="precisaTroco" checked={!precisaTroco} onChange={() => setPrecisaTroco(false)} />
              Não preciso de troco
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="precisaTroco" checked={precisaTroco} onChange={() => setPrecisaTroco(true)} />
              Preciso de troco
            </label>
            {precisaTroco && (
              <label className="flex flex-col gap-1">
                Troco para quanto?
                <input name="trocoPara" value={trocoDigitado} inputMode="decimal" placeholder="100,00" onChange={(evento) => setTrocoDigitado(evento.target.value)} className="rounded-jaa border border-borda px-2 py-1" />
              </label>
            )}
          </div>
        )}
      </fieldset>

      {/*
       * Pagamento ONLINE ainda não existe no Jaa: nada de gateway, cobrança, QR, token ou dado
       * bancário. As opções aparecem só como lembrete visual, desabilitadas, como as mídias do chat.
       */}
      <fieldset disabled className="flex flex-col gap-1 rounded-jaa border border-dashed border-borda p-2 text-conteudo-suave/70">
        <legend className="px-1 text-xs">Pagamento online — em breve</legend>
        {[
          { valor: "pix-online", rotulo: "Pix online" },
          { valor: "cartao-online", rotulo: "Cartão online" },
        ].map((opcao) => (
          <label key={opcao.valor} className="flex items-center gap-2">
            <input type="radio" name="pagamentoOnline" value={opcao.valor} disabled data-pagamento-online={opcao.valor} />
            {opcao.rotulo} <span className="text-xs">(Em breve)</span>
          </label>
        ))}
      </fieldset>

      <button type="button" disabled={enviando || carrinho.itens.length === 0 || endereco === null} onClick={confirmar} className="rounded bg-marca px-3 py-2 text-white disabled:opacity-50">
        Confirmar pedido
      </button>
      {(erroTroco ?? erro) && (
        <p role="alert" className="text-perigo">
          {erroTroco ?? erro}
        </p>
      )}
    </section>
  );
}
