import {
  HORARIOS_ATENDIMENTO_PADRAO,
  alteracaoInvalidaLocalizacao,
  type BaseProfissionalDoDono,
  LIMITES_PERFIL_PROFISSIONAL,
  minutosDoDia,
  periodoAtendimentoSchema,
  periodosSeSobrepoem,
  type AreaAtuacaoDoDono,
  type AtividadeDoPerfil,
  type CatalogoServicos,
  type PendenciaPerfilProfissional,
  type PeriodoAtendimento,
  type ServicoCatalogo,
  type SituacaoPerfilProfissional,
} from "@jaa/contratos";

/*
 * APRESENTAÇÃO do Perfil Profissional: regras de TELA, puras e testáveis. Nada aqui decide negócio —
 * a API valida tudo de novo; isto só evita mandar ao servidor o que já se sabe estar errado e deixa
 * os textos num lugar só (curtos, como pede o produto).
 */

export const DIAS = [
  { dia: 1, rotulo: "Segunda" },
  { dia: 2, rotulo: "Terça" },
  { dia: 3, rotulo: "Quarta" },
  { dia: 4, rotulo: "Quinta" },
  { dia: 5, rotulo: "Sexta" },
  { dia: 6, rotulo: "Sábado" },
  { dia: 7, rotulo: "Domingo" },
] as const;

export interface FaixaHorario {
  inicio: string;
  fim: string;
}

// Grade em edição: um item por dia, cada um com zero ou mais faixas.
export type GradeSemanal = Record<number, FaixaHorario[]>;

export function gradeDosPeriodos(periodos: readonly PeriodoAtendimento[]): GradeSemanal {
  const grade: GradeSemanal = {};
  for (const { dia } of DIAS) grade[dia] = [];
  for (const periodo of [...periodos].sort((a, b) => minutosDoDia(a.inicio) - minutosDoDia(b.inicio))) {
    grade[periodo.diaSemana]?.push({ inicio: periodo.inicio, fim: periodo.fim });
  }
  return grade;
}

export function periodosDaGrade(grade: GradeSemanal): PeriodoAtendimento[] {
  return DIAS.flatMap(({ dia }) => (grade[dia] ?? []).map((faixa) => ({ diaSemana: dia, inicio: faixa.inicio, fim: faixa.fim })));
}

// Ao LIGAR um dia, ele começa com a faixa do padrão (08:00–18:00).
export const FAIXA_PADRAO: FaixaHorario = { inicio: HORARIOS_ATENDIMENTO_PADRAO[0]?.inicio ?? "08:00", fim: HORARIOS_ATENDIMENTO_PADRAO[0]?.fim ?? "18:00" };

/**
 * Nova faixa depois da ÚLTIMA do dia (08–12 → sugere 13–17), sem passar da meia-noite. Sem uma hora
 * de folga, começa onde a anterior termina (encostar não é sobrepor). Dia cheio até 24:00 → null.
 */
