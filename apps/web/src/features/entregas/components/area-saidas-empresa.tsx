"use client";

import {
  EVENTO_POSICAO_ENTREGADOR,
  EVENTO_SAIDA_ATUALIZADA,
  eventoPosicaoEntregadorSchema,
  rotuloUltimaPosicao,
  ROTULO_STATUS_SAIDA,
  entregadorPodeReceberAtribuicao,
  eventoSaidaAtualizadaSchema,
  formatarEnderecoResumido,
  type EntregadorDaEmpresa,
  type PedidoDaEmpresa,
  type PosicaoEntregador,
  type SaidaEntrega,
} from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { listarPedidosDaEmpresa } from "@/features/pedidos/lib/api-pedidos";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { criarSaida, fecharSaida, iniciarSaida, listarEntregadores, listarPosicoesDaEmpresa, listarSaidasDaEmpresa } from "../lib/api-entregas";
import { MapaPercurso } from "./mapa-percurso";
import { SequenciaDaSaida } from "./saida-apresentacao";

// Saída sem entregador: dizer o motivo é mais útil para o gestor do que um espaço vazio.
function rotuloSemEntregador(saida: SaidaEntrega): string {
  return saida.status === "em_formacao" ? "Juntando pedidos" : "Aguardando entregador";
}

/**
 * SAÍDAS DE ENTREGA da empresa: montar à mão (vários pedidos prontos + um entregador), acompanhar as
 * que a automação montou, fechar antes da hora e iniciar. Acompanhar aqui é a SEQUÊNCIA OPERACIONAL —
 * não é localização em tempo real do entregador.
 */
