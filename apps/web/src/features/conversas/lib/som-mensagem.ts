/*
 * SOM DE MENSAGEM RECEBIDA: dois toques curtos gerados pela Web Audio API do próprio navegador — sem
 * arquivo, sem serviço externo, sem dependência. Volume baixo; é complemento do indicador visual.
 *
 * AUTOPLAY: o navegador só deixa tocar som depois de uma interação da pessoa com a página. O contexto
 * de áudio só é criado/retomado em `habilitar()` (chamado no primeiro toque/tecla); antes disso,
 * `tocar` simplesmente não faz barulho — sem erro visível.
 *
 * Uma mensagem toca NO MÁXIMO UMA VEZ (por id): evento repetido ou reconexão não repetem o som.
 */

export interface ContextoAudioMinimo {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: AudioNode;
  resume(): Promise<void>;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
}

/** Um som = notas (frequência e início em segundos), duração de cada nota e volume. */
export interface PadraoSom {
  notas: ReadonlyArray<{ frequencia: number; inicio: number }>;
  duracao: number;
  volume: number;
}

// Mensagem comum: dois toques curtos e baixos.
export const PADRAO_SOM_MENSAGEM: PadraoSom = { notas: [{ frequencia: 880, inicio: 0 }, { frequencia: 1320, inicio: 0.14 }], duracao: 0.12, volume: 0.06 };

// "Sua entrega é a próxima": três notas subindo, mais longas e mais altas — sem virar alarme.
export const PADRAO_SOM_ENTREGA_PROXIMA: PadraoSom = {
  notas: [
    { frequencia: 659, inicio: 0 },
    { frequencia: 880, inicio: 0.28 },
    { frequencia: 1175, inicio: 0.56 },
  ],
  duracao: 0.26,
  volume: 0.16,
};

const LEMBRAR_ULTIMAS = 200;

export function criarTocadorSomMensagem(criarContexto: () => ContextoAudioMinimo | null) {
  return criarTocadorSom(criarContexto, PADRAO_SOM_MENSAGEM);
}

export function criarTocadorSom(criarContexto: () => ContextoAudioMinimo | null, padrao: PadraoSom) {
  let contexto: ContextoAudioMinimo | null = null;
  const tocadas = new Set<string>();

  function lembrar(mensagemId: string): boolean {
    if (tocadas.has(mensagemId)) return false;
    tocadas.add(mensagemId);
    // Memória limitada: só as mais recentes importam para evitar repetição.
    if (tocadas.size > LEMBRAR_ULTIMAS) {
      const maisAntiga = tocadas.values().next().value;
      if (maisAntiga !== undefined) tocadas.delete(maisAntiga);
    }
    return true;
  }

  function bipe(ctx: ContextoAudioMinimo, inicio: number, frequencia: number) {
    const oscilador = ctx.createOscillator();
    const ganho = ctx.createGain();
    oscilador.type = "sine";
    oscilador.frequency.setValueAtTime(frequencia, inicio);
    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(padrao.volume, inicio + 0.01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + padrao.duracao);
    oscilador.connect(ganho);
    ganho.connect(ctx.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + padrao.duracao + 0.01);
  }

  return {
    // Chamado numa interação da pessoa (toque/tecla): a partir daí o navegador permite o som.
    habilitar() {
      try {
        contexto ??= criarContexto();
        if (contexto?.state === "suspended") void contexto.resume().catch(() => {});
      } catch {
        contexto = null;
      }
    },
    /** true = este aviso (id) ainda não tinha tocado (e o som foi pedido, se o áudio estiver liberado). */
    tocar(mensagemId: string): boolean {
      if (!lembrar(mensagemId)) return false;
      if (!contexto || contexto.state !== "running") return true;
      try {
        const agora = contexto.currentTime;
        for (const nota of padrao.notas) bipe(contexto, agora + nota.inicio, nota.frequencia);
      } catch {
        // Áudio indisponível não pode atrapalhar a conversa.
      }
      return true;
    },
  };
}

export type TocadorSomMensagem = ReturnType<typeof criarTocadorSomMensagem>;
