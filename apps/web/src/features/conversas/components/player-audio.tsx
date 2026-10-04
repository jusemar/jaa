"use client";

import { formatarDuracaoAudio } from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { IconeMicrofone, IconePausar, IconeTocar } from "@/components/ui/icones";
import { fracaoTocada, proximaVelocidade, rotuloVelocidade } from "../lib/audio-conversa";
import { reprodutorUnico } from "../lib/reprodutor-unico";
import type { EstadoImagem } from "../lib/urls-imagens";

/*
 * PLAYER DE ÁUDIO do Jaa (mensagem de voz): tocar/pausar, barra de progresso com busca, tempo e
 * velocidade (1x → 1,5x → 2x). Controles próprios sobre um <audio> sem `controls`: o player padrão
 * muda de cara a cada navegador.
 *
 * - A DURAÇÃO exibida vem do anexo (o WebM gravado pelo navegador não informa a sua), então o tempo
 *   aparece antes de baixar qualquer byte.
 * - Sem forma de onda: não há dado real para desenhá-la, e barras inventadas seriam enfeite falso.
 * - A URL é privada e temporária (ou local, na prévia): vem pronta por `estado`; falha de carregamento
 *   avisa quem cuida do cache (`aoFalhar`), que renova UMA vez.
 * - Um áudio por vez: começar a tocar pausa o que estava tocando (`reprodutorUnico`).
 */
export function PlayerAudio({
  estado,
  duracaoMs,
  emBalaoProprio = false,
  aoFalhar,
  aoCarregar,
}: {
  // "pronta" traz a URL; "carregando" e "indisponivel" desenham o player sem controles ativos.
  estado: EstadoImagem;
  duracaoMs: number;
  emBalaoProprio?: boolean;
  aoFalhar?: (() => void) | undefined;
  aoCarregar?: (() => void) | undefined;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [tempoAtual, setTempoAtual] = useState(0);
  const [velocidade, setVelocidade] = useState(1);
  const url = estado.situacao === "pronta" ? estado.url : null;

  // Sai da tela (ou troca de URL) tocando: para e libera a vez.
  useEffect(() => {
    const elemento = audio.current;
    const pausar = () => elemento?.pause();
    return () => {
      pausar();
      reprodutorUnico.liberar(pausar);
    };
  }, [url]);

  const pausarEste = useRef(() => audio.current?.pause());

  function alternar() {
    const elemento = audio.current;
    if (!elemento) return;
    if (elemento.paused) {
      reprodutorUnico.assumir(pausarEste.current);
      elemento.playbackRate = velocidade;
      // Recusa do navegador (ex.: URL vencida) cai no `onError`, que renova a URL.
      void elemento.play().catch(() => undefined);
    } else {
      elemento.pause();
    }
  }

  function buscar(fracao: number) {
    const elemento = audio.current;
    if (!elemento) return;
    elemento.currentTime = (fracao * duracaoMs) / 1000;
    setTempoAtual(elemento.currentTime);
  }

  function trocarVelocidade() {
    const nova = proximaVelocidade(velocidade);
    setVelocidade(nova);
    if (audio.current) audio.current.playbackRate = nova;
  }

  const fracao = fracaoTocada(tempoAtual, duracaoMs);
  const indisponivel = estado.situacao === "indisponivel";
  const corControle = emBalaoProprio ? "bg-mensagem-enviada-conteudo/85 text-mensagem-enviada" : "bg-marca text-marca-conteudo";

  return (
    <div data-player-audio={estado.situacao} data-tocando={tocando} className="flex w-[min(17rem,100%)] min-w-[12rem] items-center gap-2.5">
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setTocando(true)}
          onPause={() => {
            setTocando(false);
            reprodutorUnico.liberar(pausarEste.current);
          }}
          onEnded={() => {
            // Terminou: volta ao começo, pronto para ouvir de novo.
            setTocando(false);
            setTempoAtual(0);
            if (audio.current) audio.current.currentTime = 0;
          }}
          onTimeUpdate={(evento) => setTempoAtual(evento.currentTarget.currentTime)}
          onLoadedMetadata={aoCarregar}
          onError={aoFalhar}
        />
      )}

      <button
        type="button"
        onClick={alternar}
        disabled={!url}
        aria-label={tocando ? "Pausar áudio" : "Ouvir áudio"}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-40 ${corControle}`}
      >
        {indisponivel ? <IconeMicrofone className="h-4 w-4" /> : tocando ? <IconePausar className="h-4 w-4" /> : <IconeTocar className="h-4 w-4" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {indisponivel ? (
          <span className="text-xs text-conteudo-suave">Áudio indisponível</span>
        ) : (
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(fracao * 1000)}
            disabled={!url}
            onChange={(evento) => buscar(Number(evento.target.value) / 1000)}
            aria-label="Posição do áudio"
            aria-valuetext={`${formatarDuracaoAudio(tempoAtual * 1000)} de ${formatarDuracaoAudio(duracaoMs)}`}
            className="h-1 w-full cursor-pointer accent-marca disabled:cursor-default"
          />
        )}
        <span className="flex items-center justify-between text-[10px] leading-none text-conteudo-suave">
          {/* Parado no início mostra a duração total; tocando (ou no meio), o tempo atual. */}
          <span data-tempo-audio>{tempoAtual > 0 || tocando ? formatarDuracaoAudio(tempoAtual * 1000) : formatarDuracaoAudio(duracaoMs)}</span>
          {estado.situacao === "carregando" && <span role="status">Carregando…</span>}
        </span>
      </div>

      <button
        type="button"
        onClick={trocarVelocidade}
        disabled={!url}
        aria-label={`Velocidade ${rotuloVelocidade(velocidade)}. Trocar velocidade`}
        data-velocidade-audio={velocidade}
        className="h-7 min-w-9 shrink-0 rounded-full bg-conteudo/10 px-1.5 text-[11px] font-semibold text-conteudo-suave hover:bg-conteudo/15 disabled:opacity-40"
      >
        {rotuloVelocidade(velocidade)}
      </button>
    </div>
  );
}
