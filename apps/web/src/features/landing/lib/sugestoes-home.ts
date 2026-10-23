import { NOME_USUARIO_FORMATO, normalizarNomeUsuario } from "@jaa/contratos";

/*
 * SUGESTÕES DA HOME: perfis REAIS do Jaaa escolhidos para a primeira visita não começar vazia. A lista
 * é só de @usuarios (curadoria de produto, em `NEXT_PUBLIC_JAA_SUGESTOES_HOME`, separados por vírgula);
 * os dados de cada um vêm da consulta pública de sempre, com a privacidade do servidor. @usuario que não
 * existe ou deixou de ser contatável simplesmente não aparece.
 */
export const SUGESTOES_HOME_PADRAO = ["junior"] as const;
export const MAXIMO_SUGESTOES_HOME = 6;

export function usuariosSugeridosNaHome(configuracao: string | undefined): string[] {
  const informados = (configuracao ?? "")
    .split(",")
    .map((valor) => normalizarNomeUsuario(valor))
    .filter((valor) => NOME_USUARIO_FORMATO.test(valor));
  const lista = informados.length > 0 ? informados : [...SUGESTOES_HOME_PADRAO];
  return [...new Set(lista)].slice(0, MAXIMO_SUGESTOES_HOME);
}

/*
 * INTENÇÕES da Home ("Quer falar com alguém?", "Quer pedir comida?"…): cada perfil sugerido entra na
 * intenção que o DADO PÚBLICO dele mostra — pessoa, empresa com cardápio ou empresa sem cardápio. Nada
 * é declarado à mão: se o restaurante tirar todos os produtos, ele sai de "pedir comida". Profissionais
 * não entram aqui: o perfil público não diz o serviço, e a busca de profissionais exige conta.
 */
export type IntencaoHome = "conversar" | "pedir-comida" | "falar-com-empresa";

export const ORDEM_INTENCOES_HOME: readonly IntencaoHome[] = ["conversar", "pedir-comida", "falar-com-empresa"];

export function intencaoDoPerfil(perfil: { tipo: "pessoal" | "empresarial"; temCardapio: boolean }): IntencaoHome {
  if (perfil.tipo === "pessoal") return "conversar";
  return perfil.temCardapio ? "pedir-comida" : "falar-com-empresa";
}

/** Grupos na ordem fixa das intenções, mantendo a ordem da curadoria dentro de cada um; grupo vazio some. */
export function agruparPorIntencao<T extends { tipo: "pessoal" | "empresarial"; temCardapio: boolean }>(perfis: readonly T[]): { intencao: IntencaoHome; perfis: T[] }[] {
  return ORDEM_INTENCOES_HOME.map((intencao) => ({ intencao, perfis: perfis.filter((perfil) => intencaoDoPerfil(perfil) === intencao) })).filter((grupo) => grupo.perfis.length > 0);
}
