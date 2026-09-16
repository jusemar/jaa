"use client";

import {
  EVENTO_ENTREGA_ATUALIZADA,
  EVENTO_SAIDA_ATUALIZADA,
  EVENTO_SITUACAO_OPERACIONAL,
  eventoSaidaAtualizadaSchema,
  eventoSituacaoOperacionalSchema,
  paradasAtivas,
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_STATUS_PEDIDO,
  entregaEstaAtiva,
  eventoEntregaAtualizadaSchema,
  formatarCep,
  formatarEnderecoResumido,
  entregadorPodeEscolherDisponibilidade,
  rotuloDisponibilidade,
  ROTULO_STATUS_ENTREGADOR,
  type ConviteEntregador,
  type EntregaAtribuida,
  type SaidaEntrega,
  type SituacaoOperacional,
  type VinculoEntregador,
} from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import {
  alterarMinhaDisponibilidade,
  listarMeusConvites,
  listarMeusVinculos,
  listarMinhasEntregas,
  listarMinhasSaidas,
  listarMinhasSituacoes,
  reordenarSequencia,
  responderConvite,
} from "../lib/api-entregas";
import { MapaPercurso } from "./mapa-percurso";
import { MinhaSituacaoNaBase, usePresencaNaBase } from "./presenca-na-base";
import { SequenciaDaSaida } from "./saida-apresentacao";

/**
 * "MINHAS ENTREGAS": área do ENTREGADOR, separada da administração da empresa.
 * Mostra só o que está atribuído a ele AGORA e só o necessário para entregar — sem telefone do
 * cliente, sem outros pedidos e sem nada do painel da empresa.
 */
