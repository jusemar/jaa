import { ROTULO_ESTADO_OPERACIONAL, type EntregadorOperacional, type PainelOperacional } from "./base-e-fila.ts";
import { empresaPodeAlternarVinculo, type EntregadorDaEmpresa } from "./entregador.ts";

/*
 * QUADRO DE ENTREGADORES DA EMPRESA, organizado por SITUAÇÃO — uma de cada vez na tela.
 *
 * Só APRESENTAÇÃO: nenhuma regra nasce aqui. Cada entregador cai em exatamente um grupo a partir do
 * que o servidor já decidiu — o vínculo (`status`, da lista de entregadores) e o painel operacional
 * (fila da base, fora da base, com rota, não aceitando). Web e Mobile usam esta mesma classificação.
 */

export const GRUPOS_DO_QUADRO_DE_ENTREGADORES = [
  // Com rota desta empresa: na rua ("Em entrega") ou com a rota reservada, ainda sem sair.
  { id: "na_rota", rotulo: "Na rota", vazio: "Ninguém em rota agora." },
  // Ativos, aceitando entregas e com presença confirmada na base: a fila, na ordem do servidor.
  { id: "disponiveis", rotulo: "Disponíveis", vazio: "Ninguém disponível na base agora." },
  // Ativos e aceitando entregas, mas sem presença confirmada na base (não entram na fila).
  { id: "fora_da_base", rotulo: "Fora da base", vazio: "Ninguém disponível fora da base." },
  // Ativos com a disponibilidade desligada (é como todo mundo fica ao aceitar o convite).
  { id: "indisponiveis", rotulo: "Indisponíveis", vazio: "Todos estão aceitando entregas." },
  // Vínculo desativado pela empresa.
  { id: "desativados", rotulo: "Desativados", vazio: "Nenhum entregador desativado." },
] as const satisfies readonly { id: string; rotulo: string; vazio: string }[];

export type GrupoDoQuadroDeEntregadores = (typeof GRUPOS_DO_QUADRO_DE_ENTREGADORES)[number]["id"];

// As opções da tela: os grupos de entregadores e, por último, a base (endereço, raio, mapa e fila).
export const ABA_OPERACAO_DA_BASE = "operacao_da_base";
export const ROTULO_ABA_OPERACAO_DA_BASE = "Operação da base";
export type AbaDoQuadroDeEntregadores = GrupoDoQuadroDeEntregadores | typeof ABA_OPERACAO_DA_BASE;

// Abre em "Disponíveis": é a pergunta do dia a dia — quem pode receber a próxima entrega agora.
export const ABA_INICIAL_DO_QUADRO_DE_ENTREGADORES: AbaDoQuadroDeEntregadores = "disponiveis";

export interface LinhaDoQuadroDeEntregadores {
  entregador: EntregadorDaEmpresa;
  // A situação daquela pessoa em uma frase curta ("1º da fila da base", "Em entrega"…).
  situacao: string;
  // Destaque visual para quem está operando agora (na fila ou em rota).
  emDestaque: boolean;
  // A ação que a empresa tem sobre o vínculo; null quando não há (ex.: nunca aceitou um convite).
  acao: { rotulo: "Desativar" | "Ativar"; status: "ativo" | "inativo" } | null;
}

export interface QuadroDeEntregadores {
  grupos: Record<GrupoDoQuadroDeEntregadores, LinhaDoQuadroDeEntregadores[]>;
  // Convites ainda não aceitos: NÃO são entregadores (nem ativos, nem desativados).
  pendentes: EntregadorDaEmpresa[];
}

function grupoDoAtivo(entregador: EntregadorDaEmpresa, painel: PainelOperacional): { grupo: GrupoDoQuadroDeEntregadores; operacional: EntregadorOperacional | null } {
  const naFila = painel.fila.find((item) => item.id === entregador.id);
  if (naFila) return { grupo: "disponiveis", operacional: naFila };
  const fora = painel.foraDaBase.find((item) => item.id === entregador.id);
  if (fora) return { grupo: "fora_da_base", operacional: fora };
  const demais = painel.indisponiveis.find((item) => item.id === entregador.id);
  // O terceiro grupo do servidor junta quem está COM ROTA e quem NÃO ESTÁ ACEITANDO: o estado separa.
  if (demais) return { grupo: demais.estado === "indisponivel" ? "indisponiveis" : "na_rota", operacional: demais };
  // Ainda não chegou ao painel (acabou de aceitar): vale o que o próprio vínculo diz.
  return { grupo: entregador.disponivel ? "fora_da_base" : "indisponiveis", operacional: null };
}

function situacaoDoAtivo(grupo: GrupoDoQuadroDeEntregadores, operacional: EntregadorOperacional | null): string {
  if (grupo === "na_rota") return operacional?.estado === "em_entrega" ? "Em entrega" : "Rota atribuída";
  if (grupo === "disponiveis" && operacional?.posicaoFila != null) return `${operacional.posicaoFila}º da fila da base`;
  if (operacional) return ROTULO_ESTADO_OPERACIONAL[operacional.estado];
  return grupo === "fora_da_base" ? ROTULO_ESTADO_OPERACIONAL.disponivel_fora_base : ROTULO_ESTADO_OPERACIONAL.indisponivel;
}

export function classificarQuadroDeEntregadores(entregadores: readonly EntregadorDaEmpresa[], painel: PainelOperacional): QuadroDeEntregadores {
  const grupos: QuadroDeEntregadores["grupos"] = { na_rota: [], disponiveis: [], fora_da_base: [], indisponiveis: [], desativados: [] };
  const pendentes: EntregadorDaEmpresa[] = [];

  for (const entregador of entregadores) {
    if (entregador.status === "convidado") {
      pendentes.push(entregador);
      continue;
    }
    if (entregador.status === "inativo") {
      // Reativar só quem já aceitou um convite; quem nunca aceitou depende de um novo convite.
      const reativavel = empresaPodeAlternarVinculo(entregador);
      grupos.desativados.push({ entregador, situacao: reativavel ? "Desativado" : "Desativado · precisa de novo convite", emDestaque: false, acao: reativavel ? { rotulo: "Ativar", status: "ativo" } : null });
      continue;
    }
    const { grupo, operacional } = grupoDoAtivo(entregador, painel);
    grupos[grupo].push({ entregador, situacao: situacaoDoAtivo(grupo, operacional), emDestaque: grupo === "na_rota" || grupo === "disponiveis", acao: { rotulo: "Desativar", status: "inativo" } });
  }

  // A fila tem ORDEM (a do servidor); os demais grupos seguem a ordem da lista de entregadores.
  const posicao = new Map(painel.fila.map((item, indice) => [item.id, indice]));
  grupos.disponiveis.sort((a, b) => (posicao.get(a.entregador.id) ?? 0) - (posicao.get(b.entregador.id) ?? 0));
  return { grupos, pendentes };
}
