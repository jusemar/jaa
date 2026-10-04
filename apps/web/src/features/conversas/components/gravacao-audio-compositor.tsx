"use client";

import { DURACAO_MAXIMA_AUDIO_MS, formatarDuracaoAudio } from "@jaa/contratos";
import { IconeEnviar, IconeLixeira, IconeMicrofone, IconeParar } from "@/components/ui/icones";
import type { EstadoImagem } from "../lib/urls-imagens";
import { PlayerAudio } from "./player-audio";

/*
 * O COMPOSITOR durante a mensagem de voz. Ocupa o lugar da pílula de texto (nunca os dois juntos):
 *   GRAVANDO → ponto vermelho, cronômetro, Cancelar e Parar;
 *   PRONTO   → ouvir a prévia, Descartar e Enviar.
 * Parar NÃO envia: a pessoa ouve antes — é o que evita o áudio mandado sem querer.
 */

/** Botão do microfone, no lugar do "enviar" quando o campo está vazio. */
export function BotaoGravarAudio({ aoGravar, desabilitado = false }: { aoGravar: () => void; desabilitado?: boolean }) {
  return (
    <button
      type="button"
      onClick={aoGravar}
      disabled={desabilitado}
      aria-label="Gravar áudio"
      title="Gravar áudio"
      data-gravar-audio
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-marca text-marca-conteudo transition-colors hover:bg-marca/90 disabled:opacity-50"
    >
      <IconeMicrofone className="h-4 w-4" />
    </button>
  );
}

export function GravandoAudio({ decorridoMs, aoCancelar, aoParar }: { decorridoMs: number; aoCancelar: () => void; aoParar: () => void }) {
  return (
    <div data-compositor-audio="gravando" className="flex items-center gap-2 rounded-full border border-borda bg-superficie p-1 pl-3 shadow-suave">
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-perigo" />
      <span role="status" aria-live="off" className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">Gravando</span>{" "}
        <span data-tempo-gravacao className="tabular-nums text-conteudo-suave">
          {formatarDuracaoAudio(decorridoMs)}
        </span>
        <span className="sr-only"> de no máximo {formatarDuracaoAudio(DURACAO_MAXIMA_AUDIO_MS)}</span>
      </span>
      <button type="button" onClick={aoCancelar} className="h-9 shrink-0 rounded-full px-3 text-xs font-medium text-conteudo-suave hover:bg-realce hover:text-conteudo">
        Cancelar
      </button>
      <button
        type="button"
        onClick={aoParar}
        aria-label="Parar gravação"
        title="Parar gravação"
        data-parar-gravacao
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-perigo text-white hover:opacity-90"
      >
        <IconeParar className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AudioProntoParaEnviar({ previaUrl, duracaoMs, aoDescartar, aoEnviar, desabilitado = false }: { previaUrl: string; duracaoMs: number; aoDescartar: () => void; aoEnviar: () => void; desabilitado?: boolean }) {
  const estado: EstadoImagem = { situacao: "pronta", url: previaUrl };
  return (
    <div data-compositor-audio="pronto" className="flex items-center gap-2 rounded-full border border-borda bg-superficie p-1 shadow-suave">
      <button
        type="button"
        onClick={aoDescartar}
        aria-label="Descartar áudio"
        title="Descartar áudio"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-conteudo-suave hover:bg-realce hover:text-perigo"
      >
        <IconeLixeira className="h-4 w-4" />
      </button>
      <div className="flex min-w-0 flex-1 justify-center">
        <PlayerAudio estado={estado} duracaoMs={duracaoMs} />
      </div>
      <button
        type="button"
        onClick={aoEnviar}
        disabled={desabilitado}
        aria-label="Enviar áudio"
        title="Enviar áudio"
        data-enviar-audio
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-marca text-marca-conteudo hover:bg-marca/90 disabled:opacity-50"
      >
        <IconeEnviar className="h-4 w-4" />
      </button>
    </div>
  );
}
