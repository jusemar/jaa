"use client";

import { MOTIVOS_CANCELAMENTO_SUGERIDOS, MOTIVO_CANCELAMENTO_TAMANHO_MAXIMO, ROTULO_ACAO_AVANCAR, podeCancelarPedido, type Pedido } from "@jaa/contratos";
import { useState } from "react";

/**
 * Ações operacionais do pedido: só a PRÓXIMA ação válida (nunca sete botões de status) e, enquanto
 * fizer sentido, o cancelamento — que exige confirmação explícita e um motivo curto.
 */
export function AcoesPedidoEmpresa({
  pedido,
  ocupado,
  aoAvancar,
  aoCancelar,
}: {
  pedido: Pedido;
  ocupado: boolean;
  aoAvancar: () => void;
  aoCancelar: (motivo: string) => void;
}) {
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState<string>(MOTIVOS_CANCELAMENTO_SUGERIDOS[0]);
  const [outroMotivo, setOutroMotivo] = useState("");
  const rotuloAvancar = ROTULO_ACAO_AVANCAR[pedido.status];
  const motivoEscolhido = (motivo === "Outro motivo" ? outroMotivo : motivo).trim();

  if (!rotuloAvancar && !podeCancelarPedido(pedido.status)) {
    return (
      <p data-sem-acoes className="text-xs text-zinc-500">
        Este pedido está encerrado.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {rotuloAvancar && (
          <button type="button" data-avancar-pedido disabled={ocupado} onClick={aoAvancar} className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {rotuloAvancar}
          </button>
        )}
        {podeCancelarPedido(pedido.status) && !cancelando && (
          <button type="button" data-cancelar-pedido onClick={() => setCancelando(true)} className="rounded border border-red-600 px-3 py-1.5 text-sm text-red-700">
            Cancelar pedido
          </button>
        )}
      </div>

      {/* Cancelar não acontece por um clique: exige motivo e confirmação. */}
      {cancelando && (
        <div role="group" aria-label="Cancelar pedido" className="flex flex-col gap-2 rounded border border-red-300 bg-red-50 p-2 text-sm">
          <p>Cancelar este pedido? O cliente verá o cancelamento e o motivo.</p>
          <label className="flex flex-col gap-1 text-xs">
            Motivo
            <select name="motivoCancelamento" value={motivo} onChange={(evento) => setMotivo(evento.target.value)} className="rounded border border-zinc-300 px-2 py-1 text-sm">
              {[...MOTIVOS_CANCELAMENTO_SUGERIDOS, "Outro motivo"].map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
          </label>
          {motivo === "Outro motivo" && (
            <input
              name="outroMotivo"
              value={outroMotivo}
              maxLength={MOTIVO_CANCELAMENTO_TAMANHO_MAXIMO}
              placeholder="Explique em poucas palavras"
              onChange={(evento) => setOutroMotivo(evento.target.value)}
              className="rounded border border-zinc-300 px-2 py-1"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              data-confirmar-cancelamento
              disabled={ocupado || motivoEscolhido.length < 3}
              onClick={() => {
                aoCancelar(motivoEscolhido);
                setCancelando(false);
              }}
              className="rounded bg-red-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Confirmar cancelamento
            </button>
            <button type="button" onClick={() => setCancelando(false)} className="rounded border px-3 py-1.5 text-sm">
              Manter pedido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