export function AreaSaidasEmpresa({ empresaId, nomeEmpresa }: { empresaId: string; nomeEmpresa: string }) {
  const [saidas, setSaidas] = useState<SaidaEntrega[]>([]);
  const [prontos, setProntos] = useState<PedidoDaEmpresa[]>([]);
  const [entregadores, setEntregadores] = useState<EntregadorDaEmpresa[]>([]);
  const [posicoes, setPosicoes] = useState<PosicaoEntregador[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [entregadorId, setEntregadorId] = useState<string>("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const [lista, pedidos, quadro] = await Promise.all([
      listarSaidasDaEmpresa(empresaId),
      // Só pedidos PRONTOS entram numa saída nova.
      listarPedidosDaEmpresa(empresaId, { filtro: "prontos" }),
      listarEntregadores(empresaId),
    ]);
    if (lista.ok) setSaidas(lista.dados.saidas);
    else setErro(lista.mensagem);
    if (pedidos.ok) setProntos(pedidos.dados.pedidos);
    // Só entregador ativo E disponível recebe saída nova (o servidor confere de novo).
    if (quadro.ok) setEntregadores(quadro.dados.entregadores.filter(entregadorPodeReceberAtribuicao));
    // Posições das saídas EM ANDAMENTO (reconexão: o estado atual vem da API, não do último evento).
    const posicoesAtuais = await listarPosicoesDaEmpresa(empresaId);
    if (posicoesAtuais.ok) setPosicoes(posicoesAtuais.dados.posicoes);
  }, [empresaId]);

  useEffect(() => {
    let ativo = true;
    void Promise.all([listarSaidasDaEmpresa(empresaId), listarPedidosDaEmpresa(empresaId, { filtro: "prontos" }), listarEntregadores(empresaId)]).then(
      ([lista, pedidos, quadro]) => {
        if (!ativo) return;
        if (lista.ok) setSaidas(lista.dados.saidas);
        else setErro(lista.mensagem);
        if (pedidos.ok) setProntos(pedidos.dados.pedidos);
        if (quadro.ok) setEntregadores(quadro.dados.entregadores.filter(entregadorPodeReceberAtribuicao));
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
    socket.on(EVENTO_SAIDA_ATUALIZADA, aoAtualizar);
    socket.on(EVENTO_POSICAO_ENTREGADOR, aoPosicao);
    return () => {
      socket.off(EVENTO_SAIDA_ATUALIZADA, aoAtualizar);
      socket.off(EVENTO_POSICAO_ENTREGADOR, aoPosicao);
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

  // Fechar agora: intervenção do gestor numa saída ainda em formação.
  async function fechar(saida: SaidaEntrega) {
    setOcupado(true);
    try {
      const resultado = await fecharSaida(empresaId, saida.id);
      if (!resultado.ok) setErro(resultado.mensagem);
      else setErro(null);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function iniciar(saida: SaidaEntrega) {
    setOcupado(true);
    try {
      const resultado = await iniciarSaida(empresaId, saida.id);
      if (!resultado.ok) setErro(resultado.mensagem);
      else setErro(null);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  const alternar = (pedidoId: string) =>
    setSelecionados((atuais) => (atuais.includes(pedidoId) ? atuais.filter((item) => item !== pedidoId) : [...atuais, pedidoId]));

  return (
    <section aria-label="Saídas de entrega" className="flex flex-col gap-3 rounded-jaa border border-borda p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Saídas de entrega — {nomeEmpresa}</h3>
        <button type="button" onClick={() => void carregar()} className="rounded-jaa border px-2 py-1 text-xs">
          Atualizar
        </button>
      </div>

      {/* Montar: escolher vários pedidos prontos e quem vai levar. */}
      <div className="flex flex-col gap-2 rounded-jaa border border-borda p-2 text-sm">
        <p className="text-xs text-conteudo-suave">Selecione os pedidos prontos que saem juntos e quem vai levar.</p>
        <ol aria-label="Pedidos prontos" className="flex flex-col gap-1">
          {prontos.length === 0 && <li className="text-xs text-conteudo-suave">Nenhum pedido pronto agora.</li>}
          {prontos.map((pedido) => (
            <li key={pedido.id}>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="pedidoDaSaida" value={pedido.id} checked={selecionados.includes(pedido.id)} onChange={() => alternar(pedido.id)} />
                {pedido.cliente.nomeExibicao} · {pedido.quantidadeItens} {pedido.quantidadeItens === 1 ? "item" : "itens"} · {formatarPrecoCentavos(pedido.totalCentavos)}
              </label>
            </li>
          ))}
        </ol>
        <label className="flex flex-col gap-1 text-xs">
          Entregador
          <select name="entregadorDaSaida" value={entregadorId} onChange={(evento) => setEntregadorId(evento.target.value)} className="rounded-jaa border border-borda px-2 py-1 text-sm">
            <option value="">Escolha…</option>
            {entregadores.map((entregador) => (
              <option key={entregador.id} value={entregador.id}>
                {entregador.pessoa.nomeExibicao}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-criar-saida
          disabled={ocupado || selecionados.length === 0 || entregadorId === ""}
          onClick={() => void montar()}
          className="self-start rounded bg-marca px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          Criar saída com {selecionados.length} {selecionados.length === 1 ? "entrega" : "entregas"}
        </button>
      </div>

      <ol aria-label="Saídas" className="flex flex-col gap-3">
        {saidas.length === 0 && <li className="text-sm text-conteudo-suave">Nenhuma saída em aberto.</li>}
        {saidas.map((saida) => (
          <li key={saida.id} data-saida={saida.id} className="flex flex-col gap-2 rounded-jaa border border-borda p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-col text-sm font-medium">
                <span>
                  {/* Em formação ou aguardando alguém elegível, a saída ainda não tem entregador. */}
                  {saida.entregador?.nomeExibicao ?? rotuloSemEntregador(saida)} — <span data-status-saida={saida.status}>{ROTULO_STATUS_SAIDA[saida.status]}</span>
                </span>
                {saida.zonaPrincipal && (
                  <span data-zona-saida={saida.zonaPrincipal.id} className="text-xs font-normal text-conteudo-suave">
                    {[saida.zonaPrincipal.nome, ...saida.zonasCombinadas.map((zona) => zona.nome)].join(" + ")}
                    {saida.automatica ? " · montada automaticamente" : ""}
                  </span>
                )}
              </span>
              <span className="flex gap-2">
                {saida.status === "em_formacao" && (
                  <button type="button" data-fechar-saida disabled={ocupado} onClick={() => void fechar(saida)} className="rounded-jaa border px-2 py-1 text-xs disabled:opacity-50">
                    Fechar agora
                  </button>
                )}
                {saida.status === "preparada" && (
                  <button type="button" data-iniciar-saida disabled={ocupado} onClick={() => void iniciar(saida)} className="rounded bg-marca px-2 py-1 text-xs text-white disabled:opacity-50">
                    Iniciar saída
                  </button>
                )}
              </span>
            </div>
            {/* Acompanhamento da SEQUÊNCIA e do PERCURSO (não é localização em tempo real). */}
            <SequenciaDaSaida saida={saida} />
            {/* Acompanhamento operacional: só existe durante a saída em andamento. */}
            {saida.status === "em_andamento" && (
              <p data-posicao-saida={saida.id} className="text-xs text-conteudo-suave">
                {rotuloUltimaPosicao(posicoes.find((posicao) => posicao.saidaId === saida.id) ?? null)}
              </p>
            )}
            <MapaPercurso saida={saida} posicao={posicoes.find((posicao) => posicao.saidaId === saida.id) ?? null} />
            <p className="text-xs text-conteudo-suave">
              Próxima parada: {saida.paradas.filter((parada) => parada.encerradaEm === null)[0]?.cliente.nomeExibicao ?? "—"}
              {saida.paradas.filter((parada) => parada.encerradaEm === null)[0] &&
                ` (${formatarEnderecoResumido(saida.paradas.filter((parada) => parada.encerradaEm === null)[0]!.destino)})`}
            </p>
          </li>
        ))}
      </ol>

      {erro && (
        <p role="alert" className="text-sm text-perigo">
          {erro}
        </p>
      )}
    </section>
  );
}
