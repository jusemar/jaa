import { gravacaoEmCurso, obterExpoAudio, prepararParaTocar } from "@/features/conversas/lib/audio-nativo";
import { IDENTIDADE_SONORA, type NomeDoSom } from "./identidade-sonora";

/*
 * PLAYER dos sons do Jaaa, pelo mesmo expo-audio das mensagens de voz. Um player por som, criado no
 * primeiro uso. Sem o módulo nativo (build antigo), tudo fica em silêncio — nada quebra.
 *
 * Os arquivos entram no bundle por `require` estático (é assim que o Metro os inclui): os reservados
 * também, para estarem prontos quando o evento deles existir. Cada chamada toca UMA vez, sem laço.
 * Com o microfone aberto nenhum som do app toca (entraria na gravação).
 */
const ARQUIVOS: Record<NomeDoSom, number> = {
  mensagemRecebida: require("../../../assets/sons/01_jaaa_mensagem.wav"),
  novoPedido: require("../../../assets/sons/02_jaaa_novo_pedido.wav"),
  novaRota: require("../../../assets/sons/03_jaaa_nova_rota_entregador.wav"),
  sucesso: require("../../../assets/sons/04_jaaa_sucesso_confirmacao.wav"),
  atencao: require("../../../assets/sons/05_jaaa_alerta_atencao.wav"),
  chamada: require("../../../assets/sons/06_jaaa_chamada.wav"),
  mensagemEnviada: require("../../../assets/sons/07_jaaa_mensagem_enviada.wav"),
};

type Reprodutor = ReturnType<NonNullable<ReturnType<typeof obterExpoAudio>>["createAudioPlayer"]>;
const reprodutores = new Map<NomeDoSom, Reprodutor | null>();

function obterReprodutor(nome: NomeDoSom): Reprodutor | null {
  const existente = reprodutores.get(nome);
  if (existente !== undefined) return existente;
  let novo: Reprodutor | null = null;
  try {
    const audio = obterExpoAudio();
    novo = audio ? audio.createAudioPlayer(ARQUIVOS[nome]) : null;
    if (novo) novo.volume = IDENTIDADE_SONORA[nome].volume;
  } catch {
    novo = null;
  }
  reprodutores.set(nome, novo);
  return novo;
}

export function tocarSom(nome: NomeDoSom): void {
  if (!IDENTIDADE_SONORA[nome].ativo || gravacaoEmCurso()) return;
  const reprodutor = obterReprodutor(nome);
  if (!reprodutor) return;
  // Volta ao início antes de tocar: depois do primeiro toque o player está parado no fim da faixa.
  void prepararParaTocar()
    .then(() => reprodutor.seekTo(0))
    .then(() => reprodutor.play())
    .catch(() => undefined);
}