export function proximaFaixa(faixas: readonly FaixaHorario[]): FaixaHorario | null {
  const ultima = [...faixas].sort((a, b) => minutosDoDia(a.fim) - minutosDoDia(b.fim)).at(-1);
  if (!ultima) return FAIXA_PADRAO;
  const fimAnterior = minutosDoDia(ultima.fim);
  if (fimAnterior >= 24 * 60) return null;
  const inicio = fimAnterior + 60 <= 23 * 60 ? fimAnterior + 60 : fimAnterior;
  const fim = Math.min(inicio + 4 * 60, 24 * 60);
  const hora = (minutos: number) => `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
  return { inicio: hora(inicio), fim: hora(fim) };
}

const SIGLAS_DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/**
 * Horários em poucas linhas: dias SEGUIDOS com o mesmo horário viram um intervalo.
 * Padrão → ["Seg–Sex · 08:00–18:00", "Sáb–Dom · Fechado"].
 */
export function resumoHorarios(periodos: readonly PeriodoAtendimento[]): string[] {
  const grade = gradeDosPeriodos(periodos);
  const textoDoDia = (dia: number) => {
    const faixas = grade[dia] ?? [];
    if (faixas.length === 0) return "Fechado";
    return faixas.map((faixa) => (faixa.inicio === "00:00" && faixa.fim === "24:00" ? "24 horas" : `${faixa.inicio}–${faixa.fim}`)).join(", ");
  };
  const grupos: Array<{ inicio: number; fim: number; texto: string }> = [];
  for (const { dia } of DIAS) {
    const texto = textoDoDia(dia);
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.texto === texto && ultimo.fim === dia - 1) ultimo.fim = dia;
    else grupos.push({ inicio: dia, fim: dia, texto });
  }
  return grupos.map(({ inicio, fim, texto }) => {
    const dias = inicio === fim ? SIGLAS_DIAS[inicio - 1] : `${SIGLAS_DIAS[inicio - 1]}–${SIGLAS_DIAS[fim - 1]}`;
    return `${dias} · ${texto}`;
  });
}

/** Erro curto por dia (o servidor confere de novo). null = dia válido. */
export function erroDoDia(dia: number, faixas: readonly FaixaHorario[]): string | null {
  const periodos = faixas.map((faixa) => ({ diaSemana: dia, ...faixa }));
  if (periodos.some((periodo) => !periodoAtendimentoSchema.safeParse(periodo).success)) return "Início antes do fim";
  if (periodosSeSobrepoem(periodos)) return "Horários sobrepostos";
  return null;
}

export function gradeTemErro(grade: GradeSemanal): boolean {
  return DIAS.some(({ dia }) => erroDoDia(dia, grade[dia] ?? []) !== null);
}

/* ---------- Etapas (ordem das DEPENDÊNCIAS: a base é a referência de tudo) ---------- */

export const ETAPAS = [
  { id: "base", rotulo: "Base" },
  { id: "atividades", rotulo: "Atividades" },
  { id: "areas", rotulo: "Área" },
  { id: "resumo", rotulo: "Resumo" },
] as const;

export type Etapa = (typeof ETAPAS)[number]["id"];
export type EstadoEtapa = "concluida" | "atual" | "pendente";

interface PerfilParaEtapas {
  pendencias: readonly PendenciaPerfilProfissional[];
  situacao: SituacaoPerfilProfissional;
}

export function etapaConcluida(perfil: PerfilParaEtapas, etapa: Etapa): boolean {
  if (etapa === "base") return !perfil.pendencias.includes("base");
  if (etapa === "atividades") return !perfil.pendencias.includes("atividade");
  if (etapa === "areas") return !perfil.pendencias.includes("area");
  return perfil.situacao === "ativo";
}

export function estadoEtapa(perfil: PerfilParaEtapas, etapa: Etapa, atual: Etapa): EstadoEtapa {
  if (etapa === atual) return "atual";
  return etapaConcluida(perfil, etapa) ? "concluida" : "pendente";
}

/** Abre na primeira etapa que ainda falta; tudo pronto = Resumo. */
export function etapaInicial(perfil: PerfilParaEtapas): Etapa {
  return ETAPAS.find((etapa) => etapa.id !== "resumo" && !etapaConcluida(perfil, etapa.id))?.id ?? "resumo";
}

export function etapaVizinha(etapa: Etapa, passo: 1 | -1): Etapa | null {
  const indice = ETAPAS.findIndex((item) => item.id === etapa) + passo;
  return ETAPAS[indice]?.id ?? null;
}

/* ---------- Base ---------- */

/**
 * O formulário tem um endereço materialmente DIFERENTE do salvo? (Mesma regra que derruba o ponto no
 * servidor; CEP comparado só pelos dígitos.) Enquanto for verdade, o mapa não mostra nem confirma ponto.
 */
export function enderecoDoFormularioMudou(base: BaseProfissionalDoDono | null, formulario: { cep: string } & Record<string, string | null | undefined>): boolean {
  if (!base) return false;
  return alteracaoInvalidaLocalizacao(base, { ...formulario, cep: formulario.cep.replace(/\D/g, "") });
}

/* ---------- Atividades ---------- */

export function servicosDoCatalogo(catalogo: CatalogoServicos): ServicoCatalogo[] {
  return catalogo.categorias.flatMap((categoria) => categoria.servicos);
}

/** Atividades que ainda podem entrar: nenhuma se já há 3; nunca uma repetida. */
export function atividadesParaAdicionar(catalogo: CatalogoServicos, atividades: readonly AtividadeDoPerfil[]): ServicoCatalogo[] {
  if (atividades.length >= LIMITES_PERFIL_PROFISSIONAL.maximoServicos) return [];
  const jaTem = new Set(atividades.map((atividade) => atividade.atividadeId));
  return servicosDoCatalogo(catalogo).filter((servico) => !jaTem.has(servico.id));
}

/**
 * Clicar numa opção de atributo. Seleção ÚNICA troca a opção do atributo; MÚLTIPLA liga/desliga.
 * Quem diz o tipo é o catálogo — a tela não conhece atividade nenhuma pelo nome.
 */
export function alternarOpcao(selecionadas: readonly string[], opcaoId: string, atributo: { tipoSelecao: "unica" | "multipla"; opcoes: ReadonlyArray<{ id: string }> }): string[] {
  if (selecionadas.includes(opcaoId)) return selecionadas.filter((id) => id !== opcaoId);
  if (atributo.tipoSelecao === "multipla") return [...selecionadas, opcaoId];
  const doAtributo = new Set(atributo.opcoes.map((opcao) => opcao.id));
  return [...selecionadas.filter((id) => !doAtributo.has(id)), opcaoId];
}

/**
 * Itens OBRIGATÓRIOS da atividade ainda sem nenhuma opção marcada (ex.: Veículo do Entregador). Quem
 * diz o que é obrigatório é o catálogo; o servidor confere de novo ao adicionar e ao salvar.
 */
export function atributosSemEscolha(servico: ServicoCatalogo | undefined, opcaoIds: readonly string[]): ServicoCatalogo["atributos"] {
  if (!servico) return [];
  return servico.atributos.filter((atributo) => atributo.obrigatorio && atributo.opcoes.length > 0 && !atributo.opcoes.some((opcao) => opcaoIds.includes(opcao.id)));
}

/** Nomes do que a atividade marcou (especialidades e opções), na ordem do catálogo. */
export function resumoEscolhas(atividade: Pick<AtividadeDoPerfil, "especialidadeIds" | "opcaoIds">, servico: ServicoCatalogo | undefined): string[] {
  if (!servico) return [];
  const especialidades = servico.especialidades.filter((item) => atividade.especialidadeIds.includes(item.id)).map((item) => item.nome);
  const opcoes = servico.atributos.flatMap((atributo) => atributo.opcoes).filter((item) => atividade.opcaoIds.includes(item.id)).map((item) => item.nome);
  return [...especialidades, ...opcoes];
}

export function alternarId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/* ---------- Situação ---------- */

export const ROTULO_SITUACAO: Record<SituacaoPerfilProfissional, string> = {
  ativo: "Ativo",
  incompleto: "Incompleto",
  inativo: "Pausado",
};

const ROTULO_PENDENCIA: Record<PendenciaPerfilProfissional, string> = {
  atividade: "uma atividade",
  base: "sua base no mapa",
  area: "uma área de atuação",
};

export function textoPendencias(pendencias: readonly PendenciaPerfilProfissional[]): string | null {
  if (pendencias.length === 0) return null;
  return `Falta: ${pendencias.map((pendencia) => ROTULO_PENDENCIA[pendencia]).join(", ")}.`;
}

/* ---------- Áreas ---------- */

export const metrosParaKm = (metros: number) => Math.round(metros / 100) / 10;
export const kmParaMetros = (km: number) => Math.round(km * 1000);

export function descricaoArea(area: AreaAtuacaoDoDono): string {
  if (area.modalidade === "raio") return `Até ${String(metrosParaKm(area.raioMetros ?? 0)).replace(".", ",")} km da base`;
  if (area.modalidade === "municipio") return area.municipio ? `${area.municipio.nome} – ${area.municipio.uf}` : "Município";
  return "Área desenhada";
}

export function aplicacaoArea(area: AreaAtuacaoDoDono, atividades: readonly AtividadeDoPerfil[]): string {
  if (area.todasAtividades) return "Todas as atividades";
  const nomes = atividades.filter((atividade) => area.atividadeIds.includes(atividade.id)).map((atividade) => atividade.nome);
  return nomes.length > 0 ? nomes.join(", ") : "Nenhuma atividade";
}

export function podeAtivarMaisAreas(areas: readonly AreaAtuacaoDoDono[]): boolean {
  return areas.filter((area) => area.ativa).length < LIMITES_PERFIL_PROFISSIONAL.maximoAreas;
}
