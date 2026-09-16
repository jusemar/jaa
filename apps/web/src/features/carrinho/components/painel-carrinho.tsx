"use client";

import { ROTULO_PAGAMENTO_ENTREGA, type FormaPagamentoEntrega } from "@jaa/contratos";
import { useState } from "react";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { interpretarPrecoDigitado } from "@/features/produtos/lib/precos";
import { totalCentavos, type Carrinho } from "../lib/carrinho";

// Interface TÉCNICA do carrinho + confirmação do pedido. O Jaa não processa pagamento: o cliente só
// informa como pretende pagar NA ENTREGA. Não é o design final.

export type ConfirmacaoPedido = { forma: FormaPagamentoEntrega; trocoParaCentavos: number | null };

export function PainelCarrinho({
  carrinho,
  enviando,
  erro,
  aoAlterarQuantidade,
  aoRemover,
  aoConfirmar,
  aoFechar,
}: {
  carrinho: Carrinho;
  enviando: boolean;
  erro: string | null;
  aoAlterarQuantidade: (produtoId: string, quantidade: number) => void;
  aoRemover: (produtoId: string) => void;
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
    <section aria-label="Carrinho" className="flex flex-col gap-2 rounded border border-zinc-200 bg-white p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Carrinho — {carrinho.empresa.nome}</h3>
        <button type="button" onClick={aoFechar} className="text-xs underline">
          Fechar carrinho
        </button>
      </div>

      <ol aria-label="Itens do carrinho" className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200">
        {carrinho.itens.map((item) => (
          <li key={item.produtoId} data-item-carrinho={item.produtoId} className="flex items-center justify-between gap-2 px-2 py-1.5">
            <span className="min-w-0">
              <span className="block truncate">{item.nome}</span>
              <span data-subtotal className="text-xs text-zinc-500">
                {item.quantidade} × {formatarPrecoCentavos(item.precoCentavos)} = {formatarPrecoCentavos(item.precoCentavos * item.quantidade)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" aria-label={`Diminuir ${item.nome}`} onClick={() => aoAlterarQuantidade(item.produtoId, item.quantidade - 1)} className="rounded border px-2">
                −
              </button>
              <span data-quantidade className="min-w-6 text-center">
                {item.quantidade}
              </span>
              <button type="button" aria-label={`Aumentar ${item.nome}`} onClick={() => aoAlterarQuantidade(item.produtoId, item.quantidade + 1)} className="rounded border px-2">
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

      <fieldset className="flex flex-col gap-1 rounded border border-zinc-200 p-2">
        <legend className="px-1 text-xs text-zinc-500">Pagamento na entrega</legend>
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
                <input name="trocoPara" value={trocoDigitado} inputMode="decimal" placeholder="100,00" onChange={(evento) => setTrocoDigitado(evento.target.value)} className="rounded border border-zinc-300 px-2 py-1" />
              </label>
            )}
          </div>
        )}
      </fieldset>

      <button type="button" disabled={enviando || carrinho.itens.length === 0} onClick={confirmar} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50">
        Confirmar pedido
      </button>
      {(erroTroco ?? erro) && (
        <p role="alert" className="text-red-600">
          {erroTroco ?? erro}
        </p>
      )}
    </section>
  );
}