export function AreaMinhasEntregas() {
  const [entregas, setEntregas] = useState<EntregaAtribuida[]>([]);
  const [convites, setConvites] = useState<ConviteEntregador[]>([]);
  const [vinculos, setVinculos] = useState<VinculoEntregador[]>([]);
  const [saidas, setSaidas] = useState<SaidaEntrega[]>([]);
  const [situacoes, setSituacoes] = useState<SituacaoOperacional[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const aplicarSituacao = useCallback((situacao: SituacaoOperacional) => {
    setSituacoes((atuais) => atuais.map((item) => (item.entregadorId === situacao.entregadorId ? situacao : item)));
  }, []);

  // Enquanto ele estiver aceitando entregas de alguma empresa, o aparelho informa o que mediu.
  const { permissao, permitir } = usePresencaNaBase(situacoes, aplicarSituacao);

  useEffect(() => {
    let ativo = true;
    void Promise.all([listarMinhasEntregas(), listarMeusConvites(), listarMeusVinculos(), listarMinhasSaidas(), listarMinhasSituacoes()]).then(
      ([lista, pendentes, meusVinculos, minhasSaidas, minhasSituacoes]) => {
        if (!ativo) return;
        if (lista.ok) setEntregas(lista.dados.entregas);
        else setErro(lista.mensagem);
        if (pendentes.ok) setConvites(pendentes.dados.convites);
        if (meusVinculos.ok) setVinculos(meusVinculos.dados.vinculos);
        if (minhasSaidas.ok) setSaidas(minhasSaidas.dados.saidas);
        if (minhasSituacoes.ok) setSituacoes(minhasSituacoes.dados.situacoes);
      },
    );
    return () => {
      ativo = false;
    };
  }, []);

  const recarregar = useCallback(async () => {
    const [lista, pendentes, meusVinculos, minhasSaidas, minhasSituacoes] = await Promise.all([
      listarMinhasEntregas(),
      listarMeusConvites(),
      listarMeusVinculos(),
      listarMinhasSaidas(),
      listarMinhasSituacoes(),
    ]);
    if (lista.ok) setEntregas(lista.dados.entregas);
    if (pendentes.ok) setConvites(pendentes.dados.convites);
    if (meusVinculos.ok) setVinculos(meusVinculos.dados.vinculos);
    if (minhasSaidas.ok) setSaidas(minhasSaidas.dados.saidas);
    if (minhasSituacoes.ok) setSituacoes(minhasSituacoes.dados.situacoes);
  }, []);

  /*
   * A sequência do Jaa é sugestão: quem conhece a região é quem está na rua. Mover uma parada envia a
   * nova ordem inteira com a versão que a tela viu — se alguém mudou antes, a API recusa e recarregamos.
   */
  async function mover(saida: SaidaEntrega, pedidoId: string, direcao: -1 | 1) {
    const ordem = paradasAtivas(saida).map((parada) => parada.pedidoId);
    const de = ordem.indexOf(pedidoId);
    const para = de + direcao;
    if (de < 0 || para < 0 || para >= ordem.length) return;
    [ordem[de], ordem[para]] = [ordem[para] as string, ordem[de] as string];

    setOcupado(true);
    try {
      const resultado = await reordenarSequencia(saida.id, saida.versaoSequencia, ordem);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        await recarregar();
        return;
      }
      setErro(null);
      setSaidas((atuais) => atuais.map((item) => (item.id === resultado.dados.id ? resultado.dados : item)));
    } finally {
      setOcupado(false);
    }
  }

  // Ficar disponível/indisponível é decisão dele, por empresa — e não mexe nas entregas já atribuídas.
  async function alterarDisponibilidade(vinculo: VinculoEntregador, disponivel: boolean) {
    setOcupado(true);
    try {
      const resultado = await alterarMinhaDisponibilidade(vinculo.id, disponivel);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setErro(null);
      setVinculos((atuais) => atuais.map((item) => (item.id === vinculo.id ? { ...item, disponivel: resultado.dados.disponivel } : item)));
    } finally {
      setOcupado(false);
    }
  }

  /*
   * Realtime: a empresa atribuiu, trocou, mudou o status ou revogou o acesso. `entrega: null` significa
   * que ela saiu da minha lista — a tela remove na hora o que eu não posso mais ver.
   */
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoEntregaAtualizadaSchema.safeParse(evento);
      if (!resultado.success) return;
      const { pedidoId, entrega } = resultado.data;
      setEntregas((atuais) => {
        const semEla = atuais.filter((item) => item.pedidoId !== pedidoId);
        return entrega && entregaEstaAtiva(entrega.status) ? [entrega, ...semEla] : semEla;
      });
    };
    // A saída mudou (empresa iniciou, parada concluída, reordenação em outra aba).
    const aoAtualizarSaida = (evento: unknown) => {
      const resultado = eventoSaidaAtualizadaSchema.safeParse(evento);
      if (!resultado.success) return;
      const atualizada = resultado.data.saida;
      setSaidas((atuais) => (atuais.some((item) => item.id === atualizada.id) ? atuais.map((item) => (item.id === atualizada.id ? atualizada : item)) : [atualizada, ...atuais]));
    };
    // Minha própria situação mudou (entrei/saí da base, a fila andou, peguei uma saída).
    const aoAtualizarSituacao = (evento: unknown) => {
      const resultado = eventoSituacaoOperacionalSchema.safeParse(evento);
      if (resultado.success) aplicarSituacao(resultado.data.situacao);
    };
    socket.on(EVENTO_ENTREGA_ATUALIZADA, aoAtualizar);
    socket.on(EVENTO_SAIDA_ATUALIZADA, aoAtualizarSaida);
    socket.on(EVENTO_SITUACAO_OPERACIONAL, aoAtualizarSituacao);
    return () => {
      socket.off(EVENTO_ENTREGA_ATUALIZADA, aoAtualizar);
      socket.off(EVENTO_SAIDA_ATUALIZADA, aoAtualizarSaida);
      socket.off(EVENTO_SITUACAO_OPERACIONAL, aoAtualizarSituacao);
    };
  }, [aplicarSituacao]);

  async function responder(convite: ConviteEntregador, resposta: "aceitar" | "recusar") {
    const resultado = await responderConvite(convite.id, resposta);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    await recarregar();
  }

  // Sem vínculo, convite nem entrega, a pessoa não é entregadora: a área nem aparece.
  if (entregas.length === 0 && convites.length === 0 && vinculos.length === 0 && saidas.length === 0) return null;

  return (
    <section aria-label="Minhas entregas" className="flex flex-col gap-3 rounded border border-zinc-200 p-3">
      <h2 className="text-base font-semibold">Minhas entregas</h2>

      {convites.length > 0 && (
        <ol aria-label="Convites de entrega" className="flex flex-col gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
          {convites.map((convite) => (
            <li key={convite.id} data-convite={convite.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{convite.empresa.nome} convidou você para ser entregador.</span>
              <span className="flex gap-2">
                <button type="button" data-aceitar-convite onClick={() => void responder(convite, "aceitar")} className="rounded bg-black px-2 py-1 text-xs text-white">
                  Aceitar
                </button>
                <button type="button" onClick={() => void responder(convite, "recusar")} className="rounded border px-2 py-1 text-xs">
                  Recusar
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <EmpresasEmQueTrabalho vinculos={vinculos} ocupado={ocupado} aoAlterarDisponibilidade={(vinculo, disponivel) => void alterarDisponibilidade(vinculo, disponivel)} />

      <MinhaSituacaoNaBase situacoes={situacoes} permissao={permissao} aoPermitir={permitir} />

      {/* Saídas: os pedidos que ele leva juntos, na sequência que pode reordenar. */}
      {saidas.map((saida) => (
        <div key={saida.id} data-saida={saida.id} className="flex flex-col gap-2 rounded border border-zinc-200 p-2">
          <p className="text-sm font-medium">
            Saída — {saida.empresa.nome} · {paradasAtivas(saida).length} {paradasAtivas(saida).length === 1 ? "entrega" : "entregas"}
          </p>
          <SequenciaDaSaida saida={saida} ocupado={ocupado} aoMover={(pedidoId, direcao) => void mover(saida, pedidoId, direcao)} />
          <MapaPercurso saida={saida} />
        </div>
      ))}

      <ListaMinhasEntregas entregas={entregas} />

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          {erro}
        </p>
      )}
    </section>
  );
}

/**
 * "Empresas em que trabalho": o entregador escolhe, POR EMPRESA, se está aceitando novas entregas.
 * Ficar indisponível não devolve nem cancela o que já é dele — só interrompe NOVAS atribuições.
 * Vínculo inativo aparece como tal, sem opção de disponibilidade (isso é decisão da empresa).
 */
export function EmpresasEmQueTrabalho({
  vinculos,
  ocupado,
  aoAlterarDisponibilidade,
}: {
  vinculos: VinculoEntregador[];
  ocupado: boolean;
  aoAlterarDisponibilidade: (vinculo: VinculoEntregador, disponivel: boolean) => void;
}) {
  if (vinculos.length === 0) return null;

  return (
    <ol aria-label="Empresas em que trabalho" className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 text-sm">
      {vinculos.map((vinculo) => (
        <li key={vinculo.id} data-vinculo={vinculo.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{vinculo.empresa.nome}</span>
            {entregadorPodeEscolherDisponibilidade(vinculo.status) ? (
              <span data-disponibilidade={vinculo.disponivel ? "disponivel" : "indisponivel"} className={`text-xs ${vinculo.disponivel ? "text-emerald-700" : "text-zinc-600"}`}>
                {rotuloDisponibilidade(vinculo.disponivel)}
              </span>
            ) : (
              <span data-vinculo-status={vinculo.status} className="text-xs text-zinc-600">
                {ROTULO_STATUS_ENTREGADOR[vinculo.status]}
              </span>
            )}
          </span>
          {entregadorPodeEscolherDisponibilidade(vinculo.status) && (
            <button
              type="button"
              data-alternar-disponibilidade
              disabled={ocupado}
              onClick={() => aoAlterarDisponibilidade(vinculo, !vinculo.disponivel)}
              className="shrink-0 rounded border px-2 py-1 text-xs disabled:opacity-50"
            >
              {vinculo.disponivel ? "Ficar indisponível" : "Ficar disponível"}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ListaMinhasEntregas({ entregas }: { entregas: EntregaAtribuida[] }) {
  if (entregas.length === 0) return <p className="text-sm text-zinc-500">Nenhuma entrega atribuída a você agora.</p>;

  return (
    <ol aria-label="Entregas atribuídas" className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 text-sm">
      {entregas.map((entrega) => (
        <li key={entrega.pedidoId} data-entrega={entrega.pedidoId} className="flex flex-col gap-0.5 px-3 py-2">
          <span className="font-medium">{entrega.empresa.nome}</span>
          <span className="text-xs">{formatarEnderecoResumido(entrega.destino)}</span>
          <span className="text-xs text-zinc-600">
            {entrega.destino.bairro}, {entrega.destino.cidade}/{entrega.destino.uf} · CEP {formatarCep(entrega.destino.cep)}
          </span>
          {entrega.destino.pontoReferencia && <span className="text-xs text-zinc-600">Referência: {entrega.destino.pontoReferencia}</span>}
          <span className="text-xs text-zinc-600">Cliente: {entrega.cliente.nomeExibicao}</span>
          <span className="text-xs">
            {entrega.itens.map((item) => `${item.quantidade}× ${item.nomeProduto}`).join(", ")} · {formatarPrecoCentavos(entrega.totalCentavos)}
          </span>
          {/* Como receber é informação operacional essencial para quem entrega. */}
          <span data-pagamento-entrega={entrega.formaPagamentoNaEntrega} className="text-xs">
            {ROTULO_PAGAMENTO_ENTREGA[entrega.formaPagamentoNaEntrega]}
            {entrega.trocoParaCentavos !== null && ` · Troco para ${formatarPrecoCentavos(entrega.trocoParaCentavos)}`}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <span data-status-entrega={entrega.status} className="text-xs text-zinc-600">
              {ROTULO_STATUS_PEDIDO[entrega.status]}
            </span>
            <span data-ponto-entrega className="text-xs text-emerald-700">
              📍 Ponto de entrega confirmado
            </span>
            {/* Usa o ponto SNAPSHOT do pedido; navegação por rota é etapa futura. */}
            <a
              data-abrir-no-mapa
              href={`https://www.openstreetmap.org/?mlat=${entrega.destino.latitude}&mlon=${entrega.destino.longitude}#map=18/${entrega.destino.latitude}/${entrega.destino.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="rounded border px-2 py-0.5 text-xs"
            >
              Abrir no mapa
            </a>
          </span>
        </li>
      ))}
    </ol>
  );
}
