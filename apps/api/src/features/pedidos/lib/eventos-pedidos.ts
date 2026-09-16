import type { ResumoPedido } from "@jaa/contratos";

/**
 * Canal interno do domínio Pedido: publicado SOMENTE depois do commit da mudança de status.
 * O domínio não conhece Socket.IO; o realtime se inscreve para entregar.
 *
 * Mudança de status NÃO é mensagem: não cria mensagem, não reordena a conversa e não altera não
 * lidas. Os destinatários são só quem tem relação real com o pedido (cliente dono e identidade da
 * empresa); nunca há broadcast.
 */
export interface PedidoStatusAtualizado {
  tipo: "pedido-status-atualizado";
  destinatariosIdentidadeIds: string[];
  conversaId: string | null;
  pedido: ResumoPedido;
  motivoCancelamento: string | null;
  ocorridoEm: Date;
}

export type EventoDominioPedidos = PedidoStatusAtualizado;

type OuvinteEventosPedidos = (evento: EventoDominioPedidos) => void;

export interface CanalEventosPedidos {
  publicar(evento: EventoDominioPedidos): void;
  inscrever(ouvinte: OuvinteEventosPedidos): () => void;
}

export function criarCanalEventosPedidos(): CanalEventosPedidos {
  const ouvintes = new Set<OuvinteEventosPedidos>();

  return {
    publicar(evento) {
      for (const ouvinte of ouvintes) {
        try {
          ouvinte(evento);
        } catch {
          // O fato já está persistido: falha na entrega realtime não o desfaz.
          // Quem ficar sem o evento recupera o estado consultando o pedido.
        }
      }
    },
    inscrever(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
  };
}
