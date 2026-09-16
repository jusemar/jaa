"use client";

import type { FiltroPedidosEmpresa, Pedido, PedidoDaEmpresa } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { useStatusPedido } from "../hooks/use-status-pedido";
import { avancarStatusPedido, cancelarPedido, listarPedidosDaEmpresa, obterPedidoDaEmpresa } from "../lib/api-pedidos";
import { AcoesPedidoEmpresa } from "./acoes-pedido-empresa";
import { DetalhePedido } from "./apresentacao-pedido";
import { FiltrosPedidos, ListaPedidosEmpresa } from "./lista-pedidos-empresa";

// Interface TÉCNICA da operação: a empresa recebe, acompanha e conduz seus pedidos. Não é o design final.
// Toda ação é autorizada e validada pela API; a tela só mostra a próxima ação possível.

export function AreaPedidosEmpresa({ empresaId, nomeEmpresa }: { empresaId: string; nomeEmpresa: string }) {
  const [filtro, setFiltro] = useState<FiltroPedidosEmpresa>("todos");
  const [pedidos, setPedidos] = useState<PedidoDaEmpresa[]>([]);
  const [aberto, setAberto] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(
    async (filtroAtual: FiltroPedidosEmpresa) => {
      const resultado = await listarPedidosDaEmpresa(empresaId, { filtro: filtroAtual });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setErro(null);
      setPedidos(resultado.dados.pedidos);
    },
    [empresaId],
  );

  useEffect(() => {
    let ativo = true;
    void listarPedidosDaEmpresa(empresaId, { filtro }).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setPedidos(resultado.dados.pedidos);
      else setErro(resultado.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, [empresaId, filtro]);

  // Status mudado aqui ou por outro operador: lista e pedido aberto acompanham sem F5.
  const abertoId = aberto?.id ?? null;
  useStatusPedido(
    useCallback(
      (evento) => {
        setPedidos((atuais) => atuais.map((pedido) => (pedido.id === evento.pedido.id ? { ...pedido, status: evento.pedido.status } : pedido)));
        // O detalhe (incluindo a timeline) é relido do servidor, nunca remendado pelo evento.
        if (abertoId === evento.pedido.id) {
          void obterPedidoDaEmpresa(empresaId, evento.pedido.id).then((resultado) => {
            if (resultado.ok) setAberto(resultado.dados);
          });
        }
      },
      [abertoId, empresaId],
    ),
  );

  async function abrir(pedidoId: string) {
    // Sempre relê do servidor: a lista local não é autorização nem fonte da verdade.
    const resultado = await obterPedidoDaEmpresa(empresaId, pedidoId);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    setAberto(resultado.dados);
  }

  async function operar(executar: () => Promise<Awaited<ReturnType<typeof obterPedidoDaEmpresa>>>) {
    setOcupado(true);
    try {
      const resultado = await executar();
      if (!resultado.ok) {
        // Inclui o caso de outro operador ter mudado o pedido: recarrega para mostrar a situação real.
        setErro(resultado.mensagem);
        if (aberto) await abrir(aberto.id);
        await carregar(filtro);
        return;
      }
      setErro(null);
      setAberto(resultado.dados);
      await carregar(filtro);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section aria-label="Pedidos da empresa" className="flex flex-col gap-3 rounded border border-zinc-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Pedidos — {nomeEmpresa}</h3>
        <button type="button" onClick={() => void carregar(filtro)} className="rounded border px-2 py-1 text-xs">
          Atualizar
        </button>
      </div>

      <FiltrosPedidos filtro={filtro} aoFiltrar={setFiltro} />
      <ListaPedidosEmpresa pedidos={pedidos} aoAbrir={(pedido) => void abrir(pedido.id)} />

      {aberto && (
        <DetalhePedido
          pedido={aberto}
          aoFechar={() => setAberto(null)}
          acoes={
            <AcoesPedidoEmpresa
              pedido={aberto}
              ocupado={ocupado}
              aoAvancar={() => void operar(() => avancarStatusPedido(empresaId, aberto.id, aberto.status))}
              aoCancelar={(motivo) => void operar(() => cancelarPedido(empresaId, aberto.id, aberto.status, motivo))}
            />
          }
        />
      )}

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
    </section>
  );
}
