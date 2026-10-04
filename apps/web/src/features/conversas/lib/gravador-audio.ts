import { DURACAO_MAXIMA_AUDIO_MS, TAXA_BITS_AUDIO_WEB } from "@jaa/contratos";
import { escolherTipoDeGravacao } from "./audio-conversa";

/*
 * GRAVADOR DE VOZ do navegador (getUserMedia + MediaRecorder). O que é do navegador chega por
 * parâmetro, para a lógica ser testável em Node: iniciar, parar, cancelar, parada automática no
 * limite de duração e — sempre — soltar o microfone (o indicador de gravação do navegador apaga).
 */

export type AudioGravado = { arquivo: Blob; tipo: string; duracaoMs: number };

export type FalhaGravacao = "nao-suportado" | "permissao-negada" | "sem-microfone" | "falha";

export const MENSAGEM_FALHA_GRAVACAO: Record<FalhaGravacao, string> = {
  "nao-suportado": "Este navegador não grava áudio. Use uma versão recente do Chrome, Edge, Firefox ou Safari.",
  "permissao-negada": "Sem permissão para usar o microfone. Libere o microfone para o Jaa nas permissões do navegador e tente de novo.",
  "sem-microfone": "Nenhum microfone foi encontrado neste aparelho.",
  falha: "Não foi possível iniciar a gravação. Tente de novo.",
};

/** O mínimo do MediaRecorder e do MediaStream que o gravador usa. */
export interface GravadorNativo {
  state: string;
  mimeType: string;
  ondataavailable: ((evento: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(intervaloMs?: number): void;
  stop(): void;
}
export interface FluxoDeMidia {
  getTracks(): { stop(): void }[];
}

export interface AmbienteDeGravacao {
  obterMicrofone: (() => Promise<FluxoDeMidia>) | null;
  criarGravador: ((fluxo: FluxoDeMidia, opcoes: { mimeType: string; audioBitsPerSecond: number }) => GravadorNativo) | null;
  suportaTipo: (tipo: string) => boolean;
  agora: () => number;
  agendar: (executar: () => void, emMs: number) => unknown;
  cancelarAgendamento: (agendamento: unknown) => void;
  criarBlob: (partes: Blob[], tipo: string) => Blob;
}

export interface Gravacao {
  /** Para e devolve o áudio. Chamar de novo devolve o mesmo resultado. */
  parar(): Promise<AudioGravado>;
  /** Descarta tudo e solta o microfone. */
  cancelar(): void;
  iniciadaEm: number;
}

function classificarErro(erro: unknown): FalhaGravacao {
  const nome = typeof erro === "object" && erro !== null && "name" in erro ? String(erro.name) : "";
  if (nome === "NotAllowedError" || nome === "SecurityError") return "permissao-negada";
  if (nome === "NotFoundError" || nome === "OverconstrainedError") return "sem-microfone";
  return "falha";
}

/**
 * Pede o microfone (o navegador pergunta na primeira vez) e começa a gravar. `aoPararSozinha` é
 * chamado quando a gravação para SEM a pessoa pedir: limite de duração atingido ou erro do gravador.
 */
export async function iniciarGravacao(
  ambiente: AmbienteDeGravacao,
  aoPararSozinha: (resultado: Promise<AudioGravado>) => void,
): Promise<{ ok: true; gravacao: Gravacao } | { ok: false; falha: FalhaGravacao }> {
  if (!ambiente.obterMicrofone || !ambiente.criarGravador) return { ok: false, falha: "nao-suportado" };
  const tipo = escolherTipoDeGravacao(ambiente.suportaTipo);
  if (!tipo) return { ok: false, falha: "nao-suportado" };

  let fluxo: FluxoDeMidia;
  try {
    fluxo = await ambiente.obterMicrofone();
  } catch (erro) {
    return { ok: false, falha: classificarErro(erro) };
  }
  const soltarMicrofone = () => {
    for (const faixa of fluxo.getTracks()) faixa.stop();
  };

  let gravador: GravadorNativo;
  try {
    gravador = ambiente.criarGravador(fluxo, { mimeType: tipo, audioBitsPerSecond: TAXA_BITS_AUDIO_WEB });
  } catch {
    soltarMicrofone();
    return { ok: false, falha: "nao-suportado" };
  }

  const partes: Blob[] = [];
  const iniciadaEm = ambiente.agora();
  let cancelada = false;
  let encerramento: Promise<AudioGravado> | null = null;
  let limite: unknown = null;

  gravador.ondataavailable = (evento) => {
    if (evento.data.size > 0) partes.push(evento.data);
  };

  const parar = (): Promise<AudioGravado> => {
    encerramento ??= new Promise<AudioGravado>((resolver) => {
      const duracaoMs = Math.min(DURACAO_MAXIMA_AUDIO_MS, Math.max(0, ambiente.agora() - iniciadaEm));
      ambiente.cancelarAgendamento(limite);
      gravador.onstop = () => {
        soltarMicrofone();
        const tipoGravado = gravador.mimeType || tipo;
        resolver({ arquivo: ambiente.criarBlob(cancelada ? [] : partes, tipoGravado), tipo: tipoGravado, duracaoMs });
      };
      if (gravador.state === "inactive") gravador.onstop();
      else gravador.stop();
    });
    return encerramento;
  };

  // Erro do gravador no meio (microfone desconectado, permissão revogada): encerra com o que houver.
  gravador.onerror = () => {
    if (!encerramento) aoPararSozinha(parar());
  };
  // Limite de duração: para sozinha, e a pessoa ainda pode ouvir e enviar.
  limite = ambiente.agendar(() => {
    if (!encerramento) aoPararSozinha(parar());
  }, DURACAO_MAXIMA_AUDIO_MS);

  try {
    // Pedaços a cada segundo: se a aba travar, o que já foi gravado não se perde no fechamento.
    gravador.start(1000);
  } catch {
    ambiente.cancelarAgendamento(limite);
    soltarMicrofone();
    return { ok: false, falha: "falha" };
  }

  return {
    ok: true,
    gravacao: {
      iniciadaEm,
      parar,
      cancelar() {
        cancelada = true;
        partes.length = 0;
        void parar();
      },
    },
  };
}

/** Ambiente REAL do navegador. Só é chamado no cliente, no clique do microfone. */
export function ambienteDoNavegador(): AmbienteDeGravacao {
  const midia = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  const Gravador = typeof MediaRecorder !== "undefined" ? MediaRecorder : undefined;
  return {
    obterMicrofone: midia?.getUserMedia ? () => midia.getUserMedia({ audio: true }) : null,
    criarGravador: Gravador ? (fluxo, opcoes) => new Gravador(fluxo as MediaStream, opcoes) as unknown as GravadorNativo : null,
    suportaTipo: (tipo) => Gravador?.isTypeSupported(tipo) ?? false,
    agora: () => Date.now(),
    agendar: (executar, emMs) => setTimeout(executar, emMs),
    cancelarAgendamento: (agendamento) => clearTimeout(agendamento as ReturnType<typeof setTimeout>),
    criarBlob: (partes, tipo) => new Blob(partes, { type: tipo }),
  };
}
