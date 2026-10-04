"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { validarAudioGravado } from "../lib/audio-conversa";
import { MENSAGEM_FALHA_GRAVACAO, ambienteDoNavegador, iniciarGravacao, type AudioGravado, type Gravacao } from "../lib/gravador-audio";

export type AudioPronto = { arquivo: Blob; duracaoMs: number; previaUrl: string };

type Fase = { fase: "parado" } | { fase: "pedindo-microfone" } | { fase: "gravando"; decorridoMs: number } | { fase: "pronto"; audio: AudioPronto };

/**
 * GRAVAÇÃO da mensagem de voz na conversa aberta: parado → gravando → pronto (ouvir, enviar ou
 * descartar). Uma gravação por vez. Sair da conversa (trocar de conversa, de área ou fechar) CANCELA a
 * gravação e solta o microfone. Trocar de aba do navegador não cancela, como nos mensageiros de desktop:
 * o indicador de microfone do navegador continua visível enquanto grava.
 *
 * `criarUrl`/`revogarUrl` são o registro de object URLs da conversa (revogadas ao descartar, ao
 * substituir e ao sair).
 */
export function useGravacaoAudio({ criarUrl, revogarUrl, aoErro }: { criarUrl: (arquivo: Blob) => string; revogarUrl: (url: string | undefined) => void; aoErro: (mensagem: string | null) => void }) {
  const [estado, setEstado] = useState<Fase>({ fase: "parado" });
  const gravacao = useRef<Gravacao | null>(null);
  const ativo = useRef(true);

  const concluir = useCallback(
    async (resultado: Promise<AudioGravado>) => {
      gravacao.current = null;
      const audio = await resultado;
      if (!ativo.current) return;
      const problema = validarAudioGravado({ tipo: audio.tipo, tamanhoBytes: audio.arquivo.size, duracaoMs: audio.duracaoMs });
      if (problema) {
        aoErro(problema);
        setEstado({ fase: "parado" });
        return;
      }
      setEstado({ fase: "pronto", audio: { arquivo: audio.arquivo, duracaoMs: audio.duracaoMs, previaUrl: criarUrl(audio.arquivo) } });
    },
    [aoErro, criarUrl],
  );

  const iniciar = useCallback(async () => {
    if (gravacao.current || estado.fase !== "parado") return;
    aoErro(null);
    setEstado({ fase: "pedindo-microfone" });
    const inicio = await iniciarGravacao(ambienteDoNavegador(), (resultado) => void concluir(resultado));
    if (!inicio.ok) {
      if (ativo.current) {
        aoErro(MENSAGEM_FALHA_GRAVACAO[inicio.falha]);
        setEstado({ fase: "parado" });
      }
      return;
    }
    // A conversa fechou enquanto o navegador perguntava pela permissão: não grava.
    if (!ativo.current) {
      inicio.gravacao.cancelar();
      return;
    }
    gravacao.current = inicio.gravacao;
    setEstado({ fase: "gravando", decorridoMs: 0 });
  }, [aoErro, concluir, estado.fase]);

  const parar = useCallback(() => {
    const atual = gravacao.current;
    if (atual) void concluir(atual.parar());
  }, [concluir]);

  const cancelar = useCallback(() => {
    gravacao.current?.cancelar();
    gravacao.current = null;
    setEstado({ fase: "parado" });
  }, []);

  /** Descarta o áudio pronto (ou o entrega a quem vai enviar, que passa a ser o dono da URL). */
  const descartar = useCallback(
    (revogar = true) => {
      setEstado((atual) => {
        if (atual.fase === "pronto" && revogar) revogarUrl(atual.audio.previaUrl);
        return { fase: "parado" };
      });
    },
    [revogarUrl],
  );

  // Cronômetro da gravação (só para exibir; a duração enviada é medida pelo gravador).
  const gravando = estado.fase === "gravando";
  useEffect(() => {
    if (!gravando) return;
    const intervalo = setInterval(() => {
      const atual = gravacao.current;
      if (atual) setEstado({ fase: "gravando", decorridoMs: Date.now() - atual.iniciadaEm });
    }, 250);
    return () => clearInterval(intervalo);
  }, [gravando]);

  // Saiu da conversa: solta o microfone.
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
      gravacao.current?.cancelar();
      gravacao.current = null;
    };
  }, []);

  return { estado, iniciar, parar, cancelar, descartar };
}
