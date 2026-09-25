"use client";

import {
  ROTULO_STATUS_PEDIDO,
  ROTULO_STATUS_SAIDA,
  formatarEnderecoResumido,
  paradasAtivas,
  rotuloFila,
  ROTULO_PAGAMENTO_ENTREGA,
  type EntregaAtribuida,
  type FilaDoPedido,
  type SaidaEntrega,
} from "@jaa/contratos";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { ResumoPercurso } from "./percurso-saida";

/*
 * Apresentação da SAÍDA. A ordem é uma SUGESTÃO do Jaa e o entregador pode mudá-la; quando há motor
 * de rotas configurado, o PERCURSO daquela ordem é calculado pelas ruas e aparece com distância e
 * tempo de TRAJETO. A interface nunca fala em "melhor rota" nem transforma trajeto em previsão de
 * entrega. "Próxima" é a primeira parada ativa da sequência — posição operacional, não localização.
 */

export function SequenciaDaSaida({
  saida,
  entregas = [],
  mostrarPercurso = true,
  aoMover,
  aoConcluir,
  ocupado,
}: {
  saida: SaidaEntrega;
  entregas?: EntregaAtribuida[];
  mostrarPercurso?: boolean;
  // Ausente = só leitura (a empresa acompanha; quem reordena é o entregador).
  aoMover?: ((pedidoId: string, direcao: -1 | 1) => void) | undefined;
  aoConcluir?: ((pedidoId: string, numeroPedido: number) => void) | undefined;
  ocupado?: boolean;
}) {
  const ativas = paradasAtivas(saida);
  const entregasPorPedido = new Map(
    entregas.map((entrega) => [entrega.pedidoId, entrega]),
  );
  const encerradas = saida.paradas
    .filter((parada) => parada.encerradaEm !== null)
    .sort((a, b) => a.posicao - b.posicao);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-conteudo-suave">
        {ativas.length > 1
          ? "Sequência sugerida pelo Jaa — você pode mudar a ordem se conhecer um caminho melhor."
          : "Parada única nesta rota."}
      </p>
      {mostrarPercurso ? <ResumoPercurso saida={saida} /> : null}
      <ol
        aria-label="Sequência da saída"
        className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm"
      >
        {ativas.map((parada, indice) => {
          const entrega = entregasPorPedido.get(parada.pedidoId);
          return (
            <li
              key={parada.id}
              data-parada={parada.pedidoId}
              data-posicao={indice + 1}
              className={`flex items-start justify-between gap-2 px-3 py-3 ${indice === 0 ? "border-l-4 border-l-marca bg-marca/5" : ""}`}
            >
              <span className="flex min-w-0 flex-col">
                {indice === 0 ? (
                  <span className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-marca">
                    Próxima parada
                  </span>
                ) : null}
                <span className="font-medium">
                  {indice + 1}ª parada · Pedido #{parada.numeroPedido}
                  {indice === 0 ? (
                    <span data-proxima-parada className="sr-only">
                      Próxima
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 text-sm font-medium">
                  {formatarEnderecoResumido(parada.destino)}
                </span>
                <span className="text-xs text-conteudo-suave">
                  {parada.destino.bairro}, {parada.destino.cidade}/
                  {parada.destino.uf}
                </span>
                <span className="text-xs text-conteudo-suave">
                  Cliente: {parada.cliente.nomeExibicao}
                </span>
                <span className="text-xs">
                  {entrega
                    ? `${entrega.itens.reduce((total, item) => total + item.quantidade, 0)} itens · `
                    : ""}
                  {formatarPrecoCentavos(parada.totalCentavos)}
                </span>
                {entrega ? (
                  <span
                    data-pagamento-entrega={entrega.formaPagamentoNaEntrega}
                    className="text-xs"
                  >
                    {ROTULO_PAGAMENTO_ENTREGA[entrega.formaPagamentoNaEntrega]}
                    {entrega.trocoParaCentavos !== null &&
                      ` · Troco para ${formatarPrecoCentavos(entrega.trocoParaCentavos)}`}
                  </span>
                ) : null}
                <span
                  data-status-parada={parada.statusPedido}
                  className="text-xs text-conteudo-suave"
                >
                  Status: {ROTULO_STATUS_PEDIDO[parada.statusPedido]}
                </span>
                {entrega ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-marca">
                      Ver itens
                    </summary>
                    <ul className="mt-1 pl-4">
                      {entrega.itens.map((item) => (
                        <li key={`${item.nomeProduto}-${item.quantidade}`}>
                          {item.quantidade}× {item.nomeProduto}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {indice === 0 &&
                aoConcluir &&
                saida.status === "em_andamento" ? (
                  <button
                    type="button"
                    data-concluir-parada={parada.pedidoId}
                    disabled={ocupado}
                    onClick={() =>
                      aoConcluir(parada.pedidoId, parada.numeroPedido)
                    }
                    className="mt-2 self-start rounded-full bg-marca px-4 py-2 text-xs font-medium text-marca-conteudo disabled:opacity-50"
                  >
                    Marcar como entregue
                  </button>
                ) : null}
              </span>
              {aoMover && ativas.length > 1 ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Subir entrega de ${parada.cliente.nomeExibicao}`}
                    data-subir-parada
                    disabled={ocupado || indice === 0}
                    onClick={() => aoMover(parada.pedidoId, -1)}
                    className="rounded-jaa border px-2 text-xs disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Descer entrega de ${parada.cliente.nomeExibicao}`}
                    data-descer-parada
                    disabled={ocupado || indice === ativas.length - 1}
                    onClick={() => aoMover(parada.pedidoId, 1)}
                    className="rounded-jaa border px-2 text-xs disabled:opacity-40"
                  >
                    ↓
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
        {ativas.length === 0 && (
          <li className="px-3 py-2 text-conteudo-suave">
            Nenhuma entrega ativa nesta saída.
          </li>
        )}
      </ol>

      {/* Paradas encerradas continuam visíveis como histórico da operação. */}
      {encerradas.length > 0 && (
        <ol
          aria-label="Entregas encerradas"
          className="flex flex-col gap-0.5 text-xs text-conteudo-suave"
        >
          {encerradas.map((parada) => (
            <li key={parada.id} data-parada-encerrada={parada.pedidoId}>
              <span aria-hidden>✓ </span>
              Pedido #{parada.numeroPedido} · {parada.cliente.nomeExibicao} —{" "}
              {parada.motivoEncerramento ??
                ROTULO_STATUS_PEDIDO[parada.statusPedido]}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ResumoSaida({ saida }: { saida: SaidaEntrega }) {
  const ativas = paradasAtivas(saida);
  return (
    <span className="flex flex-col">
      <span className="font-medium">
        {saida.empresa.nome} ·{" "}
        {saida.entregador?.nomeExibicao ?? "Sem entregador ainda"}
      </span>
      <span
        data-status-saida={saida.status}
        className="text-xs text-conteudo-suave"
      >
        {ROTULO_STATUS_SAIDA[saida.status]} · {ativas.length}{" "}
        {ativas.length === 1 ? "entrega ativa" : "entregas ativas"}
      </span>
    </span>
  );
}

/**
 * O que o CLIENTE vê sobre a própria entrega: só a posição derivada da sequência.
 * "Indo até você" significa primeira parada ativa de uma saída EM ANDAMENTO — não é GPS, e o Jaa
 * não afirma onde o entregador está.
 */
export function FilaDoCliente({ fila }: { fila: FilaDoPedido }) {
  if (fila.situacao === "sem_saida" || fila.situacao === "encerrado")
    return null;

  return (
    <p
      data-fila-pedido={fila.situacao}
      className={`text-xs ${fila.situacao === "indo_ate_voce" ? "font-semibold text-marca" : "text-conteudo-suave"}`}
    >
      {rotuloFila(fila)}
    </p>
  );
}
