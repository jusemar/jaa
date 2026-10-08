"use client";

import {
  ROTULO_STATUS_PEDIDO,
  ROTULO_STATUS_SAIDA,
  formatarEnderecoResumido,
  paradasAtivas,
  podeRecalcularRota,
  rotuloFila,
  ROTULO_PAGAMENTO_ENTREGA,
  TEXTO_AVISO_ENTREGA_PROXIMA,
  type EntregaAtribuida,
  type FilaDoPedido,
  type SaidaEntrega,
} from "@jaa/contratos";
import { useState } from "react";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { ResumoPercurso } from "./percurso-saida";

/*
 * Apresentação da SAÍDA. A ordem é uma SUGESTÃO do Jaa e o entregador pode mudá-la; quando há motor
 * de rotas configurado, o PERCURSO daquela ordem é calculado pelas ruas e aparece com distância e
 * tempo de TRAJETO. A interface nunca fala em "melhor rota" nem transforma trajeto em previsão de
 * entrega. "Próxima" é a primeira parada ativa da sequência — posição operacional, não localização.
 */

/** Move um pedido uma posição no RASCUNHO da ordem (fora dos limites, nada muda). */
export function moverNoRascunho(ordem: readonly string[], pedidoId: string, direcao: -1 | 1): string[] {
  const nova = [...ordem];
  const de = nova.indexOf(pedidoId);
  const para = de + direcao;
  if (de < 0 || para < 0 || para >= nova.length) return nova;
  [nova[de], nova[para]] = [nova[para] as string, nova[de] as string];
  return nova;
}

