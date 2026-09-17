import {
  MAXIMO_PEDIDOS_POR_SAIDA_MAXIMO,
  MAXIMO_PEDIDOS_POR_SAIDA_MINIMO,
  TEMPO_FORMACAO_MAXIMO_MINUTOS,
  TEMPO_FORMACAO_MINIMO_MINUTOS,
  restanteDaFormacaoMs,
  type ConfiguracaoDespacho,
  type PainelDespacho,
  type SaidaEntrega,
} from "@jaa/contratos";

/*
 * Apresentação do painel de LOGÍSTICA: configuração da automação, pendências e as saídas agrupadas
 * pelo estado operacional. Componentes puros — a regra (fechar, combinar, despachar) é do servidor.
 */

export function formatarEspera(saida: Pick<SaidaEntrega, "prazoFormacaoEm">, agora: Date = new Date()): string {
  const restante = restanteDaFormacaoMs(saida, agora);
  if (restante === null) return "";
  if (restante <= 0) return "fechando…";
  const minutos = Math.ceil(restante / 60_000);
  return minutos === 1 ? "fecha em 1 min" : `fecha em ${minutos} min`;
}

export function ConfiguracaoAutomacao({
  configuracao,
  ocupado,
  aoSalvar,
}: {
  configuracao: ConfiguracaoDespacho;
  ocupado: boolean;
  aoSalvar: (entrada: ConfiguracaoDespacho) => void;
}) {
  return (
    <form
      aria-label="Automação das entregas"
      onSubmit={(evento) => {
        evento.preventDefault();
        const dados = new FormData(evento.currentTarget);
        aoSalvar({
          maxPedidosPorSaida: Number(dados.get("maxPedidosPorSaida")),
          tempoFormacaoMinutos: Number(dados.get("tempoFormacaoMinutos")),
          combinarZonas: dados.get("combinarZonas") === "sim",
        });
      }}
      className="flex flex-col gap-2 rounded-jaa border border-borda p-2 text-sm"
    >
      <p className="text-xs font-semibold text-conteudo-suave">Automação das entregas</p>
      <label className="flex flex-col gap-1 text-xs">
        Máximo de pedidos por saída
        <input
          name="maxPedidosPorSaida"
          type="number"
          min={MAXIMO_PEDIDOS_POR_SAIDA_MINIMO}
          max={MAXIMO_PEDIDOS_POR_SAIDA_MAXIMO}
          defaultValue={configuracao.maxPedidosPorSaida}
          className="w-24 rounded-jaa border border-borda px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Tempo máximo de formação (minutos)
        <input
          name="tempoFormacaoMinutos"
          type="number"
          min={TEMPO_FORMACAO_MINIMO_MINUTOS}
          max={TEMPO_FORMACAO_MAXIMO_MINUTOS}
          defaultValue={configuracao.tempoFormacaoMinutos}
          className="w-24 rounded-jaa border border-borda px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" name="combinarZonas" value="sim" defaultChecked={configuracao.combinarZonas} />
        Combinar zonas compatíveis quando houver pouco volume
      </label>
      <p className="text-xs text-conteudo-suave">A saída fecha quando atingir a quantidade OU o tempo — o que vier primeiro.</p>
      <button type="submit" data-salvar-automacao disabled={ocupado} className="self-start rounded bg-marca px-3 py-1.5 text-xs text-white disabled:opacity-50">
        Salvar automação
      </button>
    </form>
  );
}

// Pedidos prontos cujo ponto não caiu em zona nenhuma: pendência explícita, nunca encaixe forçado.
export function PendenciasForaDeZona({ painel }: { painel: PainelDespacho }) {
  if (!painel.automacaoAtiva) {
    return <p className="text-xs text-aviso">Nenhuma zona ativa: as saídas continuam sendo montadas à mão.</p>;
  }
  if (painel.pedidosForaDeZona.length === 0) return <p className="text-xs text-conteudo-suave">Nenhum pedido fora das zonas configuradas.</p>;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-aviso">Pedidos fora das zonas configuradas</p>
      <ol aria-label="Pedidos fora das zonas" className="flex flex-col divide-y divide-borda rounded-jaa border border-ouro/60 bg-aviso/5">
        {painel.pedidosForaDeZona.map((pedido) => (
          <li key={pedido.id} data-pedido-fora-de-zona={pedido.id} className="px-3 py-1.5 text-xs">
            {pedido.cliente.nomeExibicao} · {pedido.quantidadeItens} {pedido.quantidadeItens === 1 ? "item" : "itens"} — trate manualmente (monte a saída ou ajuste as zonas).
          </li>
        ))}
      </ol>
    </div>
  );
}

const GRUPOS = [
  { status: "em_formacao" as const, titulo: "Em formação", vazio: "Nenhuma saída juntando pedidos." },
  { status: "aguardando_entregador" as const, titulo: "Aguardando entregador", vazio: "Nenhuma saída esperando entregador." },
  { status: "preparada" as const, titulo: "Atribuídas", vazio: "Nenhuma saída atribuída." },
  { status: "em_andamento" as const, titulo: "Em andamento", vazio: "Nenhuma saída na rua." },
];

// Quadro operacional: quantas entregas, a zona (com as combinadas) e quanto falta para fechar.
export function QuadroDeSaidas({ saidas, agora = new Date() }: { saidas: SaidaEntrega[]; agora?: Date }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      {GRUPOS.map((grupo) => {
        const doGrupo = saidas.filter((saida) => saida.status === grupo.status);
        return (
          <div key={grupo.status} className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-conteudo-suave">{grupo.titulo}</p>
            {doGrupo.length === 0 ? (
              <p className="text-xs text-conteudo-suave">{grupo.vazio}</p>
            ) : (
              <ol aria-label={grupo.titulo} className="flex flex-col divide-y divide-borda rounded-jaa border border-borda">
                {doGrupo.map((saida) => {
                  const ativas = saida.paradas.filter((parada) => parada.encerradaEm === null).length;
                  const zonas = saida.zonaPrincipal ? [saida.zonaPrincipal.nome, ...saida.zonasCombinadas.map((zona) => zona.nome)].join(" + ") : "Montada manualmente";
                  return (
                    <li key={saida.id} data-saida-grupo={saida.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs">
                      <span>
                        {zonas} · {ativas} {ativas === 1 ? "pedido" : "pedidos"}
                      </span>
                      <span className="text-conteudo-suave">
                        {saida.entregador?.nomeExibicao ?? (saida.status === "em_formacao" ? formatarEspera(saida, agora) : "sem entregador")}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}
