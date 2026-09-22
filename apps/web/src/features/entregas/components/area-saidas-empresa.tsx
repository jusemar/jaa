"use client";

import {
  EVENTO_POSICAO_ENTREGADOR,
  EVENTO_SAIDA_ATUALIZADA,
  EVENTO_FILA_ATUALIZADA,
  eventoFilaAtualizadaSchema,
  eventoPosicaoEntregadorSchema,
  rotuloUltimaPosicao,
  ROTULO_STATUS_SAIDA,
  entregadorPodeReceberAtribuicao,
  eventoSaidaAtualizadaSchema,
  formatarEnderecoResumido,
  type EntregadorDaEmpresa,
  type ConfiguracaoDespacho,
  type PedidoDaEmpresa,
  type PosicaoEntregador,
  type PainelOperacional,
  type SaidaEntrega,
  type StatusSaida,
} from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { listarPedidosDaEmpresa } from "@/features/pedidos/lib/api-pedidos";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { criarSaida, liberarSaida, listarEntregadores, listarPosicoesDaEmpresa, listarSaidasDaEmpresa, obterPainelDespacho, obterPainelOperacional } from "../lib/api-entregas";
import { MapaPercurso } from "./mapa-percurso";
import { formatarEspera } from "./painel-despacho";
import { SequenciaDaSaida } from "./saida-apresentacao";

// Saída sem entregador: dizer o motivo é mais útil para o gestor do que um espaço vazio.
export function rotuloStatusSaida(saida: SaidaEntrega): string {
  if (saida.status === "em_andamento") return "Em entrega";
  return ROTULO_STATUS_SAIDA[saida.status];
}

export function identificacaoDoEntregador(saida: Pick<SaidaEntrega, "status" | "entregador">): string {
  if (saida.entregador) return `Entregador: ${saida.entregador.nomeExibicao}`;
  return saida.status === "em_formacao" ? "Juntando pedidos" : "Aguardando entregador";
}

const FILTROS = [
  { id: "todos", rotulo: "Todos", vazio: "Nenhuma rota encontrada.", statuses: null },
  { id: "formacao", rotulo: "Em formação", vazio: "Nenhuma rota em formação.", statuses: ["em_formacao"] },
  { id: "retirada", rotulo: "Aguardando retirada", vazio: "Nenhuma rota aguardando retirada.", statuses: ["aguardando_entregador", "preparada", "liberada_retirada"] },
  { id: "andamento", rotulo: "Em andamento", vazio: "Nenhuma rota em andamento.", statuses: ["em_andamento"] },
  { id: "concluidas", rotulo: "Concluídas", vazio: "Nenhuma rota concluída.", statuses: ["concluida"] },
] as const satisfies ReadonlyArray<{ id: string; rotulo: string; vazio: string; statuses: readonly StatusSaida[] | null }>;

export type FiltroOperacao = (typeof FILTROS)[number]["id"];

export function filtrarSaidasDaOperacao(saidas: SaidaEntrega[], filtro: FiltroOperacao): SaidaEntrega[] {
  const statuses = FILTROS.find((item) => item.id === filtro)?.statuses ?? null;
  return statuses ? saidas.filter((saida) => statuses.some((status) => status === saida.status)) : saidas;
}

export function classeStatusSaida(status: StatusSaida): string {
  switch (status) {
    case "em_formacao":
      return "border-ouro/60 bg-aviso/10 text-aviso";
    case "aguardando_entregador":
      return "border-ouro/60 bg-aviso/10 text-aviso";
    case "preparada":
    case "liberada_retirada":
      return "border-marca/40 bg-marca-suave text-marca";
    case "em_andamento":
      return "border-marca bg-marca text-marca-conteudo";
    case "concluida":
      return "border-borda bg-superficie-suave text-conteudo-suave";
  }
}

function nomeDaRota(saida: SaidaEntrega): string {
  if (!saida.zonaPrincipal) return "Rota manual";
  return `Rota ${[saida.zonaPrincipal.nome, ...saida.zonasCombinadas.map((zona) => zona.nome)].join(" + ")}`;
}

function resumoDosPedidos(numeros: number[]): string {
  const principais = numeros.slice(0, 3).map((numero) => `#${numero}`).join(", ");
  const restantes = numeros.length - 3;
  return restantes > 0 ? `${principais} +${restantes}` : principais;
}

/**
 * SAÍDAS DE ENTREGA da empresa: montar à mão (vários pedidos prontos + um entregador), acompanhar as
 * que a automação montou e liberar para retirada. Acompanhar aqui é a SEQUÊNCIA OPERACIONAL —
 * não é localização em tempo real do entregador.
 */
