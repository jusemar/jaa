import { DIAS_SEMANA, ROTULO_DIA_SEMANA, type DiaSemana, type GrupoOpcoesProduto, type ProgramacaoSemanalGrupo } from "@jaa/contratos";

/*
 * Regras de TELA da programação semanal (puras, sem rede): o que é "alteração não salva", como aplicar
 * um dia a outros e como contar o resultado. As regras de negócio (o que o cliente vê, mínimo/máximo,
 * quem pode alterar) são do servidor e de @jaa/contratos.
 */

/** Siglas do controle de sete posições — cabem lado a lado em 320 px. */
export const SIGLA_DIA: Record<DiaSemana, string> = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb", 7: "Dom" };

/** Dia de hoje no relógio do NAVEGADOR: só conveniência para o gestor. O dia do cardápio é do servidor. */
export function diaDeHojeNoNavegador(agora: Date = new Date()): DiaSemana {
  const domingoZero = agora.getDay();
  return (domingoZero === 0 ? 7 : domingoZero) as DiaSemana;
}

export function opcoesSalvasDoDia(programacao: ProgramacaoSemanalGrupo | null, dia: DiaSemana): string[] {
  return programacao?.dias.find((item) => item.diaSemana === dia)?.opcaoIds ?? [];
}

/** O rascunho do dia difere do que está salvo? A ordem das marcações não importa. */
export function rascunhoAlterado(salvas: readonly string[], rascunho: readonly string[]): boolean {
  if (salvas.length !== rascunho.length) return true;
  const marcadas = new Set(rascunho);
  return salvas.some((id) => !marcadas.has(id));
}

/** As opções marcadas, na ordem em que aparecem no grupo e sem repetição (é o que vai para o servidor). */
export function naOrdemDoGrupo(grupo: Pick<GrupoOpcoesProduto, "opcoes">, marcadas: readonly string[]): string[] {
  const conjunto = new Set(marcadas);
  return grupo.opcoes.map((opcao) => opcao.id).filter((id) => conjunto.has(id));
}

export function alternarOpcao(rascunho: readonly string[], opcaoId: string, marcada: boolean): string[] {
  const semEla = rascunho.filter((id) => id !== opcaoId);
  return marcada ? [...semEla, opcaoId] : semEla;
}

/** Destinos possíveis de "Aplicar a outros dias" e os atalhos (nunca incluem o próprio dia de origem). */
export function destinosPossiveis(origem: DiaSemana): { todos: DiaSemana[]; diasUteis: DiaSemana[] } {
  const todos = DIAS_SEMANA.filter((dia) => dia !== origem);
  return { todos, diasUteis: todos.filter((dia) => dia <= 5) };
}

export interface ResultadoDaAplicacao {
  aplicados: DiaSemana[];
  falhas: DiaSemana[];
  // A programação como o SERVIDOR a devolveu na última gravação que deu certo (null se nenhuma deu).
  programacao: ProgramacaoSemanalGrupo | null;
}

/**
 * Copia a seleção de um dia para os destinos, UMA gravação por dia (é como a API funciona). Uma falha
 * não interrompe as demais nem é escondida: o resultado diz exatamente o que foi aplicado e o que não.
 */
export async function aplicarAOutrosDias(
  destinos: readonly DiaSemana[],
  opcaoIds: readonly string[],
  salvarDia: (dia: DiaSemana, opcaoIds: string[]) => Promise<{ ok: true; dados: ProgramacaoSemanalGrupo } | { ok: false }>,
): Promise<ResultadoDaAplicacao> {
  const resultado: ResultadoDaAplicacao = { aplicados: [], falhas: [], programacao: null };
  for (const dia of destinos) {
    let resposta: Awaited<ReturnType<typeof salvarDia>>;
    try {
      resposta = await salvarDia(dia, [...opcaoIds]);
    } catch {
      resposta = { ok: false };
    }
    if (resposta.ok) {
      resultado.aplicados.push(dia);
      resultado.programacao = resposta.dados;
    } else resultado.falhas.push(dia);
  }
  return resultado;
}

const listarDias = (dias: readonly DiaSemana[]) => dias.map((dia) => ROTULO_DIA_SEMANA[dia].toLowerCase()).join(", ");

/** O que dizer ao gestor depois de aplicar: sucesso total só quando TODOS os dias foram gravados. */
export function mensagemDaAplicacao(resultado: Pick<ResultadoDaAplicacao, "aplicados" | "falhas">): { tom: "sucesso" | "erro"; texto: string } {
  if (resultado.falhas.length === 0) {
    return { tom: "sucesso", texto: resultado.aplicados.length === 1 ? `Aplicado a ${listarDias(resultado.aplicados)}.` : `Aplicado a ${resultado.aplicados.length} dias.` };
  }
  if (resultado.aplicados.length === 0) return { tom: "erro", texto: `Nada foi aplicado. Não foi possível salvar: ${listarDias(resultado.falhas)}. Tente novamente.` };
  return { tom: "erro", texto: `Aplicado a ${listarDias(resultado.aplicados)}. NÃO foi aplicado a ${listarDias(resultado.falhas)} — tente de novo nesses dias.` };
}

/** Resumo do grupo na lista: só com o que a lista de grupos JÁ traz (nenhuma consulta a mais). */
export function resumoDoGrupo(grupo: GrupoOpcoesProduto): { total: number; indisponiveis: number; semanal: boolean; problema: string | null } {
  const total = grupo.opcoes.length;
  const disponiveis = grupo.opcoes.filter((opcao) => opcao.disponibilidade === "disponivel").length;
  const problema =
    total === 0
      ? "Sem opções"
      : disponiveis === 0
        ? "Nenhuma disponível"
        : disponiveis < grupo.minimoEscolhas
          ? `Exige ${grupo.minimoEscolhas}, há ${disponiveis}`
          : null;
  return { total, indisponiveis: total - disponiveis, semanal: grupo.programacaoSemanal, problema };
}
