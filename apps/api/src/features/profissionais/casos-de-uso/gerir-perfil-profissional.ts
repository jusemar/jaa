import type { Banco } from "@jaa/banco";
import {
  HORARIOS_ATENDIMENTO_PADRAO,
  LIMITES_PERFIL_PROFISSIONAL,
  alteracaoInvalidaLocalizacao,
  areaAtuacaoEntradaSchema,
  configuracaoServicoDoPerfilEntradaSchema,
  editarAreaAtuacaoEntradaSchema,
  confirmarPontoBaseProfissionalEntradaSchema,
  detalhesServicoDoPerfilEntradaSchema,
  horariosAtendimentoEntradaSchema,
  preferenciasPerfilProfissionalEntradaSchema,
  salvarBaseProfissionalEntradaSchema,
  servicoDoPerfilEntradaSchema,
} from "@jaa/contratos";
import { servicoAtivo } from "../repositorios/repositorio-taxonomia.js";
import {
  atualizarPerfil,
  buscarAreaDoPerfil,
  buscarBase,
  buscarPerfilPorIdentidade,
  buscarServicoDoPerfil,
  confirmarPontoDaBase,
  contarAreasAtivas,
  contarEspecialidadesDoServico,
  contarServicosDoPerfil,
  contarServicosDoPerfilEntre,
  definirAtivaArea,
  definirPoligonosArea,
  definirEscolhasDoServico,
  definirPermiteAgendamentoDoServico,
  definirRaioArea,
  gravarBase,
  identidadeEhPessoal,
  inserirArea,
  inserirPerfilSeAusente,
  inserirServicoDoPerfil,
  listarServicosDoPerfilComEscolhas,
  municipioAtivoExiste,
  opcoesDoServico,
  perfilJaTemServico,
  poligonosFormamAreaValida,
  removerArea,
  removerServicoDoPerfil,
  substituirAtividadesDaArea,
  substituirPeriodosDoServico,
  travarPerfilPorIdentidade,
  type Executor,
  type PerfilRegistro,
} from "../repositorios/repositorio-perfis-profissionais.js";

/*
 * PERFIL PROFISSIONAL — regras do servidor (o cliente nunca é autoridade).
 *
 * Toda operação recebe a IDENTIDADE DA SESSÃO (pessoal) e resolve o perfil dela: não existe parâmetro
 * que aponte para o perfil de outra pessoa. Entradas passam pelos contratos Zod e as regras que
 * contam (3 serviços, 5 áreas) rodam em transação com o perfil travado. O banco é a segunda linha de
 * defesa (FKs compostas, CHECKs de modalidade e de geometria).
 */

type DadosInvalidos = { tipo: "dados-invalidos"; mensagem: string };
type SemPerfil = { tipo: "perfil-nao-encontrado" };

