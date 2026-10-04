import { formatarDuracaoAudio } from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { fracaoTocada, proximaVelocidade, rotuloVelocidade } from "../lib/audio-conversa";
import { obterExpoAudio, prepararParaTocar } from "../lib/audio-nativo";
import { configurarReprodutor, encerrarNoFim, lerSituacao } from "../lib/controle-reproducao";
import { reprodutorUnico } from "../lib/reprodutor-unico";
import type { EstadoImagem } from "../lib/urls-imagens";

/*
 * PLAYER DE ÁUDIO do Jaa no app (mensagem de voz) — o mesmo da Web: tocar/pausar, barra de progresso
 * com busca (toque na barra), tempo e velocidade (1x → 1,5x → 2x). Dentro do balão: sem tela cheia e
 * sem abrir outro aplicativo.
 *
 * - A DURAÇÃO exibida vem do anexo, então o tempo aparece antes de baixar o áudio.
 * - Sem forma de onda: não há dado real para desenhá-la.
 * - O reprodutor nativo só é criado quando a pessoa toca em ouvir, e é liberado ao sair da tela.
 * - A URL é privada e temporária (ou o arquivo local, na prévia): falha ao carregar avisa quem cuida do
 *   cache (`aoFalhar`), que renova UMA vez.
 * - Um áudio por vez: começar a tocar pausa o que estava tocando.
 */
type Reprodutor = ReturnType<NonNullable<ReturnType<typeof obterExpoAudio>>["createAudioPlayer"]>;

