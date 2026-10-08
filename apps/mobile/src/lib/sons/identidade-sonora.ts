/*
 * IDENTIDADE SONORA DO JAAA — os sete sons originais (`assets/sons`, descritos no LEIA-ME de lá).
 *
 * Som é de EVENTO, nunca de clique: cada um toca quando algo acontece (chegou mensagem, chegou pedido,
 * chegou rota…), no máximo UMA vez por acontecimento. Quem garante o "uma vez" é a memória por
 * identificador (`criarMemoriaDeEventos`): rerender, recarga, troca de tela, evento repetido do
 * socket e reconexão não repetem o som.
 *
 * O volume aqui é o do PLAYER do app (0 a 1). O volume de mídia do aparelho é da pessoa: o app nunca
 * mexe nele. Módulo puro — o que toca de verdade está em `tocar-som.ts`.
 */
export type NomeDoSom = "mensagemRecebida" | "novoPedido" | "novaRota" | "sucesso" | "atencao" | "chamada" | "mensagemEnviada";

export interface SomDoJaaa {
  arquivo: string;
  // Quando toca. Para os reservados, para que serve quando for ligado.
  uso: string;
  volume: number;
  // false = o arquivo está no app e mapeado, mas nenhum evento o toca ainda.
  ativo: boolean;
}

export const IDENTIDADE_SONORA: Record<NomeDoSom, SomDoJaaa> = {
  mensagemRecebida: { arquivo: "01_jaaa_mensagem.wav", uso: "Nova mensagem RECEBIDA, fora da conversa que a pessoa está vendo.", volume: 0.7, ativo: true },
  novoPedido: { arquivo: "02_jaaa_novo_pedido.wav", uso: "A EMPRESA recebe um pedido novo.", volume: 1, ativo: true },
  novaRota: { arquivo: "03_jaaa_nova_rota_entregador.wav", uso: "O ENTREGADOR recebe uma nova rota (pedido liberado para retirada). O alerta mais forte.", volume: 1, ativo: true },
  sucesso: { arquivo: "04_jaaa_sucesso_confirmacao.wav", uso: "Ação importante concluída: pedido confirmado pelo cliente e entrega marcada como entregue.", volume: 0.6, ativo: true },
  atencao: { arquivo: "05_jaaa_alerta_atencao.wav", uso: "Reservado: aviso importante que exige atenção (ainda sem evento que o justifique).", volume: 0.9, ativo: false },
  chamada: { arquivo: "06_jaaa_chamada.wav", uso: "Reservado: toque da futura chamada de voz (chamadas não existem).", volume: 1, ativo: false },
  mensagemEnviada: { arquivo: "07_jaaa_mensagem_enviada.wav", uso: "Confirmação discreta de mensagem ENVIADA (o servidor aceitou).", volume: 0.35, ativo: true },
};

const LEMBRAR_ULTIMOS = 300;

/**
 * Memória de "já avisei este acontecimento". `registrar(id)` devolve true só na PRIMEIRA vez que vê o
 * identificador — é o que deixa cada evento tocar uma única vez. Limitada às ocorrências recentes.
 */
export function criarMemoriaDeEventos(limite = LEMBRAR_ULTIMOS) {
  const vistos = new Set<string>();
  return {
    registrar(id: string): boolean {
      if (vistos.has(id)) return false;
      vistos.add(id);
      if (vistos.size > limite) {
        const maisAntigo = vistos.values().next().value;
        if (maisAntigo !== undefined) vistos.delete(maisAntigo);
      }
      return true;
    },
    conhece: (id: string) => vistos.has(id),
  };
}