export function AreaSaidasEmpresa({
  empresaId,
  nomeEmpresa,
  saidasIniciais = [],
  rotasAbertasIniciais = [],
}: {
  empresaId: string;
  nomeEmpresa: string;
  saidasIniciais?: SaidaEntrega[];
  rotasAbertasIniciais?: string[];
}) {
  const [saidas, setSaidas] = useState<SaidaEntrega[]>(() => saidasIniciais);
  const [prontos, setProntos] = useState<PedidoDaEmpresa[]>([]);
  const [entregadores, setEntregadores] = useState<EntregadorDaEmpresa[]>([]);
  const [posicoes, setPosicoes] = useState<PosicaoEntregador[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [entregadorId, setEntregadorId] = useState<string>("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [configuracao, setConfiguracao] = useState<ConfiguracaoDespacho | null>(null);
  const [mapasAbertos, setMapasAbertos] = useState<string[]>([]);
  const [rotasAbertas, setRotasAbertas] = useState<string[]>(() => rotasAbertasIniciais);
  const [filtro, setFiltro] = useState<FiltroOperacao>("todos");
  const [operacaoEntregadores, setOperacaoEntregadores] = useState<PainelOperacional | null>(null);

  const carregar = useCallback(async () => {
    const [lista, pedidos, quadro, despacho, operacional] = await Promise.all([
      listarSaidasDaEmpresa(empresaId, false),
      // Só pedidos PRONTOS entram numa saída nova.
      listarPedidosDaEmpresa(empresaId, { filtro: "prontos" }),
      listarEntregadores(empresaId),
      obterPainelDespacho(empresaId),
      obterPainelOperacional(empresaId),
    ]);
    if (lista.ok) setSaidas(lista.dados.saidas);
    else setErro(lista.mensagem);
    if (pedidos.ok) setProntos(pedidos.dados.pedidos);
    // Só entregador ativo E disponível recebe saída nova (o servidor confere de novo).
    if (quadro.ok) setEntregadores(quadro.dados.entregadores.filter(entregadorPodeReceberAtribuicao));
    if (operacional.ok) setOperacaoEntregadores(operacional.dados);
    if (despacho.ok) setConfiguracao(despacho.dados.configuracao);
    // Posições das saídas EM ANDAMENTO (reconexão: o estado atual vem da API, não do último evento).
    const posicoesAtuais = await listarPosicoesDaEmpresa(empresaId);
    if (posicoesAtuais.ok) setPosicoes(posicoesAtuais.dados.posicoes);
  }, [empresaId]);

  useEffect(() => {
    let ativo = true;
    void Promise.all([
      listarSaidasDaEmpresa(empresaId, false),
      listarPedidosDaEmpresa(empresaId, { filtro: "prontos" }),
      listarEntregadores(empresaId),
      obterPainelDespacho(empresaId),
      obterPainelOperacional(empresaId),
    ]).then(
      ([lista, pedidos, quadro, despacho, operacional]) => {
        if (!ativo) return;
        if (lista.ok) setSaidas(lista.dados.saidas);
        else setErro(lista.mensagem);
        if (pedidos.ok) setProntos(pedidos.dados.pedidos);
        if (quadro.ok) setEntregadores(quadro.dados.entregadores.filter(entregadorPodeReceberAtribuicao));
        if (operacional.ok) setOperacaoEntregadores(operacional.dados);
        if (despacho.ok) setConfiguracao(despacho.dados.configuracao);
      },
    );
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  // A saída mudou (o entregador reordenou, uma parada terminou): a empresa acompanha sem F5.
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoSaidaAtualizadaSchema.safeParse(evento);
      if (!resultado.success) return;
      const atualizada = resultado.data.saida;
      setSaidas((atuais) => (atuais.some((item) => item.id === atualizada.id) ? atuais.map((item) => (item.id === atualizada.id ? atualizada : item)) : [atualizada, ...atuais]));
    };
    // Posição do entregador em tempo real: atualiza o mapa sem recalcular rota (GPS ≠ roteamento).
    const aoPosicao = (evento: unknown) => {
      const resultado = eventoPosicaoEntregadorSchema.safeParse(evento);
      if (!resultado.success) return;
      const nova = resultado.data.posicao;
      setPosicoes((atuais) => [nova, ...atuais.filter((item) => item.saidaId !== nova.saidaId)]);
    };
    const aoOperacao = (evento: unknown) => {
      const resultado = eventoFilaAtualizadaSchema.safeParse(evento);
      if (resultado.success) setOperacaoEntregadores(resultado.data.painel);
    };
    socket.on(EVENTO_SAIDA_ATUALIZADA, aoAtualizar);
    socket.on(EVENTO_POSICAO_ENTREGADOR, aoPosicao);
    socket.on(EVENTO_FILA_ATUALIZADA, aoOperacao);
    return () => {
      socket.off(EVENTO_SAIDA_ATUALIZADA, aoAtualizar);
      socket.off(EVENTO_POSICAO_ENTREGADOR, aoPosicao);
      socket.off(EVENTO_FILA_ATUALIZADA, aoOperacao);
    };
  }, []);

  async function montar() {
    setOcupado(true);
    try {
      const resultado = await criarSaida(empresaId, entregadorId, selecionados);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        await carregar();
        return;
      }
      setErro(null);
      setSelecionados([]);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  // A liberação antecipada também fecha e planeja uma saída que ainda estava em formação.
  async function liberar(saida: SaidaEntrega) {
    setOcupado(true);
    try {
      const resultado = await liberarSaida(empresaId, saida.id);
      if (!resultado.ok) setErro(resultado.mensagem);
      else setErro(null);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  const alternar = (pedidoId: string) =>
    setSelecionados((atuais) => (atuais.includes(pedidoId) ? atuais.filter((item) => item !== pedidoId) : [...atuais, pedidoId]));

  const emEntrega = new Set(operacaoEntregadores?.indisponiveis.filter((item) => item.estado === "em_entrega").map((item) => item.id) ?? []);
  const entregadoresElegiveis = entregadores.filter((item) => !emEntrega.has(item.id));
  const entregadorSelecionadoElegivel = entregadoresElegiveis.some((item) => item.id === entregadorId);
  const saidasFiltradas = filtrarSaidasDaOperacao(saidas, filtro);

  return (
    <section aria-label="Saídas de entrega" className="flex flex-col gap-3 rounded-jaa border border-borda p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Saídas de entrega — {nomeEmpresa}</h3>
        <button type="button" onClick={() => void carregar()} className="rounded-jaa border px-2 py-1 text-xs">
          Atualizar
        </button>
      </div>

      {/* Montagem manual continua disponível, mas não disputa atenção com a operação diária. */}
      <details className="rounded-jaa border border-borda p-2 text-sm">
        <summary className="cursor-pointer text-xs font-semibold">Montar saída manual</summary>
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-conteudo-suave">Selecione os pedidos prontos que saem juntos e quem vai levar.</p>
        <ol aria-label="Pedidos prontos" className="flex flex-col gap-1">
          {prontos.length === 0 && <li className="text-xs text-conteudo-suave">Nenhum pedido pronto agora.</li>}
          {prontos.map((pedido) => (
            <li key={pedido.id}>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="pedidoDaSaida" value={pedido.id} checked={selecionados.includes(pedido.id)} onChange={() => alternar(pedido.id)} />
                Pedido #{pedido.numero} · {pedido.cliente.nomeExibicao} · {pedido.quantidadeItens} {pedido.quantidadeItens === 1 ? "item" : "itens"} · {formatarPrecoCentavos(pedido.totalCentavos)}
              </label>
            </li>
          ))}
        </ol>
        <label className="flex flex-col gap-1 text-xs">
          Entregador
          <select name="entregadorDaSaida" value={entregadorSelecionadoElegivel ? entregadorId : ""} onChange={(evento) => setEntregadorId(evento.target.value)} className="rounded-jaa border border-borda px-2 py-1 text-sm">
            <option value="">Escolha…</option>
            {entregadoresElegiveis.map((entregador) => (
              <option key={entregador.id} value={entregador.id}>
                {entregador.pessoa.nomeExibicao}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-criar-saida
          disabled={ocupado || selecionados.length === 0 || !entregadorSelecionadoElegivel}
          onClick={() => void montar()}
          className="self-start rounded bg-marca px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          Criar saída com {selecionados.length} {selecionados.length === 1 ? "entrega" : "entregas"}
        </button>
        </div>
      </details>

      <div role="group" aria-label="Filtrar rotas" className="flex gap-2 overflow-x-auto pb-1">
        {FILTROS.map((item) => {
          const quantidade = filtrarSaidasDaOperacao(saidas, item.id).length;
          const ativo = filtro === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-filtro-rotas={item.id}
              aria-pressed={ativo}
              onClick={() => setFiltro(item.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${ativo ? "border-marca bg-marca text-marca-conteudo" : "border-borda bg-superficie text-conteudo-suave"}`}
            >
              {item.rotulo} ({quantidade})
            </button>
          );
        })}
      </div>

      {saidasFiltradas.length === 0 ? (
        <p data-estado-vazio-rotas className="py-2 text-xs text-conteudo-suave">
          {FILTROS.find((item) => item.id === filtro)?.vazio}
        </p>
      ) : (
        <ol aria-label="Rotas da operação" className="flex flex-col gap-2">
          {saidasFiltradas.map((saida) => {
            const aberta = rotasAbertas.includes(saida.id);
            const mapaAberto = mapasAbertos.includes(saida.id);
            const paradasAtivas = saida.paradas.filter((parada) => parada.encerradaEm === null);
            const totalPedidos = saida.status === "concluida" ? saida.paradas.length : paradasAtivas.length;
            const numerosPedidos = resumoDosPedidos((saida.status === "concluida" ? saida.paradas : paradasAtivas).map((parada) => parada.numeroPedido));
            const proxima = paradasAtivas[0] ?? null;
            return (
              <li key={saida.id} data-saida={saida.id}>
                <details
                  open={aberta}
                  onToggle={(evento) => {
                    const estaAberta = evento.currentTarget.open;
                    setRotasAbertas((atuais) => (estaAberta ? (atuais.includes(saida.id) ? atuais : [...atuais, saida.id]) : atuais.filter((id) => id !== saida.id)));
                    if (!estaAberta) setMapasAbertos((atuais) => atuais.filter((id) => id !== saida.id));
                  }}
                  className="rounded-jaa border border-borda bg-superficie"
                >
                  <summary className="cursor-pointer list-none p-3 marker:hidden">
                    <span className="flex min-w-0 items-start justify-between gap-3">
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span data-status-saida={saida.status} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${classeStatusSaida(saida.status)}`}>
                            {rotuloStatusSaida(saida)}
                          </span>
                          <span className="truncate text-sm font-semibold">{nomeDaRota(saida)}</span>
                        </span>
                        <span className="text-xs text-conteudo-suave">
                          {totalPedidos} {totalPedidos === 1 ? "pedido" : "pedidos"}
                          {numerosPedidos ? ` · Pedido${totalPedidos === 1 ? "" : "s"} ${numerosPedidos}` : ""}
                          {saida.status === "em_formacao" && configuracao ? ` de ${configuracao.maxPedidosPorSaida} · ${formatarEspera(saida)}` : ""}
                        </span>
                        <span className="text-xs">{saida.entregador ? `Entregador: ${saida.entregador.nomeExibicao}` : "Entregador: aguardando"}</span>
                      </span>
                      <span aria-hidden className="shrink-0 text-conteudo-suave">{aberta ? "▴" : "▾"}</span>
                    </span>
                  </summary>

                  {aberta && (
                    <div data-conteudo-rota={saida.id} className="flex flex-col gap-3 border-t border-borda p-3">
                      {saida.zonaPrincipal && (
                        <p data-zona-saida={saida.zonaPrincipal.id} className="text-xs text-conteudo-suave">
                          {[saida.zonaPrincipal.nome, ...saida.zonasCombinadas.map((zona) => zona.nome)].join(" + ")}
                          {saida.automatica ? " · montada automaticamente" : ""}
                        </p>
                      )}
                      {saida.liberadaEm === null && (saida.status === "em_formacao" || saida.status === "aguardando_entregador" || saida.status === "preparada") && (
                        <button type="button" data-liberar-saida disabled={ocupado} onClick={() => void liberar(saida)} className="self-start rounded bg-marca px-2 py-1 text-xs text-white disabled:opacity-50">
                          LIBERAR P/ RETIRADA
                        </button>
                      )}
                      <SequenciaDaSaida saida={saida} />
                      {saida.status === "em_andamento" && (
                        <p data-posicao-saida={saida.id} className="text-xs text-conteudo-suave">
                          {rotuloUltimaPosicao(posicoes.find((posicao) => posicao.saidaId === saida.id) ?? null)}
                        </p>
                      )}
                      <button
                        type="button"
                        aria-expanded={mapaAberto}
                        onClick={() => setMapasAbertos((atuais) => (mapaAberto ? atuais.filter((id) => id !== saida.id) : [...atuais, saida.id]))}
                        className="self-start rounded-jaa border px-2 py-1 text-xs"
                      >
                        {mapaAberto ? "Ocultar mapa" : "Exibir mapa"}
                      </button>
                      {mapaAberto && <MapaPercurso saida={saida} posicao={posicoes.find((posicao) => posicao.saidaId === saida.id) ?? null} />}
                      <p className="text-xs text-conteudo-suave">
                        Próxima parada: {proxima?.cliente.nomeExibicao ?? "—"}
                        {proxima ? ` (${formatarEnderecoResumido(proxima.destino)})` : ""}
                      </p>
                    </div>
                  )}
                </details>
              </li>
            );
          })}
        </ol>
      )}

      {erro && (
        <p role="alert" className="text-sm text-perigo">
          {erro}
        </p>
      )}
    </section>
  );
}
