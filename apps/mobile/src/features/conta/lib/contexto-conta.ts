import {
  capacidadesConhecidas,
  contextoContaSchema,
  papelEmpresaConhecido,
  type CapacidadeConta,
  type ContextoContaRecebido,
  type IdentidadeOperavelRecebida,
  type PapelMembroEmpresa,
  type TipoCapacidade,
} from "@jaa/contratos";

/*
 * INTERPRETAÇÃO do contexto da conta no aparelho. O Mobile não recalcula nada (capacidade, estado,
 * papel): só lê o que o servidor montou, com o schema TOLERANTE (`contextoContaSchema`) para que uma API
 * mais nova nunca derrube uma versão antiga do app. Nada aqui autoriza: quem decide é o servidor.
 *
 * Sem React Native de propósito — é lógica pura, testada com `node:test`.
 */

export interface EmpresaOperavel {
  identidadeId: string;
  nomeExibicao: string;
  nomeUsuario: string;
  empresaId: string;
  slug: string;
  // Papel como o servidor mandou (pode ser um que esta versão ainda não conhece).
  papel: string;
  // `null` = papel desconhecido: é só um rótulo, nunca é tratado como proprietário.
  papelConhecido: PapelMembroEmpresa | null;
}

export interface ContextoContaInterpretado {
  versao: number;
  conta: ContextoContaRecebido["conta"];
  identidadePessoal: ContextoContaRecebido["identidadePessoal"];
  identidadesOperaveis: IdentidadeOperavelRecebida[];
  empresasOperaveis: EmpresaOperavel[];
  // Só as capacidades que ESTA versão conhece, com estado e resumo exatamente como vieram.
  capacidades: CapacidadeConta[];
  // Quantas vieram e foram ignoradas por serem de tipo/estado desconhecido (útil no diagnóstico).
  capacidadesIgnoradas: number;
}

export type ResultadoInterpretacao = { ok: true; contexto: ContextoContaInterpretado } | { ok: false; motivo: string };

export function interpretarContextoConta(bruto: unknown): ResultadoInterpretacao {
  const lido = contextoContaSchema.safeParse(bruto);
  if (!lido.success) return { ok: false, motivo: "Resposta do contexto em formato inesperado." };

  const { versao, conta, identidadePessoal, identidadesOperaveis } = lido.data;
  const capacidades = capacidadesConhecidas(lido.data.capacidades);
  const empresasOperaveis: EmpresaOperavel[] = [];
  for (const identidade of identidadesOperaveis) {
    if (identidade.tipo !== "empresarial") continue;
    empresasOperaveis.push({
      identidadeId: identidade.identidadeId,
      nomeExibicao: identidade.nomeExibicao,
      nomeUsuario: identidade.nomeUsuario,
      empresaId: identidade.empresa.id,
      slug: identidade.empresa.slug,
      papel: identidade.empresa.papel,
      papelConhecido: papelEmpresaConhecido(identidade.empresa.papel),
    });
  }

  return {
    ok: true,
    contexto: {
      versao,
      conta,
      identidadePessoal,
      identidadesOperaveis,
      empresasOperaveis,
      capacidades,
      capacidadesIgnoradas: lido.data.capacidades.length - capacidades.length,
    },
  };
}

// Consulta a LISTA (nada de um booleano por capacidade): capacidade ausente ou desconhecida = null.
export function capacidadeDoTipo<Tipo extends TipoCapacidade>(
  capacidades: readonly CapacidadeConta[],
  tipo: Tipo,
): Extract<CapacidadeConta, { tipo: Tipo }> | null {
  return (capacidades.find((capacidade) => capacidade.tipo === tipo) as Extract<CapacidadeConta, { tipo: Tipo }> | undefined) ?? null;
}

export function temCapacidade(capacidades: readonly CapacidadeConta[], tipo: TipoCapacidade): boolean {
  return capacidadeDoTipo(capacidades, tipo) !== null;
}