export function PlayerAudio({
  estado,
  duracaoMs,
  aoFalhar,
  aoCarregar,
}: {
  estado: EstadoImagem;
  duracaoMs: number;
  aoFalhar?: (() => void) | undefined;
  aoCarregar?: (() => void) | undefined;
}) {
  const url = estado.situacao === "pronta" ? estado.url : null;
  const reprodutor = useRef<Reprodutor | null>(null);
  const [tocando, setTocando] = useState(false);
  const [tempoAtual, setTempoAtual] = useState(0);
  const [velocidade, setVelocidade] = useState(1);
  const [larguraBarra, setLarguraBarra] = useState(0);
  const semModulo = obterExpoAudio() === null;
  // Callbacks mais recentes, sem recriar o reprodutor a cada render.
  const avisos = useRef({ aoFalhar, aoCarregar });
  useEffect(() => {
    avisos.current = { aoFalhar, aoCarregar };
  });

  const pausarEste = useRef(() => reprodutor.current?.pause());

  // Sai da tela ou a URL muda (renovada): para, libera a vez e solta o reprodutor nativo.
  useEffect(() => {
    const pausar = pausarEste.current;
    return () => {
      reprodutorUnico.liberar(pausar);
      reprodutor.current?.remove();
      reprodutor.current = null;
      setTocando(false);
      setTempoAtual(0);
    };
  }, [url]);

  function obterReprodutor(): Reprodutor | null {
    if (reprodutor.current) return reprodutor.current;
    const audio = obterExpoAudio();
    if (!audio || !url) return null;
    const novo = audio.createAudioPlayer({ uri: url }, { updateInterval: 250 });
    // Toca UMA vez (sem repetição), sem mudo e no volume cheio do app.
    configurarReprodutor(novo);
    let carregou = false;
    novo.addListener("playbackStatusUpdate", (situacao) => {
      const leitura = lerSituacao(situacao);
      if (leitura.tipo === "erro") {
        // Falha REAL (URL vencida, arquivo inacessível): quem cuida do cache renova uma vez.
        setTocando(false);
        avisos.current.aoFalhar?.();
        return;
      }
      if (situacao.isLoaded && !carregou) {
        carregou = true;
        avisos.current.aoCarregar?.();
      }
      if (leitura.tipo === "terminou") {
        /*
         * Fim NORMAL: pausa ANTES de voltar ao início (senão o ExoPlayer, ainda em "tocar quando
         * pronto", recomeça sozinho e o áudio se repete). Não é erro: nada de renovar a URL, recriar
         * o reprodutor ou tocar de novo — só o toque em Play recomeça.
         */
        encerrarNoFim(novo);
        reprodutorUnico.liberar(pausarEste.current);
        setTocando(false);
        setTempoAtual(0);
        return;
      }
      setTocando(leitura.tocando);
      setTempoAtual(leitura.tempoAtual);
    });
    reprodutor.current = novo;
    return novo;
  }

  async function alternar() {
    const atual = obterReprodutor();
    if (!atual) return;
    if (atual.playing) {
      atual.pause();
      reprodutorUnico.liberar(pausarEste.current);
      return;
    }
    reprodutorUnico.assumir(pausarEste.current);
    await prepararParaTocar();
    atual.setPlaybackRate(velocidade);
    atual.play();
  }

  function buscar(evento: GestureResponderEvent) {
    const atual = reprodutor.current;
    if (!atual || larguraBarra <= 0) return;
    const fracao = Math.min(1, Math.max(0, evento.nativeEvent.locationX / larguraBarra));
    const segundos = (fracao * duracaoMs) / 1000;
    setTempoAtual(segundos);
    void atual.seekTo(segundos).catch(() => undefined);
  }

  function trocarVelocidade() {
    const nova = proximaVelocidade(velocidade);
    setVelocidade(nova);
    reprodutor.current?.setPlaybackRate(nova);
  }

  const indisponivel = estado.situacao === "indisponivel" || semModulo;
  const inativo = !url || semModulo;
  const fracao = fracaoTocada(tempoAtual, duracaoMs);

  return (
    <View accessibilityLabel={`Áudio de ${formatarDuracaoAudio(duracaoMs)}`} style={estilos.player}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tocando ? "Pausar áudio" : "Ouvir áudio"}
        accessibilityState={{ disabled: inativo }}
        disabled={inativo}
        hitSlop={6}
        onPress={() => void alternar()}
        style={[estilos.botao, inativo && estilos.inativo]}>
        <Icone nome={indisponivel ? "microfone" : tocando ? "pausar" : "tocar"} tamanho={18} cor="marcaConteudo" />
      </Pressable>

      <View style={estilos.meio}>
        {indisponivel ? (
          <Texto variante="pequeno" cor="conteudoSuave">
            {semModulo ? "Atualize o app para ouvir" : "Áudio indisponível"}
          </Texto>
        ) : (
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Posição do áudio"
            accessibilityValue={{ text: `${formatarDuracaoAudio(tempoAtual * 1000)} de ${formatarDuracaoAudio(duracaoMs)}` }}
            onLayout={(evento: LayoutChangeEvent) => setLarguraBarra(evento.nativeEvent.layout.width)}
            onPress={buscar}
            hitSlop={{ top: 12, bottom: 12 }}
            style={estilos.trilho}>
            <View style={[estilos.progresso, { width: `${fracao * 100}%` }]} />
          </Pressable>
        )}
        <Texto variante="miniForte" cor="conteudoSuave" style={estilos.tempo}>
          {estado.situacao === "carregando" && !semModulo
            ? `${formatarDuracaoAudio(duracaoMs)} · carregando…`
            : tempoAtual > 0 || tocando
              ? formatarDuracaoAudio(tempoAtual * 1000)
              : formatarDuracaoAudio(duracaoMs)}
        </Texto>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Velocidade ${rotuloVelocidade(velocidade)}. Trocar velocidade`}
        disabled={inativo}
        hitSlop={6}
        onPress={trocarVelocidade}
        style={[estilos.velocidade, inativo && estilos.inativo]}>
        <Texto variante="pequenoForte" cor="conteudoSuave">
          {rotuloVelocidade(velocidade)}
        </Texto>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  player: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, minWidth: 210 },
  botao: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.total, height: 36, justifyContent: "center", width: 36 },
  inativo: { opacity: 0.45 },
  meio: { flex: 1, gap: 6, minWidth: 0 },
  trilho: { backgroundColor: "rgba(35,44,45,0.16)", borderRadius: 2, height: 4, overflow: "hidden" },
  progresso: { backgroundColor: Cores.marca, height: 4 },
  tempo: { fontWeight: "400" },
  velocidade: { alignItems: "center", backgroundColor: "rgba(35,44,45,0.08)", borderRadius: Raio.total, height: 28, justifyContent: "center", minWidth: 40, paddingHorizontal: 6 },
});
