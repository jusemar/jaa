import type { MensagemRegistro } from "../repositorios/repositorio-mensagens.js";

export interface MensagemCriada {
  mensagem: MensagemRegistro;
  // Todas as identidades participantes, inclusive o remetente (para suas outras abas/dispositivos).
  destinatariosIdentidadeIds: string[];
}

type OuvinteMensagemCriada = (evento: MensagemCriada) => void;

/**
 * Canal interno de domínio: publicado SOMENTE depois que a mensagem foi persistida.
 * O realtime se inscreve para entregar; o domínio não conhece o Socket.IO.
 */
export interface CanalEventosMensagens {
  publicarMensagemCriada(evento: MensagemCriada): void;
  inscrever(ouvinte: OuvinteMensagemCriada): () => void;
}

export function criarCanalEventosMensagens(): CanalEventosMensagens {
  const ouvintes = new Set<OuvinteMensagemCriada>();

  return {
    publicarMensagemCriada(evento) {
      for (const ouvinte of ouvintes) {
        try {
          ouvinte(evento);
        } catch {
          // A mensagem já está persistida: falha na entrega realtime não desfaz o envio.
          // Quem estiver sem o evento recupera a mensagem pelo histórico.
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
