"use client";

import { EVENTO_SAIDA_ATUALIZADA, entregadorPodeReceberAtribuicao, eventoSaidaAtualizadaSchema, type EntregaDoPedido, type EntregadorDaEmpresa, type FiltroPedidosEmpresa, type Pedido, type PedidoDaEmpresa, type SaidaEntrega } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { EntregaDoPedidoEmpresa } from "@/features/entregas/components/entrega-do-pedido";
import { atribuirEntrega, listarEntregadores, listarSaidasDaEmpresa, obterEntregaDoPedido } from "@/features/entregas/lib/api-entregas";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { useStatusPedido } from "../hooks/use-status-pedido";
import { avancarStatusPedido, cancelarPedido, listarPedidosDaEmpresa, obterPedidoDaEmpresa } from "../lib/api-pedidos";
import { AcoesPedidoEmpresa } from "./acoes-pedido-empresa";
import { DetalhePedido } from "./apresentacao-pedido";
import { FiltrosPedidos, ListaPedidosEmpresa } from "./lista-pedidos-empresa";
import { LegendaStatusEntrega } from "./resumo-logistico-pedido";

// Interface TÉCNICA da operação: a empresa recebe, acompanha e conduz seus pedidos. Não é o design final.
// Toda ação é autorizada e validada pela API; a tela só mostra a próxima ação possível.

export function AreaPedidosEmpresa({ empresaId, nomeEmpresa }: { empresaId: string; nomeEmpresa: string }) {
  const [filtro, setFiltro] = useState<FiltroPedidosEmpresa>("todos");
  const [pedidos, setPedidos] = useState<PedidoDaEmpresa[]>([]);
  const [aberto, setAberto] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Entrega do pedido aberto: quem está levando + histórico de atribuições.
  const [entrega, setEntrega] = useState<EntregaDoPedido | null>(null);
  const [entregadores, setEntregadores] = useState<EntregadorDaEmpresa[]>([]);
  const [saidas, setSaidas] = useState<SaidaEntrega[]>([]);

  const carregar = useCallback(
    async (filtroAtual: FiltroPedidosEmpresa) => {
      const [resultado, rotas] = await Promise.all([listarPedidosDaEmpresa(empresaId, { filtro: filtroAtual }), listarSaidasDaEmpresa(empresaId, false)]);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setErro(null);
      setPedidos(resultado.dados.pedidos);
      if (rotas.ok) setSaidas(rotas.dados.saidas);
    },
    [empresaId],
  );

  useEffect(() => {
    let ativo = true;
    void Promise.all([listarPedidosDaEmpresa(empresaId, { filtro }), listarSaidasDaEmpresa(empresaId, false)]).then(([resultado, rotas]) => {
      if (!ativo) return;
      if (resultado.ok) setPedidos(resultado.dados.pedidos);
      else setErro(resultado.mensagem);
      if (rotas.ok) setSaidas(rotas.dados.saidas);
    });
    return () => {
      ativo = false;
    };
  }, [empresaId, filtro]);

  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizarSaida = (evento: unknown) => {
      const resultado = eventoSaidaAtualizadaSchema.safeParse(evento);
      if (!resultado.success) return;
      const atualizada = resultado.data.saida;
      setSaidas((atuais) => (atuais.some((item) => item.id === atualizada.id) ? atuais.map((item) => (item.id === atualizada.id ? atualizada : item)) : [atualizada, ...atuais]));
    };
    socket.on(EVENTO_SAIDA_ATUALIZADA, aoAtualizarSaida);
    return () => {
      socket.off(EVENTO_SAIDA_ATUALIZADA, aoAtualizarSaida);
    };
  }, []);

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
    const [resultado, daEntrega, quadro] = await Promise.all([obterPedidoDaEmpresa(empresaId, pedidoId), obterEntregaDoPedido(empresaId, pedidoId), listarEntregadores(empresaId)]);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    setAberto(resultado.dados);
    setEntrega(daEntrega.ok ? daEntrega.dados : null);
    // Só quem pode receber AGORA: vínculo ativo E disponível (o servidor confere de novo).
    setEntregadores(quadro.ok ? quadro.dados.entregadores.filter(entregadorPodeReceberAtribuicao) : []);
  }

  async function atribuir(pedidoId: string, entregadorId: string) {
    setOcupado(true);
    try {
      const resultado = await atribuirEntrega(empresaId, pedidoId, entregadorId, entrega?.entregadorAtual?.id ?? null);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        // Atribuição concorrente (ou status mudado): relê para mostrar a situação real.
        await abrir(pedidoId);
        return;
      }
      setErro(null);
      setEntrega(resultado.dados);
    } finally {
      setOcupado(false);
    }
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
    <section aria-label="Pedidos da empresa" className="flex flex-col gap-3 rounded-jaa border border-borda p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Pedidos — {nomeEmpresa}</h3>
        <button type="button" onClick={() => void carregar(filtro)} className="rounded-jaa border px-2 py-1 text-xs">
          Atualizar
        </button>
      </div>

      <FiltrosPedidos filtro={filtro} aoFiltrar={setFiltro} />
      <LegendaStatusEntrega />
      <ListaPedidosEmpresa pedidos={pedidos} saidas={saidas} aoAbrir={(pedido) => void abrir(pedido.id)} />

      {aberto && (
        <DetalhePedido
          pedido={aberto}
          aoFechar={() => setAberto(null)}
          acoes={
            <>
              <EntregaDoPedidoEmpresa
                status={aberto.status}
                entrega={entrega}
                entregadoresAtivos={entregadores}
                ocupado={ocupado}
                aoAtribuir={(entregadorId) => void atribuir(aberto.id, entregadorId)}
              />
              <AcoesPedidoEmpresa
                pedido={aberto}
                ocupado={ocupado}
                aoAvancar={() => void operar(() => avancarStatusPedido(empresaId, aberto.id, aberto.status))}
                aoCancelar={(motivo) => void operar(() => cancelarPedido(empresaId, aberto.id, aberto.status, motivo))}
              />
            </>
          }
        />
      )}

      {erro && (
        <p role="alert" className="text-sm text-perigo">
          {erro}
        </p>
      )}
    </section>
  );
}
