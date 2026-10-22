import { VISITANTE_INATIVIDADE_MAXIMA_MS } from "@jaa/contratos";

export interface MarcaVisitante {
  ultimaAtividadeEm: Date;
  convertidaEm: Date | null;
  encerradaEm: Date | null;
}

/*
 * Em que pé está uma identidade visitante. Regra pura, a MESMA para a autenticação de cada requisição
 * e para a rotina de expiração:
 * - "ativa": pode conversar;
 * - "expirada": passou de 24 h sem atividade — a sessão já não vale, mesmo antes de a rotina limpar;
 * - "convertida": virou conta permanente e só falta escolher nome e @usuario;
 * - "encerrada": expirou e foi limpa; sobrou só como autora do histórico dos outros.
 */
export type SituacaoVisitante = "ativa" | "expirada" | "convertida" | "encerrada";

export function situacaoDoVisitante(marca: MarcaVisitante, agora: Date): SituacaoVisitante {
  if (marca.encerradaEm) return "encerrada";
  if (marca.convertidaEm) return "convertida";
  return agora.getTime() - marca.ultimaAtividadeEm.getTime() > VISITANTE_INATIVIDADE_MAXIMA_MS ? "expirada" : "ativa";
}

export function expiracaoDoVisitante(marca: Pick<MarcaVisitante, "ultimaAtividadeEm">): Date {
  return new Date(marca.ultimaAtividadeEm.getTime() + VISITANTE_INATIVIDADE_MAXIMA_MS);
}
