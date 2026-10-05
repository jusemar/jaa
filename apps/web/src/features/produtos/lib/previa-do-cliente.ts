import type { DiaSemana, GrupoOpcoesProduto, GrupoOpcoesPublico, ProgramacaoSemanalGrupo } from "@jaa/contratos";

/**
 * O que o CLIENTE encontraria no cardápio num dia da semana, calculado com os dados administrativos já
 * carregados — a mesma regra do servidor: só opção disponível, só o que o dia oferece quando o grupo
 * tem programação semanal, e grupo que não consegue cumprir o próprio mínimo não aparece.
 *
 * É só PRÉVIA para o gestor. No pedido de verdade quem decide é a API, com o dia da empresa.
 */
export function gruposDoClienteNoDia(grupos: readonly GrupoOpcoesProduto[], programacoes: Readonly<Record<string, ProgramacaoSemanalGrupo>>, dia: DiaSemana): GrupoOpcoesPublico[] {
  return grupos.flatMap((grupo) => {
    const doDia = grupo.programacaoSemanal ? new Set(programacoes[grupo.id]?.dias.find((item) => item.diaSemana === dia)?.opcaoIds ?? []) : null;
    const opcoes = grupo.opcoes
      .filter((opcao) => opcao.disponibilidade === "disponivel" && (doDia === null || doDia.has(opcao.id)))
      .map((opcao) => ({ id: opcao.id, nome: opcao.nome, precoAdicionalCentavos: opcao.precoAdicionalCentavos }));
    if (opcoes.length === 0 || opcoes.length < grupo.minimoEscolhas) return [];
    return [{ id: grupo.id, nome: grupo.nome, instrucao: grupo.instrucao, minimoEscolhas: grupo.minimoEscolhas, maximoEscolhas: grupo.maximoEscolhas, opcoes }];
  });
}
