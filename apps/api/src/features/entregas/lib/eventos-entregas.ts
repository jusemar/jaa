import type { EntregaAtribuida, EntregadorDaEmpresa } from "@jaa/contratos";

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

export type EventoDominioEntregas = EntregaAtualizada | DisponibilidadeAtualizada;

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
