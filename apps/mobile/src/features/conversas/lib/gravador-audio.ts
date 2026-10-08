import { DURACAO_MAXIMA_AUDIO_MS } from "@jaa/contratos";
import type { AudioGravado } from "./audio-conversa.ts";

/*
 * GRAVAÇÃO DA MENSAGEM DE VOZ no app — a regra (pura, testável em Node). O que toca o aparelho chega
 * por `MicrofoneDoAparelho` (`audio-nativo.ts` faz a ligação real com o expo-audio).
 *
 * Garantias: permissão pedida SÓ ao tocar no microfone; uma gravação por vez; parada automática no
 * limite de duração (a pessoa ainda ouve e envia); cancelar descarta; e o microfone é SEMPRE solto —
 * nada continua gravando "por baixo".
 */

export type FalhaGravacao = "sem-modulo" | "permissao-negada" | "falha";

export const MENSAGEM_FALHA_GRAVACAO: Record<FalhaGravacao, string> = {
  "sem-modulo": "Esta versão do app ainda não grava áudio. Atualize o Jaaa para usar o microfone.",
  "permissao-negada": "Sem permissão para usar o microfone. Libere o microfone para o Jaaa nas configurações do aparelho.",
  falha: "Não foi possível iniciar a gravação. Tente de novo.",
};

/** Uma gravação em curso no aparelho. */
export interface GravacaoNativa {
  /** Para o gravador e devolve a URI do arquivo (null = nada gravado). */
  parar(): Promise<string | null>;
}

export interface MicrofoneDoAparelho {
  /** false quando o módulo nativo não existe neste build do app. */
  disponivel: boolean;
  pedirPermissao(): Promise<boolean>;
  iniciar(): Promise<GravacaoNativa>;
  agora(): number;
  agendar(executar: () => void, emMs: number): unknown;
  cancelarAgendamento(agendamento: unknown): void;
}

export interface Gravacao {
  iniciadaEm: number;
  /** Para e devolve o áudio (null = cancelada ou sem arquivo). Chamar de novo devolve o mesmo. */
  parar(): Promise<AudioGravado | null>;
  /** Descarta a gravação e solta o microfone. */
  cancelar(): Promise<void>;
}

/** `aoPararSozinha`: a gravação parou sem a pessoa pedir (limite de duração atingido). */
export async function iniciarGravacao(
  microfone: MicrofoneDoAparelho,
  aoPararSozinha: (resultado: Promise<AudioGravado | null>) => void,
): Promise<{ ok: true; gravacao: Gravacao } | { ok: false; falha: FalhaGravacao }> {
  if (!microfone.disponivel) return { ok: false, falha: "sem-modulo" };
  let permitido: boolean;
  try {
    permitido = await microfone.pedirPermissao();
  } catch {
    return { ok: false, falha: "falha" };
  }
  if (!permitido) return { ok: false, falha: "permissao-negada" };

  let nativa: GravacaoNativa;
  try {
    nativa = await microfone.iniciar();
  } catch {
    return { ok: false, falha: "falha" };
  }

  const iniciadaEm = microfone.agora();
  let cancelada = false;
  let encerramento: Promise<AudioGravado | null> | null = null;
  let limite: unknown = null;

  const parar = (): Promise<AudioGravado | null> => {
    encerramento ??= (async () => {
      const duracaoMs = Math.min(DURACAO_MAXIMA_AUDIO_MS, Math.max(0, microfone.agora() - iniciadaEm));
      microfone.cancelarAgendamento(limite);
      // Falha ao parar (interrupção do sistema, microfone tomado por uma chamada): não há áudio.
      const uri = await nativa.parar().catch(() => null);
      return cancelada || !uri ? null : { uri, duracaoMs };
    })();
    return encerramento;
  };

  limite = microfone.agendar(() => {
    if (!encerramento) aoPararSozinha(parar());
  }, DURACAO_MAXIMA_AUDIO_MS);

  return {
    ok: true,
    gravacao: {
      iniciadaEm,
      parar,
      async cancelar() {
        cancelada = true;
        await parar();
      },
    },
  };
}
