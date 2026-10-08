import type { IntencaoProfissional, ResultadoBusca } from "@jaa/contratos";

/*
 * PESQUISAR NO JAAA — como os resultados são ORGANIZADOS na tela. Nada aqui busca: são os mesmos
 * dados das duas consultas de sempre (pessoas/empresas e atividades profissionais), só agrupados
 * pelo TIPO do que a pessoa procura e recortados pelo filtro escolhido.
 */

export type FiltroPesquisa = "tudo" | "pessoas" | "profissionais" | "empresas";

export const ROTULO_FILTRO_PESQUISA: Record<FiltroPesquisa, string> = {
  tudo: "Tudo",
  pessoas: "Pessoas",
  profissionais: "Profissionais",
  empresas: "Empresas",
};

/** Filtros oferecidos: "Profissionais" só existe onde a busca de profissionais existe (Conversas). */
export function filtrosDaPesquisa(comProfissionais: boolean): FiltroPesquisa[] {
  return comProfissionais ? ["tudo", "pessoas", "profissionais", "empresas"] : ["tudo", "pessoas", "empresas"];
}

export interface ResultadosOrganizados {
  profissionais: IntencaoProfissional[];
  empresas: ResultadoBusca[];
  pessoas: ResultadoBusca[];
  vazio: boolean;
}

/**
 * Agrupa por tipo, na ordem da tela (Profissionais, Empresas, Pessoas), e aplica o filtro. Dentro de
 * Empresas e de Pessoas, os MEUS CONTATOS continuam vindo primeiro — a ordem que o servidor mandou.
 */
export function organizarResultados(
  resultado: { contatos: ResultadoBusca[]; externos: ResultadoBusca[] } | null,
  intencoes: IntencaoProfissional[],
  filtro: FiltroPesquisa,
): ResultadosOrganizados {
  const todos = resultado ? [...resultado.contatos, ...resultado.externos] : [];
  const mostra = (grupo: Exclude<FiltroPesquisa, "tudo">) => filtro === "tudo" || filtro === grupo;
  const profissionais = mostra("profissionais") ? intencoes : [];
  const empresas = mostra("empresas") ? todos.filter((item) => item.identidade.tipo === "empresarial") : [];
  const pessoas = mostra("pessoas") ? todos.filter((item) => item.identidade.tipo === "pessoal") : [];
  return { profissionais, empresas, pessoas, vazio: profissionais.length + empresas.length + pessoas.length === 0 };
}

/** Texto de "nada encontrado", dizendo ONDE não achou quando há filtro ligado. */
export function textoSemResultados(termo: string, filtro: FiltroPesquisa): string {
  const onde = filtro === "tudo" ? "" : ` em ${ROTULO_FILTRO_PESQUISA[filtro]}`;
  return `Nada encontrado${onde} para “${termo}”.`;
}
