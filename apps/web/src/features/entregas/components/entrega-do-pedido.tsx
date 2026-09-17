"use client";

import { ROTULO_STATUS_ENTREGADOR, type EntregaDoPedido, type EntregadorDaEmpresa, type StatusPedido } from "@jaa/contratos";
import { useState } from "react";
import { formatarHorarioMensagem } from "@/features/conversas/lib/horarios";

/**
 * ENTREGA no detalhe do pedido (visão da empresa): quem está levando, com quem já esteve e a ação de
 * atribuir/trocar. Só faz sentido quando o pedido está pronto ou já em rua.
 * O cliente não vê nada disto: trocas internas de entregador são assunto operacional da empresa.
 */

const STATUS_COM_ENTREGADOR = new Set<StatusPedido>(["pronto", "saiu_para_entrega", "em_rota"]);

export function EntregaDoPedidoEmpresa({
  status,
  entrega,
  entregadoresAtivos,
  ocupado,
  aoAtribuir,
}: {
  status: StatusPedido;
  entrega: EntregaDoPedido | null;
  entregadoresAtivos: EntregadorDaEmpresa[];
  ocupado: boolean;
  aoAtribuir: (entregadorId: string) => void;
}) {
  const [escolhendo, setEscolhendo] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const atual = entrega?.entregadorAtual ?? null;
  const podeAtribuir = STATUS_COM_ENTREGADOR.has(status);

  return (
    <div data-entrega-pedido className="flex flex-col gap-1 rounded-jaa border border-borda p-2 text-xs">
      <p className="font-medium">Entregador</p>
      <p data-entregador-atual={atual?.id ?? ""}>
        {atual ? `${atual.pessoa.nomeExibicao} (@${atual.pessoa.nomeUsuario})` : "Nenhum"}
        {atual && atual.status !== "ativo" && <span className="text-aviso"> — {ROTULO_STATUS_ENTREGADOR[atual.status]}</span>}
      </p>

      {podeAtribuir && !escolhendo && (
        <button type="button" data-atribuir-entregador onClick={() => setEscolhendo(true)} className="self-start rounded-jaa border px-2 py-1">
          {atual ? "Trocar entregador" : "Atribuir entregador"}
        </button>
      )}

      {escolhendo && (
        <div role="group" aria-label="Escolher entregador" className="flex flex-col gap-1 rounded-jaa border border-borda p-2">
          {entregadoresAtivos.length === 0 ? (
            <p className="text-conteudo-suave">Nenhum entregador ativo. Convide alguém em &quot;Entregadores&quot;.</p>
          ) : (
            entregadoresAtivos.map((entregador) => (
              <label key={entregador.id} className="flex items-center gap-2">
                <input type="radio" name="entregadorEscolhido" value={entregador.id} checked={escolhido === entregador.id} onChange={() => setEscolhido(entregador.id)} />
                {entregador.pessoa.nomeExibicao}
              </label>
            ))
          )}
          <span className="flex gap-2">
            <button
              type="button"
              data-confirmar-atribuicao
              disabled={ocupado || escolhido === null}
              onClick={() => {
                if (escolhido) aoAtribuir(escolhido);
                setEscolhendo(false);
                setEscolhido(null);
              }}
              className="rounded bg-marca px-2 py-1 text-white disabled:opacity-50"
            >
              Confirmar atribuição
            </button>
            <button type="button" onClick={() => setEscolhendo(false)} className="rounded-jaa border px-2 py-1">
              Cancelar
            </button>
          </span>
        </div>
      )}

      {/* Auditoria operacional: quem esteve com o pedido antes continua registrado. */}
      {entrega && entrega.historico.length > 0 && (
        <ol aria-label="Histórico de entregadores" className="flex flex-col gap-0.5 text-conteudo-suave">
          {entrega.historico.map((evento) => (
            <li key={evento.id} data-evento-atribuicao>
              {formatarHorarioMensagem(evento.atribuidoEm)} — {evento.entregador.nomeExibicao}
              {evento.encerradoEm && ` (encerrado${evento.motivoEncerramento ? `: ${evento.motivoEncerramento}` : ""})`}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