export function SequenciaDaSaida({
  saida,
  entregas = [],
  mostrarPercurso = true,
  aoSalvarOrdem,
  aoRecalcularRota,
  aoConcluir,
  aoConversar,
  ocupado,
}: {
  saida: SaidaEntrega;
  entregas?: EntregaAtribuida[];
  mostrarPercurso?: boolean;
  /*
   * Ausente = só leitura (a empresa acompanha; quem reordena é o entregador). A ordem inteira vai
   * de uma vez, com a versão que a tela viu: a API recusa (409) se alguém mudou antes.
   */
  aoSalvarOrdem?: ((pedidoIds: string[]) => Promise<boolean>) | undefined;
  // "Recalcular melhor rota": o Jaa escolhe de novo a ordem das pendentes (substitui a atual).
  aoRecalcularRota?: (() => Promise<boolean>) | undefined;
  aoConcluir?: ((pedidoId: string, numeroPedido: number) => void) | undefined;
  // Abre a conversa DIRETA de sempre com o cliente da parada (nada de chat de entrega).
  aoConversar?: ((nomeUsuario: string) => void) | undefined;
  ocupado?: boolean;
}) {
  const ativas = paradasAtivas(saida);
  // "Alterar ordem": o entregador arruma um RASCUNHO e confirma uma vez só (uma versão, um percurso).
  const [rascunho, setRascunho] = useState<string[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const editando = rascunho !== null;
  const porPedido = new Map(ativas.map((parada) => [parada.pedidoId, parada]));
  const ordemExibida = editando ? rascunho.flatMap((pedidoId) => porPedido.get(pedidoId) ?? []) : ativas;
  const podeReordenar = Boolean(aoSalvarOrdem) && ativas.length > 1;
  const ordemMudou = editando && rascunho.some((pedidoId, indice) => ativas[indice]?.pedidoId !== pedidoId);

  // Um toque = uma chamada: o botão trava até a resposta (o servidor também recusa um segundo em curso).
  async function recalcularRota() {
    if (!aoRecalcularRota || recalculando) return;
    setRecalculando(true);
    try {
      await aoRecalcularRota();
    } finally {
      setRecalculando(false);
    }
  }

  async function salvarOrdem() {
    if (!rascunho || !aoSalvarOrdem) return;
    setSalvando(true);
    try {
      if (await aoSalvarOrdem(rascunho)) setRascunho(null);
    } finally {
      setSalvando(false);
    }
  }
  const entregasPorPedido = new Map(
    entregas.map((entrega) => [entrega.pedidoId, entrega]),
  );
  const encerradas = saida.paradas
    .filter((parada) => parada.encerradaEm !== null)
    .sort((a, b) => a.posicao - b.posicao);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-conteudo-suave">
        {editando
          ? "Toque nas setas até ficar na ordem em que você vai entregar. Depois, confirme."
          : ativas.length > 1
            ? "Sequência sugerida pelo Jaaa — você pode mudar a ordem se conhecer um caminho melhor."
            : "Parada única nesta rota."}
      </p>
      {podeReordenar && (
        <div className="flex flex-wrap gap-2">
          {editando ? (
            <>
              <button
                type="button"
                data-salvar-ordem
                disabled={ocupado || salvando || !ordemMudou}
                onClick={() => void salvarOrdem()}
                className="rounded-full bg-marca px-4 py-2 text-xs font-medium text-marca-conteudo disabled:opacity-50"
              >
                {salvando ? "Salvando…" : "Confirmar ordem"}
              </button>
              <button type="button" data-cancelar-ordem disabled={salvando} onClick={() => setRascunho(null)} className="rounded-full border border-borda px-4 py-2 text-xs">
                Cancelar
              </button>
            </>
          ) : (
            <>
            {aoRecalcularRota && podeRecalcularRota(saida) && (
              <button
                type="button"
                data-recalcular-rota
                disabled={ocupado || recalculando}
                aria-busy={recalculando || undefined}
                onClick={() => void recalcularRota()}
                className="rounded-full bg-marca px-4 py-2 text-xs font-medium text-marca-conteudo disabled:opacity-50"
              >
                {recalculando ? "Recalculando…" : "Recalcular melhor rota"}
              </button>
            )}
            <button
              type="button"
              data-alterar-ordem
              disabled={ocupado}
              onClick={() => setRascunho(ativas.map((parada) => parada.pedidoId))}
              className="rounded-full border border-borda px-4 py-2 text-xs font-medium disabled:opacity-50"
            >
              Alterar ordem
            </button>
            </>
          )}
        </div>
      )}
      {mostrarPercurso ? <ResumoPercurso saida={saida} /> : null}
      <ol
        aria-label="Sequência da saída"
        className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm"
      >
        {ordemExibida.map((parada, indice) => {
          const entrega = entregasPorPedido.get(parada.pedidoId);
          return (
            <li
              key={parada.id}
              data-parada={parada.pedidoId}
              data-posicao={indice + 1}
              className={`flex items-start justify-between gap-2 px-3 py-3 ${indice === 0 ? "border-l-4 border-l-marca bg-marca/5" : ""}`}
            >
              {/* O NÚMERO da ordem, grande: é ele que o entregador segue na rua. */}
              <span aria-hidden="true" data-numero-parada={indice + 1} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-marca text-sm font-bold text-marca-conteudo">
                {indice + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
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
                <span className="flex flex-wrap items-center gap-2 text-xs text-conteudo-suave">
                  Cliente: {parada.cliente.nomeExibicao}
                  {aoConversar && !editando ? (
                    <button
                      type="button"
                      data-conversar-cliente={parada.cliente.nomeUsuario}
                      onClick={() => aoConversar(parada.cliente.nomeUsuario)}
                      className="rounded-full border border-borda px-2 py-0.5 text-[11px] font-medium text-marca"
                    >
                      Conversar
                    </button>
                  ) : null}
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
                !editando &&
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
              {editando ? (
                <span className="flex shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Subir entrega de ${parada.cliente.nomeExibicao} para a posição ${indice}`}
                    data-subir-parada
                    disabled={salvando || indice === 0}
                    onClick={() => setRascunho((atual) => (atual ? moverNoRascunho(atual, parada.pedidoId, -1) : atual))}
                    className="grid h-9 w-9 place-items-center rounded-jaa border text-sm disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Descer entrega de ${parada.cliente.nomeExibicao} para a posição ${indice + 2}`}
                    data-descer-parada
                    disabled={salvando || indice === ordemExibida.length - 1}
                    onClick={() => setRascunho((atual) => (atual ? moverNoRascunho(atual, parada.pedidoId, 1) : atual))}
                    className="grid h-9 w-9 place-items-center rounded-jaa border text-sm disabled:opacity-40"
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
      className={`flex flex-col text-xs ${fila.situacao === "indo_ate_voce" ? "font-semibold text-marca" : "text-conteudo-suave"}`}
    >
      <span>{rotuloFila(fila)}</span>
      {fila.situacao === "indo_ate_voce" && <span className="font-normal text-conteudo">{TEXTO_AVISO_ENTREGA_PROXIMA.orientacao}</span>}
    </p>
  );
}