function invalido(erro: { issues: Array<{ message: string }> }): DadosInvalidos {
  return { tipo: "dados-invalidos", mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
}

/* ---------- Perfil ---------- */

export type ResultadoObterPerfil = { tipo: "ok"; perfil: PerfilRegistro } | { tipo: "identidade-nao-pessoal" };

/** Ativar a capacidade profissional da PRÓPRIA identidade pessoal. Idempotente; não cria conta. */
export async function obterOuCriarPerfilProfissional(banco: Banco, identidadeId: string): Promise<ResultadoObterPerfil> {
  if (!(await identidadeEhPessoal(banco, identidadeId))) return { tipo: "identidade-nao-pessoal" };
  await inserirPerfilSeAusente(banco, identidadeId);
  const perfil = await buscarPerfilPorIdentidade(banco, identidadeId);
  if (!perfil) throw new Error("Perfil profissional não encontrado após criação.");
  return { tipo: "ok", perfil };
}

export async function definirPreferenciasPerfil(banco: Banco, identidadeId: string, entrada: unknown): Promise<{ tipo: "salvo" } | SemPerfil | DadosInvalidos> {
  const dados = preferenciasPerfilProfissionalEntradaSchema.safeParse(entrada);
  if (!dados.success) return invalido(dados.error);
  const perfil = await buscarPerfilPorIdentidade(banco, identidadeId);
  if (!perfil) return { tipo: "perfil-nao-encontrado" };
  const { recebeOportunidadesOutrasRegioes, fusoHorario } = dados.data;
  await atualizarPerfil(banco, perfil.id, {
    ...(recebeOportunidadesOutrasRegioes === undefined ? {} : { recebeOportunidadesOutrasRegioes }),
    ...(fusoHorario === undefined ? {} : { fusoHorario }),
  });
  return { tipo: "salvo" };
}

/* ---------- Base ---------- */

export async function salvarBaseProfissional(banco: Banco, identidadeId: string, entrada: unknown): Promise<{ tipo: "salva"; pontoMantido: boolean } | SemPerfil | DadosInvalidos> {
  const dados = salvarBaseProfissionalEntradaSchema.safeParse(entrada);
  if (!dados.success) return invalido(dados.error);
  return banco.transaction(async (transacao) => {
    const perfil = await travarPerfilPorIdentidade(transacao, identidadeId);
    if (!perfil) return { tipo: "perfil-nao-encontrado" };
    const atual = await buscarBase(transacao, perfil.id);
    // Mesma regra do endereço do cliente: mudou algo estrutural, a confirmação do ponto deixa de valer.
    const pontoMantido = atual !== null && atual.ponto !== null && !alteracaoInvalidaLocalizacao(atual, dados.data);
    await gravarBase(transacao, perfil.id, dados.data, pontoMantido);
    return { tipo: "salva", pontoMantido };
  });
}

export async function confirmarPontoBaseProfissional(
  banco: Banco,
  identidadeId: string,
  entrada: unknown,
): Promise<{ tipo: "confirmado" } | { tipo: "base-nao-cadastrada" } | { tipo: "base-alterada" } | SemPerfil | DadosInvalidos> {
  const dados = confirmarPontoBaseProfissionalEntradaSchema.safeParse(entrada);
  if (!dados.success) return invalido(dados.error);
  const perfil = await buscarPerfilPorIdentidade(banco, identidadeId);
  if (!perfil) return { tipo: "perfil-nao-encontrado" };
  const { latitude, longitude, baseAtualizadaEm } = dados.data;
  const versao = baseAtualizadaEm ? new Date(baseAtualizadaEm) : undefined;
  if (await confirmarPontoDaBase(banco, perfil.id, { latitude, longitude }, versao)) return { tipo: "confirmado" };
  // Não gravou: ou não há base, ou o endereço mudou depois do que a tela mostrava.
  return (await buscarBase(banco, perfil.id)) ? { tipo: "base-alterada" } : { tipo: "base-nao-cadastrada" };
}

/* ---------- Serviços ---------- */

type ErroEscolhas = { tipo: "especialidade-invalida" } | { tipo: "opcao-invalida" } | { tipo: "selecao-unica-violada" };

// Especialidades e opções precisam ser ATIVAS e do MESMO serviço; atributo de seleção única, uma opção.
async function validarEscolhas(banco: Executor, servicoId: string, especialidadeIds: string[], opcaoIds: string[]): Promise<ErroEscolhas | null> {
  if ((await contarEspecialidadesDoServico(banco, servicoId, especialidadeIds)) !== especialidadeIds.length) return { tipo: "especialidade-invalida" };
  const opcoes = await opcoesDoServico(banco, servicoId, opcaoIds);
  if (opcoes.length !== opcaoIds.length) return { tipo: "opcao-invalida" };
  const porAtributoUnico = new Map<string, number>();
  for (const opcao of opcoes) {
    if (opcao.tipoSelecao === "unica") porAtributoUnico.set(opcao.atributoId, (porAtributoUnico.get(opcao.atributoId) ?? 0) + 1);
  }
  return [...porAtributoUnico.values()].some((total) => total > 1) ? { tipo: "selecao-unica-violada" } : null;
}

export type ResultadoAdicionarServico =
  | { tipo: "adicionado"; servicoPerfilId: string }
  | SemPerfil
  | DadosInvalidos
  | { tipo: "limite-servicos"; maximo: number }
  | { tipo: "servico-nao-encontrado" }
  | { tipo: "servico-duplicado" }
  | ErroEscolhas;

export async function adicionarServicoAoPerfil(banco: Banco, identidadeId: string, entrada: unknown): Promise<ResultadoAdicionarServico> {
  const dados = servicoDoPerfilEntradaSchema.safeParse(entrada);
  if (!dados.success) return invalido(dados.error);
  const { servicoId, especialidadeIds, opcaoIds } = dados.data;

  return banco.transaction(async (transacao): Promise<ResultadoAdicionarServico> => {
    const perfil = await travarPerfilPorIdentidade(transacao, identidadeId);
    if (!perfil) return { tipo: "perfil-nao-encontrado" };
    if ((await contarServicosDoPerfil(transacao, perfil.id)) >= LIMITES_PERFIL_PROFISSIONAL.maximoServicos) {
      return { tipo: "limite-servicos", maximo: LIMITES_PERFIL_PROFISSIONAL.maximoServicos };
    }
    if (!(await servicoAtivo(transacao, servicoId))) return { tipo: "servico-nao-encontrado" };
    if (await perfilJaTemServico(transacao, perfil.id, servicoId)) return { tipo: "servico-duplicado" };
    const erro = await validarEscolhas(transacao, servicoId, especialidadeIds, opcaoIds);
    if (erro) return erro;

    const servicoPerfilId = await inserirServicoDoPerfil(transacao, perfil.id, servicoId);
    await definirEscolhasDoServico(transacao, { id: servicoPerfilId, servicoId }, especialidadeIds, opcaoIds);
    // Todo serviço nasce com horário de atendimento (seg–sex 08:00–18:00); o profissional ajusta depois.
    await substituirPeriodosDoServico(transacao, servicoPerfilId, HORARIOS_ATENDIMENTO_PADRAO);
    return { tipo: "adicionado", servicoPerfilId };
  });
}

export async function atualizarDetalhesServicoDoPerfil(
  banco: Banco,
  identidadeId: string,
  servicoPerfilId: string,
  entrada: unknown,
): Promise<{ tipo: "atualizado" } | SemPerfil | DadosInvalidos | { tipo: "servico-nao-encontrado" } | ErroEscolhas> {
  const dados = detalhesServicoDoPerfilEntradaSchema.safeParse(entrada);
  if (!dados.success) return invalido(dados.error);
  return banco.transaction(async (transacao) => {
    const perfil = await travarPerfilPorIdentidade(transacao, identidadeId);
    if (!perfil) return { tipo: "perfil-nao-encontrado" };
    const servico = await buscarServicoDoPerfil(transacao, perfil.id, servicoPerfilId);
    if (!servico) return { tipo: "servico-nao-encontrado" };
    const erro = await validarEscolhas(transacao, servico.servicoId, dados.data.especialidadeIds, dados.data.opcaoIds);
    if (erro) return erro;
    await definirEscolhasDoServico(transacao, servico, dados.data.especialidadeIds, dados.data.opcaoIds);
    return { tipo: "atualizado" };
  });
}

export async function removerServicoDoPerfilProfissional(banco: Banco, identidadeId: string, servicoPerfilId: string): Promise<{ tipo: "removido" } | SemPerfil | { tipo: "servico-nao-encontrado" }> {
  const perfil = await buscarPerfilPorIdentidade(banco, identidadeId);
  if (!perfil) return { tipo: "perfil-nao-encontrado" };
  // Áreas restritas a este serviço perdem o vínculo (cascata) e passam a não cobrir nada — nunca "tudo".
  return (await removerServicoDoPerfil(banco, perfil.id, servicoPerfilId)) ? { tipo: "removido" } : { tipo: "servico-nao-encontrado" };
}

/**
 * HORÁRIOS DE ATENDIMENTO do serviço: substitui a grade semanal inteira (lista vazia = não atende).
 * É daqui que sai a disponibilidade — para qualquer serviço, sem classificação por tipo.
 */
export async function definirHorariosAtendimentoServico(
  banco: Banco,
  identidadeId: string,
  servicoPerfilId: string,
  entrada: unknown,
): Promise<{ tipo: "definidos" } | SemPerfil | DadosInvalidos | { tipo: "servico-nao-encontrado" }> {
  const dados = horariosAtendimentoEntradaSchema.safeParse(entrada);
  if (!dados.success) return invalido(dados.error);
  return banco.transaction(async (transacao) => {
    const perfil = await travarPerfilPorIdentidade(transacao, identidadeId);
    if (!perfil) return { tipo: "perfil-nao-encontrado" };
    if (!(await buscarServicoDoPerfil(transacao, perfil.id, servicoPerfilId))) return { tipo: "servico-nao-encontrado" };
    await substituirPeriodosDoServico(transacao, servicoPerfilId, dados.data.periodos);
    return { tipo: "definidos" };
  });
}

/** "Permitir agendamento" do serviço (Agenda futura). Não cria reserva nem horário reservável. */
export async function definirConfiguracaoServico(
  banco: Banco,
  identidadeId: string,
  servicoPerfilId: string,
  entrada: unknown,
): Promise<{ tipo: "salva" } | SemPerfil | DadosInvalidos | { tipo: "servico-nao-encontrado" }> {
  const dados = configuracaoServicoDoPerfilEntradaSchema.safeParse(entrada);
  if (!dados.success) return invalido(dados.error);
  const perfil = await buscarPerfilPorIdentidade(banco, identidadeId);
  if (!perfil) return { tipo: "perfil-nao-encontrado" };
  if (!(await buscarServicoDoPerfil(banco, perfil.id, servicoPerfilId))) return { tipo: "servico-nao-encontrado" };
  await definirPermiteAgendamentoDoServico(banco, servicoPerfilId, dados.data.permiteAgendamento);
  return { tipo: "salva" };
}

/* ---------- Áreas ---------- */

export type ResultadoAdicionarArea =
  | { tipo: "adicionada"; areaId: string }
  | SemPerfil
  | DadosInvalidos
  | { tipo: "limite-areas"; maximo: number }
  | { tipo: "base-sem-ponto" }
  | { tipo: "geometria-invalida" }
  | { tipo: "municipio-nao-encontrado" }
  | { tipo: "servico-de-outro-perfil" };

export async function adicionarAreaAtuacao(banco: Banco, identidadeId: string, entrada: unknown): Promise<ResultadoAdicionarArea> {
  const dados = areaAtuacaoEntradaSchema.safeParse(entrada);
  if (!dados.success) return invalido(dados.error);
  const area = dados.data;

  return banco.transaction(async (transacao): Promise<ResultadoAdicionarArea> => {
    const perfil = await travarPerfilPorIdentidade(transacao, identidadeId);
    if (!perfil) return { tipo: "perfil-nao-encontrado" };
    // O limite é de áreas ATIVAS (toda área nasce ativa); desativadas não ocupam vaga.
    if ((await contarAreasAtivas(transacao, perfil.id)) >= LIMITES_PERFIL_PROFISSIONAL.maximoAreas) {
      return { tipo: "limite-areas", maximo: LIMITES_PERFIL_PROFISSIONAL.maximoAreas };
    }
    // Serviços vinculados precisam ser DESTE perfil (o banco também exige, por FK composta).
    if ((await contarServicosDoPerfilEntre(transacao, perfil.id, area.servicoPerfilIds)) !== area.servicoPerfilIds.length) {
      return { tipo: "servico-de-outro-perfil" };
    }
    if (area.modalidade === "raio") {
      // O raio parte da BASE: sem ponto confirmado não há de onde medir.
      const base = await buscarBase(transacao, perfil.id);
      if (!base?.ponto) return { tipo: "base-sem-ponto" };
    }
    if (area.modalidade === "poligono" && !(await poligonosFormamAreaValida(transacao, area.poligonos))) return { tipo: "geometria-invalida" };
    if (area.modalidade === "municipio" && !(await municipioAtivoExiste(transacao, area.codigoIbge))) return { tipo: "municipio-nao-encontrado" };

    return { tipo: "adicionada", areaId: await inserirArea(transacao, perfil.id, area) };
  });
}

/**
 * Desativar guarda a área (pode voltar depois) e libera vaga; reativar respeita o limite de ativas.
 */
export async function definirAreaAtiva(
  banco: Banco,
  identidadeId: string,
  areaId: string,
  ativa: boolean,
): Promise<{ tipo: "definida" } | SemPerfil | { tipo: "area-nao-encontrada" } | { tipo: "limite-areas"; maximo: number }> {
  return banco.transaction(async (transacao) => {
    const perfil = await travarPerfilPorIdentidade(transacao, identidadeId);
    if (!perfil) return { tipo: "perfil-nao-encontrado" };
    const area = await buscarAreaDoPerfil(transacao, perfil.id, areaId);
    if (!area) return { tipo: "area-nao-encontrada" };
    if (ativa && !area.ativa && (await contarAreasAtivas(transacao, perfil.id)) >= LIMITES_PERFIL_PROFISSIONAL.maximoAreas) {
      return { tipo: "limite-areas", maximo: LIMITES_PERFIL_PROFISSIONAL.maximoAreas };
    }
    await definirAtivaArea(transacao, area.id, ativa);
    return { tipo: "definida" };
  });
}

export async function removerAreaAtuacao(banco: Banco, identidadeId: string, areaId: string): Promise<{ tipo: "removida" } | SemPerfil | { tipo: "area-nao-encontrada" }> {
  const perfil = await buscarPerfilPorIdentidade(banco, identidadeId);
  if (!perfil) return { tipo: "perfil-nao-encontrado" };
  return (await removerArea(banco, perfil.id, areaId)) ? { tipo: "removida" } : { tipo: "area-nao-encontrada" };
}

/**
 * EDITAR uma área: ligar/desligar (respeitando o limite de ATIVAS), mudar o raio (só área de raio),
 * trocar o desenho (só área desenhada, validado pelo PostGIS como na criação) e trocar a abrangência
 * (todas as atividades ou só algumas — sempre do MESMO perfil). A área continua a MESMA (mesmo id).
 */
export async function editarAreaAtuacao(
  banco: Banco,
  identidadeId: string,
  areaId: string,
  entrada: unknown,
): Promise<
  | { tipo: "editada" }
  | SemPerfil
  | DadosInvalidos
  | { tipo: "area-nao-encontrada" }
  | { tipo: "limite-areas"; maximo: number }
  | { tipo: "servico-de-outro-perfil" }
  | { tipo: "geometria-invalida" }
> {
  const dados = editarAreaAtuacaoEntradaSchema.safeParse(entrada);
  if (!dados.success) return invalido(dados.error);
  const { ativa, raioMetros, poligonos, servicoPerfilIds } = dados.data;
  return banco.transaction(async (transacao) => {
    const perfil = await travarPerfilPorIdentidade(transacao, identidadeId);
    if (!perfil) return { tipo: "perfil-nao-encontrado" };
    const area = await buscarAreaDoPerfil(transacao, perfil.id, areaId);
    if (!area) return { tipo: "area-nao-encontrada" };
    if (raioMetros !== undefined && area.modalidade !== "raio") return { tipo: "dados-invalidos", mensagem: "Só área por raio tem raio." };
    if (poligonos !== undefined && area.modalidade !== "poligono") return { tipo: "dados-invalidos", mensagem: "Só área desenhada tem desenho." };
    if (poligonos !== undefined && !(await poligonosFormamAreaValida(transacao, poligonos))) return { tipo: "geometria-invalida" };
    if (servicoPerfilIds && (await contarServicosDoPerfilEntre(transacao, perfil.id, servicoPerfilIds)) !== servicoPerfilIds.length) {
      return { tipo: "servico-de-outro-perfil" };
    }
    if (ativa === true && !area.ativa && (await contarAreasAtivas(transacao, perfil.id)) >= LIMITES_PERFIL_PROFISSIONAL.maximoAreas) {
      return { tipo: "limite-areas", maximo: LIMITES_PERFIL_PROFISSIONAL.maximoAreas };
    }
    if (ativa !== undefined) await definirAtivaArea(transacao, area.id, ativa);
    if (raioMetros !== undefined) await definirRaioArea(transacao, area.id, raioMetros);
    if (poligonos !== undefined) await definirPoligonosArea(transacao, area.id, poligonos);
    if (servicoPerfilIds) await substituirAtividadesDaArea(transacao, perfil.id, area.id, servicoPerfilIds);
    return { tipo: "editada" };
  });
}

/* ---------- Ativação ---------- */

export type PendenciaAtivacao = "base" | "atividade" | "area";

/**
 * O que falta para o perfil ser UTILIZÁVEL: base com ponto confirmado, ao menos uma atividade e uma
 * área ativa. (A permissão de localização do aplicativo será exigida pelo cliente móvel.)
 */
export async function pendenciasDoPerfil(banco: Executor, perfilId: string): Promise<PendenciaAtivacao[]> {
  const [base, atividades, areas] = await Promise.all([buscarBase(banco, perfilId), contarServicosDoPerfil(banco, perfilId), contarAreasAtivas(banco, perfilId)]);
  const pendencias: PendenciaAtivacao[] = [];
  if (!base?.ponto) pendencias.push("base");
  if (atividades === 0) pendencias.push("atividade");
  if (areas === 0) pendencias.push("area");
  return pendencias;
}

/**
 * Ativar exige base com ponto confirmado, ao menos um serviço e uma área ativa. (A permissão de
 * localização do aplicativo será exigida pelo cliente móvel; não é dado guardado aqui.)
 */
export async function ativarPerfilProfissional(banco: Banco, identidadeId: string): Promise<{ tipo: "ativado" } | SemPerfil | { tipo: "requisitos-pendentes"; pendencias: PendenciaAtivacao[] }> {
  return banco.transaction(async (transacao) => {
    const perfil = await travarPerfilPorIdentidade(transacao, identidadeId);
    if (!perfil) return { tipo: "perfil-nao-encontrado" };
    const pendencias = await pendenciasDoPerfil(transacao, perfil.id);
    if (pendencias.length > 0) return { tipo: "requisitos-pendentes", pendencias };
    if (!perfil.ativo) await atualizarPerfil(transacao, perfil.id, { ativo: true, ativadoEm: new Date() });
    return { tipo: "ativado" };
  });
}

export async function desativarPerfilProfissional(banco: Banco, identidadeId: string): Promise<{ tipo: "desativado" } | SemPerfil> {
  const perfil = await buscarPerfilPorIdentidade(banco, identidadeId);
  if (!perfil) return { tipo: "perfil-nao-encontrado" };
  await atualizarPerfil(banco, perfil.id, { ativo: false });
  return { tipo: "desativado" };
}

/* ---------- Leitura do DONO (privada) ---------- */

/**
 * Tudo o que o PRÓPRIO profissional pode ver, inclusive base e coordenada. Nunca serializar isto para
 * terceiros: o que é público está em `profissionalEncontradoSchema`.
 */
export async function lerPerfilProfissionalDoDono(banco: Banco, identidadeId: string) {
  const perfil = await buscarPerfilPorIdentidade(banco, identidadeId);
  if (!perfil) return null;
  const [base, servicos] = await Promise.all([buscarBase(banco, perfil.id), listarServicosDoPerfilComEscolhas(banco, perfil.id)]);
  return { perfil, base, servicos };
}
