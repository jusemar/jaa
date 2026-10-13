import type { SaidaEntrega } from "@jaa/contratos";

/*
 * ENTREGA DO PEDIDO ABERTO em dia com o servidor. O bloco "Entregador" da tela do pedido vem de uma
 * consulta própria (quem está com o pedido + histórico de atribuições), feita ao abrir. Quando a rota
 * muda sem ação desta tela — o despacho automático escolhe o primeiro da fila, o entregador recusa,
 * outro operador troca — a empresa recebe `saida:atualizada`: o evento só AVISA, e a entrega é RELIDA
 * do servidor (nunca montada a partir do evento).
 *
 * Sem React e sem rede: testável sozinho. Cópia da Web: mudou lá, muda aqui.
 */

/** A saída tem (ou teve) este pedido entre as paradas? Só então a entrega dele pode ter mudado. */
export function saidaAfetaPedido(saida: Pick<SaidaEntrega, "paradas">, pedidoId: string | null): boolean {
  return pedidoId !== null && saida.paradas.some((parada) => parada.pedidoId === pedidoId);
}

type RespostaDaEntrega<Entrega> = { ok: true; dados: Entrega } | { ok: false };

export interface SincroniaDaEntrega {
  /** Qual pedido está aberto agora (null = nenhum). Respostas pedidas para o anterior são descartadas. */
  definirPedidoAberto(empresaId: string, pedidoId: string | null): void;
  /** A tela acabou de gravar a entrega por conta própria (abrir, atribuir): releituras pendentes ficaram velhas. */
  descartarPendentes(): void;
  /** Chegou `saida:atualizada`: relê só se a saída envolve o pedido aberto. */
  aoAtualizarSaida(saida: Pick<SaidaEntrega, "paradas">): Promise<void>;
  /** Relê a entrega do pedido aberto (também ao reconectar). Sem pedido aberto, não consulta nada. */
  reler(): Promise<void>;
}

export function criarSincroniaDaEntrega<Entrega>({
  obter,
  aplicar,
}: {
  obter: (empresaId: string, pedidoId: string) => Promise<RespostaDaEntrega<Entrega>>;
  aplicar: (entrega: Entrega) => void;
}): SincroniaDaEntrega {
  let aberto: { empresaId: string; pedidoId: string } | null = null;
  // Cada releitura ganha um número; só a mais recente pode gravar.
  let ultimaConsulta = 0;

  async function reler(): Promise<void> {
    if (!aberto) return;
    const alvo = aberto;
    const consulta = ++ultimaConsulta;
    const resposta = await obter(alvo.empresaId, alvo.pedidoId);
    // Falhou: fica o que estava na tela. Trocou de pedido, ou já há resposta mais nova: esta é velha.
    if (!resposta.ok || aberto !== alvo || consulta !== ultimaConsulta) return;
    aplicar(resposta.dados);
  }

  return {
    definirPedidoAberto(empresaId, pedidoId) {
      if (aberto?.empresaId === empresaId && aberto.pedidoId === pedidoId) return;
      aberto = pedidoId === null ? null : { empresaId, pedidoId };
      ultimaConsulta += 1;
    },
    descartarPendentes() {
      ultimaConsulta += 1;
    },
    async aoAtualizarSaida(saida) {
      if (saidaAfetaPedido(saida, aberto?.pedidoId ?? null)) await reler();
    },
    reler,
  };
}
