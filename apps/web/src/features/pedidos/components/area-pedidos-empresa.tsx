"use client";

import { EVENTO_PEDIDO_NOVO, EVENTO_SAIDA_ATUALIZADA, entregadorPodeReceberAtribuicao, eventoSaidaAtualizadaSchema, type EntregaDoPedido, type EntregadorDaEmpresa, type ListaPedidosEmpresa as PaginaDaLista, type Pedido, type SaidaEntrega } from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { avisar } from "@/components/ui/avisos";
import { Carregando } from "@/components/ui/primitivos";
import { IconeConversa, IconeVoltar } from "@/components/ui/icones";
import { ConfirmarTransferencia, EntregaDoPedidoEmpresa } from "@/features/entregas/components/entrega-do-pedido";
import { atribuirEntrega, listarEntregadores, listarSaidasDaEmpresa, obterEntregaDoPedido } from "@/features/entregas/lib/api-entregas";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import type { ResultadoApi } from "@/lib/api";
import { useStatusPedido } from "../hooks/use-status-pedido";
import { avancarStatusPedido, cancelarPedido, listarPedidosDaEmpresa, obterPedidoDaEmpresa } from "../lib/api-pedidos";
import { CONSULTA_INICIAL, PEDIDOS_POR_PAGINA, cursorDaPagina, irParaAnterior, irParaProxima, paginaAtual, paginaFicouVazia, resumoDaPagina, trocarFiltro, type ConsultaPedidos } from "../lib/paginacao-pedidos";
import { AcoesPedidoEmpresa } from "./acoes-pedido-empresa";
import { DetalhePedido } from "./apresentacao-pedido";
import { FiltrosPedidos, ListaPedidosEmpresa, PaginacaoPedidos } from "./lista-pedidos-empresa";
import { LegendaStatusEntrega } from "./resumo-logistico-pedido";

/*
 * PEDIDOS DA EMPRESA: a empresa recebe, acompanha e conduz seus pedidos. Toda ação é autorizada e
 * validada pela API; a tela só mostra a próxima ação possível.
 *
 * Duas telas, uma de cada vez, na mesma área:
 *
 *   LISTA (filtros + página)  ── Abrir ──▶  PEDIDO (só ele)  ── Voltar ──▶  a MESMA lista
 *
 * O filtro e a página (`consulta`) vivem aqui e não são tocados ao abrir um pedido: voltar devolve a
 * pessoa exatamente aonde estava.
 */

type PaginaDePedidos = [ResultadoApi<PaginaDaLista>, Awaited<ReturnType<typeof listarSaidasDaEmpresa>>];

