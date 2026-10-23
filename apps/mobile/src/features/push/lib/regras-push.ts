import { CANAL_PUSH_MENSAGENS, dadosPushSchema, type DadosPush } from "@jaa/contratos";

/*
 * Regras PURAS do push no app (sem React Native): o que mostrar com o app aberto, o que um toque pode
 * abrir e quando oferecer a permissão. Quem recebe o quê é decisão do servidor; aqui não há nenhuma.
 */

/**
 * App em PRIMEIRO PLANO: o realtime já entregou (lista, não lidas e o som de mensagem do Jaaa, que só toca
 * fora da conversa que a pessoa está vendo). O push que chegar nesse momento não vira banner, nem som,
 * nem entra na bandeja — seria o mesmo aviso duas vezes, com dois sons.
 */
export function apresentacaoEmPrimeiroPlano() {
  return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false } as const;
}

export type DestinoDoToque = { tipo: "ignorar" } | { tipo: "abrir"; dados: DadosPush; trocarIdentidade: boolean };

/**
 * O que um toque abre. O payload é só um ENDEREÇO: precisa ter o formato conhecido (versão 1) e a
 * identidade destinatária precisa estar entre as que o SERVIDOR diz que esta conta opera agora — senão,
 * nada acontece (vínculo removido, outra conta no aparelho, payload estranho). A troca em si ainda é
 * confirmada pela API (`selecionar`).
 */
export function destinoDoToque(bruto: unknown, operaveis: readonly { identidadeId: string }[], ativaId: string | null): DestinoDoToque {
  const dados = dadosPushSchema.safeParse(bruto);
  if (!dados.success) return { tipo: "ignorar" };
  if (!operaveis.some((identidade) => identidade.identidadeId === dados.data.identidadeId)) return { tipo: "ignorar" };
  return { tipo: "abrir", dados: dados.data, trocarIdentidade: dados.data.identidadeId !== ativaId };
}

export type SituacaoPermissao = { status: "granted" | "denied" | "undetermined"; podePerguntar: boolean };
export type OfertaDeAvisos = "pedir" | "configuracoes" | "nenhuma";

/**
 * O cartão "Ativar avisos no celular": nunca na abertura do app sem contexto (só em Conversas) e nunca
 * insistente — "Agora não" encerra o assunto ali; quem mudar de ideia ativa pelo Perfil.
 * - já permitido → nada;
 * - o Android ainda pergunta → oferecer;
 * - o Android não pergunta mais (negado de vez) → orientar para as configurações.
 */
export function ofertaDeAvisos(permissao: SituacaoPermissao | null, dispensado: boolean): OfertaDeAvisos {
  if (!permissao || dispensado || permissao.status === "granted") return "nenhuma";
  return permissao.podePerguntar ? "pedir" : "configuracoes";
}

/**
 * O canal que o app garante no Android: o MESMO id que o servidor manda (`CANAL_PUSH_MENSAGENS`). Sem
 * `sound` = som padrão do sistema. Repetir a criação não muda um canal existente (o Android só atualiza
 * nome e descrição): o que a pessoa ajustar nas configurações do Android vale por cima do Jaaa.
 */
export function canalAndroidDeMensagens() {
  return { id: CANAL_PUSH_MENSAGENS, name: "Mensagens", description: "Novas mensagens no Jaaa." } as const;
}
