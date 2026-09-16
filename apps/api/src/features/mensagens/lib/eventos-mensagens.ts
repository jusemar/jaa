import type { MensagemRegistro } from "../repositorios/repositorio-mensagens.js";

// Todas as identidades participantes da conversa, inclusive quem originou o fato
// (para suas outras abas/dispositivos). O realtime entrega a todas as conexões delas.
interface Destinatarios {
  destinatariosIdentidadeIds: string[];
}

export interface MensagemCriada extends Destinatarios {
  tipo: "mensagem-criada";
  mensagem: MensagemRegistro;
}

// Mensagem existente alterada (edição ou exclusão para todos). Não é mensagem nova: não reordena nem
// gera não lida. Destinatários = participantes que ainda veem a mensagem (sem quem a excluiu para si).
export interface MensagemAtualizada extends Destinatarios {
  tipo: "mensagem-atualizada";
  mensagem: MensagemRegistro;
}

// "Excluir para mim": só a própria identidade é avisada (outras abas/dispositivos dela).
export interface MensagemExcluidaParaMim extends Destinatarios {
  tipo: "mensagem-excluida-para-mim";
  conversaId: string;
  mensagemId: string;
  // Nova última mensagem visível para a identidade na conversa (null = nenhuma).
  ultimaMensagem: MensagemRegistro | null;
}

// Aviso de NOVA mensagem para os destinatários (nunca o remetente). Só dados públicos do autor.
export interface NotificacaoNovaMensagem extends Destinatarios {
  tipo: "notificacao-nova-mensagem";
  conversaId: string;
  mensagemId: string;
  remetente: { identidadeId: string; tipo: "pessoal" | "empresarial"; nomeExibicao: string; nomeUsuario: string };
  previaConteudo: string;
  conteudoTruncado: boolean;
  criadoEm: Date;
}

// Contagem atual de não lidas de uma conversa para UMA identidade (recalculada após o commit).
export interface NaoLidasAtualizadas extends Destinatarios {
  tipo: "nao-lidas-atualizadas";
  conversaId: string;
  naoLidas: number;
}

// Somente confirmações de recebimento NOVAS (repetidas não geram evento).
export interface MensagensEntregues extends Destinatarios {
  tipo: "mensagens-entregues";
  conversaId: string;
  destinatarioIdentidadeId: string;
  mensagemIds: string[];
}

// Somente quando o marcador de leitura avançou.
export interface MensagensLidas extends Destinatarios {
  tipo: "mensagens-lidas";
  conversaId: string;
  leitorIdentidadeId: string;
  ateMensagemId: string;
}

export type EventoDominioMensagens =
  | MensagemCriada
  | MensagemAtualizada
  | MensagemExcluidaParaMim
  | MensagensEntregues
  | MensagensLidas
  | NaoLidasAtualizadas
  | NotificacaoNovaMensagem;

type OuvinteEventosMensagens = (evento: EventoDominioMensagens) => void;

/**
 * Canal interno de domínio: publicado SOMENTE depois que o fato foi persistido (commit).
 * O realtime se inscreve para entregar; o domínio não conhece o Socket.IO.
 */
export interface CanalEventosMensagens {
  publicar(evento: EventoDominioMensagens): void;
  inscrever(ouvinte: OuvinteEventosMensagens): () => void;
}

export function criarCanalEventosMensagens(): CanalEventosMensagens {
  const ouvintes = new Set<OuvinteEventosMensagens>();

  return {
    publicar(evento) {
      for (const ouvinte of ouvintes) {
        try {
          ouvinte(evento);
        } catch {
          // O fato já está persistido: falha na entrega realtime não o desfaz.
          // Quem estiver sem o evento recupera o estado pelo histórico.
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