export function AreaPedidosEmpresa({
  empresaId,
  nomeEmpresa,
  aoAbrirConversa,
}: {
  empresaId: string;
  nomeEmpresa: string;
  // Abre a conversa DIRETA de sempre com o cliente, como a empresa (nada de "chat do pedido").
  aoAbrirConversa?: ((nomeUsuario: string) => void) | undefined;
}) {
  const [consulta, setConsulta] = useState<ConsultaPedidos>(CONSULTA_INICIAL);
  const [lista, setLista] = useState<PaginaDaLista | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Entrega do pedido aberto: quem está levando + histórico de atribuições.
  const [entrega, setEntrega] = useState<EntregaDoPedido | null>(null);
  const [entregadores, setEntregadores] = useState<EntregadorDaEmpresa[]>([]);
  const [saidas, setSaidas] = useState<SaidaEntrega[]>([]);
  // Atribuição pedindo confirmação: o pedido está numa saída que ainda não saiu.
  const [transferencia, setTransferencia] = useState<{ pedidoId: string; entregadorId: string } | null>(null);

  const filtro = consulta.filtro;
  const cursor = cursorDaPagina(consulta);
  const pedidos = lista?.pedidos ?? [];

  // Só a página pedida vem do servidor (10 por vez), com o total do filtro.
  const buscar = useCallback(
    (): Promise<PaginaDePedidos> => Promise.all([listarPedidosDaEmpresa(empresaId, { filtro, antesDe: cursor, limite: PEDIDOS_POR_PAGINA }), listarSaidasDaEmpresa(empresaId, false)]),
    [empresaId, filtro, cursor],
  );

  const adotar = useCallback(([resultado, rotas]: PaginaDePedidos) => {
    setCarregando(false);
    if (rotas.ok) setSaidas(rotas.dados.saidas);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    // A página deixou de existir (os pedidos dela saíram do filtro): recua em vez de ficar vazia.
    setConsulta((atual) => (paginaFicouVazia(atual, resultado.dados.pedidos.length) ? irParaAnterior(atual) : atual));
    setLista(resultado.dados);
  }, []);

  // "Atualizar" e as releituras depois de uma ação: a MESMA página e o MESMO filtro.
  const carregar = useCallback(async () => adotar(await buscar()), [adotar, buscar]);

  useEffect(() => {
    let ativo = true;
    void buscar().then((pagina) => {
      if (ativo) adotar(pagina);
    });
    return () => {
      ativo = false;
    };
  }, [buscar, adotar]);

  const navegar = (proxima: ConsultaPedidos) => {
    if (proxima === consulta) return;
    setCarregando(true);
    setConsulta(proxima);
  };

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

  /*
   * PEDIDO NOVO sem F5: `pedido:novo` chega só à identidade da empresa (pedido não é mensagem para
   * ela). A lista relê a página em que está (mesmo filtro, mesma página; o total anda). Reconectar
   * também relê: o que chegou com a conexão caída não vem por evento.
   */
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoChegarPedido = () => void carregar();
    const aoReconectar = () => void carregar();
    socket.on(EVENTO_PEDIDO_NOVO, aoChegarPedido);
    socket.on("connect", aoReconectar);
    return () => {
      socket.off(EVENTO_PEDIDO_NOVO, aoChegarPedido);
      socket.off("connect", aoReconectar);
    };
  }, [carregar]);

  // Status mudado aqui ou por outro operador: lista e pedido aberto acompanham sem F5.
  const abertoId = aberto?.id ?? null;

  useStatusPedido(
    useCallback(
      (evento) => {
        setLista((atual) => (atual ? { ...atual, pedidos: atual.pedidos.map((pedido) => (pedido.id === evento.pedido.id ? { ...pedido, status: evento.pedido.status } : pedido)) } : atual));
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

  /*
   * A lista e o pedido ocupam a mesma área, um de cada vez. Ao abrir, a tela do pedido começa do
   * topo; ao voltar, a lista reaparece na altura em que a pessoa a deixou.
   */
  const secaoRef = useRef<HTMLElement>(null);
  const rolagemDaLista = useRef(0);
  const areaRolavel = () => secaoRef.current?.closest<HTMLElement>("[data-area-de-trabalho]") ?? null;
  const mostrandoPedido = aberto !== null;
  useEffect(() => {
    const area = areaRolavel();
    if (area) area.scrollTop = mostrandoPedido ? 0 : rolagemDaLista.current;
  }, [mostrandoPedido]);

  async function abrir(pedidoId: string) {
    // Sempre relê do servidor: a lista local não é autorização nem fonte da verdade.
    const [resultado, daEntrega, quadro] = await Promise.all([obterPedidoDaEmpresa(empresaId, pedidoId), obterEntregaDoPedido(empresaId, pedidoId), listarEntregadores(empresaId)]);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    if (!aberto) rolagemDaLista.current = areaRolavel()?.scrollTop ?? 0;
    setAberto(resultado.dados);
    setEntrega(daEntrega.ok ? daEntrega.dados : null);
    // Só quem pode receber AGORA: vínculo ativo E disponível (o servidor confere de novo).
    setEntregadores(quadro.ok ? quadro.dados.entregadores.filter(entregadorPodeReceberAtribuicao) : []);
  }

  async function atribuir(pedidoId: string, entregadorId: string, transferirDaSaida = false) {
    setOcupado(true);
    try {
      const resultado = await atribuirEntrega(empresaId, pedidoId, entregadorId, entrega?.entregadorAtual?.id ?? null, transferirDaSaida);
      if (!resultado.ok) {
        // A saída do pedido ainda não saiu: a MESMA ação continua, depois de o gerente confirmar.
        if (resultado.codigo === "PEDIDO_EM_SAIDA_TRANSFERIVEL") {
          setErro(null);
          setTransferencia({ pedidoId, entregadorId });
          return;
        }
        // Atribuição concorrente (ou status mudado): relê para mostrar a situação real. O aviso vem
        // DEPOIS da releitura — `abrir` limpa o erro, e a recusa sumia como se tivesse dado certo.
        await abrir(pedidoId);
        setErro(resultado.mensagem);
        return;
      }
      setErro(null);
      setTransferencia(null);
      setEntrega(resultado.dados);
      const nome = resultado.dados.entregadorAtual?.pessoa.nomeExibicao;
      avisar.sucesso(nome ? `Pedido atribuído a ${nome}.` : "Pedido atribuído.");
      // Saídas e lista mudam (o pedido pode ter saído de uma formação): relê sem F5.
      await carregar();
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
        // O aviso vem por último: `abrir` limpa o erro.
        if (aberto) await abrir(aberto.id);
        await carregar();
        setErro(resultado.mensagem);
        return;
      }
      setErro(null);
      setAberto(resultado.dados);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  function voltarParaPedidos() {
    setErro(null);
    setTransferencia(null);
    setAberto(null);
  }

  const resumo = resumoDaPagina({ pagina: paginaAtual(consulta), quantidadeNaPagina: pedidos.length, total: lista?.total ?? 0, temProxima: Boolean(lista?.proximoCursor) });

  return (
    <section ref={secaoRef} aria-label="Pedidos da empresa" data-tela-de-pedidos={aberto ? "pedido" : "lista"} className="flex flex-col gap-3 rounded-jaa border border-borda p-3">
      {aberto ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" data-voltar-para-pedidos onClick={voltarParaPedidos} className="flex min-h-10 items-center gap-1.5 self-start rounded-jaa-compacto pr-2 text-sm font-medium text-marca transition-colors hover:bg-superficie-suave">
            <IconeVoltar className="h-4 w-4" />
            Voltar para pedidos
          </button>
          {aoAbrirConversa && (
            <button
              type="button"
              data-conversar-com-cliente={aberto.cliente.nomeUsuario}
              onClick={() => aoAbrirConversa(aberto.cliente.nomeUsuario)}
              className="flex min-h-10 items-center gap-1.5 rounded-jaa-compacto border border-borda px-3 text-sm font-medium text-marca transition-colors hover:bg-superficie-suave"
            >
              <IconeConversa className="h-4 w-4" />
              Conversar com {aberto.cliente.nomeExibicao}
            </button>
          )}
          </div>
          <DetalhePedido
            pedido={aberto}
            titulo={`Pedido #${aberto.numero} — ${aberto.cliente.nomeExibicao}`}
            acoes={
              <>
                <EntregaDoPedidoEmpresa status={aberto.status} entrega={entrega} entregadoresAtivos={entregadores} ocupado={ocupado} aoAtribuir={(entregadorId) => void atribuir(aberto.id, entregadorId)} />
                {transferencia?.pedidoId === aberto.id && (
                  <ConfirmarTransferencia
                    nomeEntregador={entregadores.find((item) => item.id === transferencia.entregadorId)?.pessoa.nomeExibicao ?? null}
                    ocupado={ocupado}
                    aoConfirmar={() => void atribuir(transferencia.pedidoId, transferencia.entregadorId, true)}
                    aoCancelar={() => setTransferencia(null)}
                  />
                )}
                <AcoesPedidoEmpresa
                  pedido={aberto}
                  ocupado={ocupado}
                  aoAvancar={() => void operar(() => avancarStatusPedido(empresaId, aberto.id, aberto.status))}
                  aoCancelar={(motivo) => void operar(() => cancelarPedido(empresaId, aberto.id, aberto.status, motivo))}
                />
              </>
            }
          />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Pedidos — {nomeEmpresa}</h3>
            <button type="button" data-atualizar-pedidos onClick={() => void carregar()} className="rounded-jaa border px-2 py-1 text-xs">
              Atualizar
            </button>
          </div>

          <FiltrosPedidos filtro={filtro} aoFiltrar={(novo) => navegar(trocarFiltro(consulta, novo))} />
          <LegendaStatusEntrega />
          {lista === null && !erro ? <Carregando texto="Carregando pedidos…" /> : <ListaPedidosEmpresa pedidos={pedidos} saidas={saidas} aoAbrir={(pedido) => void abrir(pedido.id)} />}
          <PaginacaoPedidos resumo={resumo} ocupado={carregando} aoAnterior={() => navegar(irParaAnterior(consulta))} aoProxima={() => navegar(irParaProxima(consulta, lista?.proximoCursor ?? null))} />
        </>
      )}

      {erro && (
        <p role="alert" className="text-sm text-perigo">
          {erro}
        </p>
      )}
    </section>
  );
}
