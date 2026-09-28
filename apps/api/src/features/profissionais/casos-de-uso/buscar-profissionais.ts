import type { Banco } from "@jaa/banco";
import { especialidadesServico, opcoesAtributo, servicosProfissionais } from "@jaa/banco/schema";
import {
  MAXIMO_PAGINAS_BUSCA_PROFISSIONAIS,
  TAMANHO_PAGINA_BUSCA_PROFISSIONAIS,
  buscarProfissionaisEntradaSchema,
  type IntencaoProfissional,
  type PaginaProfissionaisEncontrados,
} from "@jaa/contratos";
import { and, eq, inArray } from "drizzle-orm";
import { buscarProfissionaisCompativeis, paraResultadosPublicos } from "../repositorios/repositorio-matching.js";
import { buscarServicosPorTermo } from "../repositorios/repositorio-taxonomia.js";

// Sem termo exato, no máximo estas sugestões para a pessoa escolher.
const MAXIMO_INTENCOES_SUGERIDAS = 5;

const chave = (item: { servicoId: string; especialidadeId: string | null; opcaoId: string | null }) =>
  `${item.servicoId}|${item.especialidadeId ?? ""}|${item.opcaoId ?? ""}`;

/**
 * TEXTO → INTENÇÕES ESTRUTURADAS (atividade + especialidade/opção), pelo dicionário de termos.
 *
 * Termos diferentes que levam ao MESMO alvo viram uma intenção só ("Motoboy" e "Motoqueiro" são
 * Entregador + Moto). Se o texto bate EXATAMENTE com algum termo, valem só as intenções exatas;
 * senão, as mais próximas são SUGESTÕES — e continuam várias quando o texto é ambíguo ("moto" pode
 * ser Entregador de moto ou Mototáxi). Quem escolhe é a pessoa, nunca uma prioridade escondida.
 */
export async function resolverIntencoesProfissionais(banco: Banco, termo: string): Promise<IntencaoProfissional[]> {
  const encontrados = await buscarServicosPorTermo(banco, termo);
  const exatos = encontrados.filter((item) => item.prioridade === 0);
  const candidatos = exatos.length > 0 ? exatos : encontrados;

  const unicos = new Map<string, (typeof candidatos)[number]>();
  for (const item of candidatos) if (!unicos.has(chave(item))) unicos.set(chave(item), item);
  const escolhidos = [...unicos.values()].slice(0, exatos.length > 0 ? unicos.size : MAXIMO_INTENCOES_SUGERIDAS);

  const especialidadeIds = escolhidos.flatMap((item) => (item.especialidadeId ? [item.especialidadeId] : []));
  const opcaoIds = escolhidos.flatMap((item) => (item.opcaoId ? [item.opcaoId] : []));
  const [especialidades, opcoes] = await Promise.all([
    especialidadeIds.length === 0
      ? []
      : banco.select({ id: especialidadesServico.id, nome: especialidadesServico.nome }).from(especialidadesServico).where(inArray(especialidadesServico.id, especialidadeIds)),
    opcaoIds.length === 0 ? [] : banco.select({ id: opcoesAtributo.id, nome: opcoesAtributo.nome }).from(opcoesAtributo).where(inArray(opcoesAtributo.id, opcaoIds)),
  ]);
  const nomes = new Map([...especialidades, ...opcoes].map((linha) => [linha.id, linha.nome]));

  return escolhidos.map((item) => {
    const detalhe = (item.especialidadeId && nomes.get(item.especialidadeId)) || (item.opcaoId && nomes.get(item.opcaoId)) || null;
    return {
      servicoId: item.servicoId,
      especialidadeId: item.especialidadeId,
      opcaoId: item.opcaoId,
      rotulo: detalhe ? `${item.servicoNome} · ${detalhe}` : item.servicoNome,
      exata: item.prioridade === 0,
    };
  });
}

export type ResultadoBuscaProfissionais =
  | { tipo: "encontrados"; pagina: PaginaProfissionaisEncontrados }
  | { tipo: "dados-invalidos"; mensagem: string }
  | { tipo: "intencao-invalida" };

/**
 * BUSCA: atividade (+ especialidade/opção) perto do LOCAL DA PESQUISA.
 *
 * A intenção vem do cliente, então é CONFERIDA de novo aqui: atividade ativa e especialidade/opção
 * ativas DESSA atividade. O matching (uma consulta PostGIS) exige as duas condições geográficas: a
 * BASE do profissional dentro do raio da pesquisa E uma área de atuação ativa dele cobrindo o ponto.
 * Horário não esconde ninguém: "Atendendo agora"/"Fechado agora" é só informação.
 */
export async function buscarProfissionais(banco: Banco, pesquisadorPessoalId: string, entrada: unknown, agora = new Date()): Promise<ResultadoBuscaProfissionais> {
  const dados = buscarProfissionaisEntradaSchema.safeParse(entrada);
  if (!dados.success) return { tipo: "dados-invalidos", mensagem: dados.error.issues[0]?.message ?? "Busca inválida." };
  const { servicoId, especialidadeId, opcaoId, latitude, longitude, raioKm, pagina } = dados.data;

  const [servico] = await banco
    .select({ id: servicosProfissionais.id })
    .from(servicosProfissionais)
    .where(and(eq(servicosProfissionais.id, servicoId), eq(servicosProfissionais.ativo, true)));
  if (!servico) return { tipo: "intencao-invalida" };
  if (especialidadeId) {
    const [especialidade] = await banco
      .select({ id: especialidadesServico.id })
      .from(especialidadesServico)
      .where(and(eq(especialidadesServico.id, especialidadeId), eq(especialidadesServico.servicoId, servicoId), eq(especialidadesServico.ativa, true)));
    if (!especialidade) return { tipo: "intencao-invalida" };
  }
  if (opcaoId) {
    const [opcao] = await banco
      .select({ id: opcoesAtributo.id })
      .from(opcoesAtributo)
      .where(and(eq(opcoesAtributo.id, opcaoId), eq(opcoesAtributo.servicoId, servicoId), eq(opcoesAtributo.ativa, true)));
    if (!opcao) return { tipo: "intencao-invalida" };
  }

  // Um a mais que a página: diz se há próxima sem contar tudo.
  const compativeis = await buscarProfissionaisCompativeis(banco, {
    servicoId,
    ponto: { latitude, longitude },
    especialidadeIds: especialidadeId ? [especialidadeId] : undefined,
    opcaoIds: opcaoId ? [opcaoId] : undefined,
    raioBuscaMetros: raioKm * 1000,
    horario: { instante: agora },
    excluirIdentidadeId: pesquisadorPessoalId,
    limite: TAMANHO_PAGINA_BUSCA_PROFISSIONAIS + 1,
    deslocamento: pagina * TAMANHO_PAGINA_BUSCA_PROFISSIONAIS,
  });
  const itens = await paraResultadosPublicos(banco, compativeis.slice(0, TAMANHO_PAGINA_BUSCA_PROFISSIONAIS));
  const temMais = compativeis.length > TAMANHO_PAGINA_BUSCA_PROFISSIONAIS && pagina + 1 < MAXIMO_PAGINAS_BUSCA_PROFISSIONAIS;
  return { tipo: "encontrados", pagina: { itens, pagina, temMais } };
}
