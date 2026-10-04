import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { validarAudioGravado, type AudioGravado } from "../lib/audio-conversa";
import { microfoneDoAparelho } from "../lib/audio-nativo";
import { MENSAGEM_FALHA_GRAVACAO, iniciarGravacao, type Gravacao } from "../lib/gravador-audio";

type Fase = { fase: "parado" } | { fase: "pedindo-microfone" } | { fase: "gravando"; decorridoMs: number } | { fase: "pronto"; audio: AudioGravado };

/**
 * GRAVAÇÃO da mensagem de voz na conversa aberta: parado → gravando → pronto (ouvir, enviar ou
 * descartar). Uma gravação por vez.
 *
 * NÃO se grava em segundo plano: se o app sai do primeiro plano (outra tela do sistema, chamada,
 * bloqueio) ou a conversa é fechada durante a gravação, ela é CANCELADA e o microfone é solto — nunca
 * fica uma gravação "fantasma". O áudio já pronto (parado) continua disponível para enviar.
 */
export function useGravacaoAudio({ aoErro }: { aoErro: (mensagem: string | null) => void }) {
  const [estado, setEstado] = useState<Fase>({ fase: "parado" });
  const gravacao = useRef<Gravacao | null>(null);
  const ativo = useRef(true);

  const concluir = useCallback(
    async (resultado: Promise<AudioGravado | null>) => {
      gravacao.current = null;
      const audio = await resultado;
      if (!ativo.current) return;
      const problema = audio ? validarAudioGravado(audio) : "Não foi possível gravar o áudio. Tente de novo.";
      if (!audio || problema) {
        aoErro(problema);
        setEstado({ fase: "parado" });
        return;
      }
      setEstado({ fase: "pronto", audio });
    },
    [aoErro],
  );

  const iniciar = useCallback(async () => {
    if (gravacao.current || estado.fase !== "parado") return;
    aoErro(null);
    setEstado({ fase: "pedindo-microfone" });
    const inicio = await iniciarGravacao(microfoneDoAparelho(), (resultado) => void concluir(resultado));
    if (!inicio.ok) {
      if (ativo.current) {
        aoErro(MENSAGEM_FALHA_GRAVACAO[inicio.falha]);
        setEstado({ fase: "parado" });
      }
      return;
    }
    // A conversa fechou (ou o app saiu do primeiro plano) enquanto o sistema perguntava pela permissão.
    if (!ativo.current || AppState.currentState !== "active") {
      void inicio.gravacao.cancelar();
      if (ativo.current) setEstado({ fase: "parado" });
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
    void gravacao.current?.cancelar();
    gravacao.current = null;
    setEstado((atual) => (atual.fase === "gravando" || atual.fase === "pedindo-microfone" ? { fase: "parado" } : atual));
  }, []);

  /** Descarta o áudio pronto (ou o entrega a quem vai enviar). */
  const descartar = useCallback(() => setEstado((atual) => (atual.fase === "pronto" ? { fase: "parado" } : atual)), []);

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

  // App saiu do primeiro plano durante a gravação: cancela e avisa quando a pessoa voltar.
  useEffect(() => {
    if (!gravando) return;
    const assinatura = AppState.addEventListener("change", (situacao) => {
      if (situacao === "active") return;
      cancelar();
      aoErro("A gravação foi cancelada porque você saiu do Jaa.");
    });
    return () => assinatura.remove();
  }, [gravando, cancelar, aoErro]);

  // Saiu da conversa: solta o microfone.
  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
      void gravacao.current?.cancelar();
      gravacao.current = null;
    };
  }, []);

  return { estado, iniciar, parar, cancelar, descartar };
}
