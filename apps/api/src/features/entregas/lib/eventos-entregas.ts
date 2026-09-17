import type {
  AcompanhamentoPedido,
  ConviteEntregador,
  VinculoEntregador,
  EntregaAtribuida,
  EntregadorDaEmpresa,
  FilaDoPedido,
  PainelDespacho,
  PainelOperacional,
  PosicaoEntregador,
  SaidaEntrega,
  SituacaoOperacional,
} from "@jaa/contratos";

/**
 * Canal interno do domínio ENTREGA: publicado só depois do commit.
 *
 * Vai apenas para as conexões do entregador envolvido (nunca broadcast, nunca para a empresa inteira).
 * `entrega: null` significa "esta entrega saiu da sua lista" — foi reatribuída a outra pessoa, o pedido
 * terminou/foi cancelado ou o vínculo foi revogado; a interface deve remover o que não pode mais ver.
 */
export interface EntregaAtualizada {
  tipo: "entrega-atualizada";
  // Identidade pessoal do entregador (as salas do realtime são por identidade).
  destinatariosIdentidadeIds: string[];
  pedidoId: string;
  entrega: EntregaAtribuida | null;
}

/**
 * Disponibilidade de um entregador mudou para UMA empresa. Vai só para as identidades autorizadas
 * daquela empresa: a Pizzaria A nunca descobre por aqui a disponibilidade dele na Pizzaria B.
 */
export interface DisponibilidadeAtualizada {
  tipo: "disponibilidade-atualizada";
  // Identidade EMPRESARIAL da empresa do vínculo (as salas do realtime são por identidade).
  destinatariosIdentidadeIds: string[];
  entregador: EntregadorDaEmpresa;
}

/**
 * A SAÍDA mudou (criada, iniciada, reordenada, parada encerrada). Vai para a identidade da EMPRESA e
 * a do ENTREGADOR daquela saída — nunca para clientes, que veriam a rota inteira e pedidos de outros.
 */
export interface SaidaAtualizada {
  tipo: "saida-atualizada";
  destinatariosIdentidadeIds: string[];
  saida: SaidaEntrega;
}

/**
 * Posição do PRÓPRIO pedido na fila, para a identidade do cliente dono dele. Informação derivada:
 * situação + quantas entregas antes. Nunca a sequência, os endereços ou os pedidos dos outros.
 */
export interface FilaAtualizada {
  tipo: "fila-atualizada";
  destinatariosIdentidadeIds: string[];
  fila: FilaDoPedido;
}

/**
 * Quadro operacional da base (fila, fora da base, indisponíveis) para a identidade da EMPRESA.
 * Só estados derivados: a empresa nunca recebe posição, mapa ou trajeto de ninguém.
 */
export interface PainelOperacionalAtualizado {
  tipo: "painel-operacional-atualizado";
  destinatariosIdentidadeIds: string[];
  painel: PainelOperacional;
}

// Situação do PRÓPRIO entregador numa empresa (presença, estado, posição na fila).
export interface SituacaoOperacionalAtualizada {
  tipo: "situacao-operacional-atualizada";
  destinatariosIdentidadeIds: string[];
  situacao: SituacaoOperacional;
}

/**
 * Painel de LOGÍSTICA da empresa: zonas, configuração da automação e os pedidos que ficaram fora das
 * zonas. Vai só para a identidade da EMPRESA — cliente e entregador não têm nada a ver com isso.
 */
export interface DespachoAtualizado {
  tipo: "despacho-atualizado";
  destinatariosIdentidadeIds: string[];
  painel: PainelDespacho;
}

/**
 * POSIÇÃO do entregador numa saída em andamento: vai para a identidade da EMPRESA daquela saída e
 * para o próprio entregador. Cliente nunca recebe este evento (ele veria a operação inteira).
 */
export interface PosicaoAtualizada {
  tipo: "posicao-atualizada";
  destinatariosIdentidadeIds: string[];
  posicao: PosicaoEntregador;
}

/**
 * ACOMPANHAMENTO do PRÓPRIO pedido para a identidade do cliente: fila + posição só quando a entrega
 * dele é a parada atual. Nunca destinos, coordenadas ou ids das outras paradas.
 */
export interface AcompanhamentoAtualizado {
  tipo: "acompanhamento-atualizado";
  destinatariosIdentidadeIds: string[];
  pedidoId: string;
  acompanhamento: AcompanhamentoPedido;
}

/**
 * O VÍNCULO de entregador da pessoa mudou (convidada, respondeu, ativada/desativada). Vai só para a
 * identidade pessoal dela: é o que faz o convite aparecer na hora, sem recarregar a página.
 */
export interface VinculoEntregadorAtualizado {
  tipo: "vinculo-entregador-atualizado";
  destinatariosIdentidadeIds: string[];
  convite: ConviteEntregador | null;
  vinculo: VinculoEntregador | null;
}

export type EventoDominioEntregas =
  | EntregaAtualizada
  | DisponibilidadeAtualizada
  | SaidaAtualizada
  | FilaAtualizada
  | PainelOperacionalAtualizado
  | SituacaoOperacionalAtualizada
  | DespachoAtualizado
  | PosicaoAtualizada
  | AcompanhamentoAtualizado
  | VinculoEntregadorAtualizado;

type OuvinteEventosEntregas = (evento: EventoDominioEntregas) => void;

export interface CanalEventosEntregas {
  publicar(evento: EventoDominioEntregas): void;
  inscrever(ouvinte: OuvinteEventosEntregas): () => void;
}

export function criarCanalEventosEntregas(): CanalEventosEntregas {
  const ouvintes = new Set<OuvinteEventosEntregas>();

  return {
    publicar(evento) {
      for (const ouvinte of ouvintes) {
        try {
          ouvinte(evento);
        } catch {
          // O fato já está persistido: falha na entrega realtime não o desfaz.
          // Quem ficar sem o evento recupera o estado consultando "Minhas entregas".
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
