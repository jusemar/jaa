import type { Banco } from "@jaa/banco";
import { MAXIMO_GRUPOS_POR_PRODUTO, MAXIMO_OPCOES_POR_GRUPO, type DiaSemana, type DisponibilidadeOpcao, type ProgramacaoSemanalGrupo } from "@jaa/contratos";
import { autorizarEmpresa, type PermissaoEmpresa } from "../../empresas/lib/autorizacao-empresas.js";
import { buscarProdutoDaEmpresa } from "../repositorios/repositorio-produtos.js";
import {
  ativarProgramacaoSemanalDoGrupo,
  atualizarGrupo,
  atualizarOpcao,
  buscarGrupoDoProduto,
  buscarOpcaoDoGrupo,
  contarGruposDoProduto,
  contarOpcoesDoGrupo,
  definirOpcoesDoDia,
  definirProgramacaoSemanalDoGrupo,
  inserirGrupo,
  inserirOpcao,
  listarGruposDoProduto,
  listarProgramacaoDoGrupo,
  removerGrupo,
  removerOpcao,
  type GrupoComOpcoes,
  type GrupoRegistro,
  type OpcaoRegistro,
} from "../repositorios/repositorio-personalizacao.js";

/*
 * Administração dos GRUPOS DE OPÇÕES, independente de interface. A sequência é a mesma dos produtos:
 * conta da sessão → permissão na empresa (camada central) → produto escopado por essa empresa →
 * grupo escopado por esse produto → opção escopada por esse grupo. Qualquer id de outra empresa
 * simplesmente "não é encontrado", sem revelar o que existe.
 *
 * Personalização é dado COMERCIAL do produto: reutiliza `ver-produtos`/`gerenciar-produtos` em vez de
 * inventar permissão nova. Um futuro atendente com apenas "alterar-disponibilidade-produto" poderá
 * ganhar acesso à disponibilidade da OPÇÃO quando isso for decidido.
 */

type SemAcesso = { tipo: "empresa-nao-encontrada" };
type ProdutoAusente = { tipo: "produto-nao-encontrado" };
type GrupoAusente = { tipo: "grupo-nao-encontrado" };
type OpcaoAusente = { tipo: "opcao-nao-encontrada" };
type LimiteGrupos = { tipo: "limite-de-grupos" };
type LimiteOpcoes = { tipo: "limite-de-opcoes" };

async function temPermissao(banco: Banco, usuarioId: string, empresaId: string, permissao: PermissaoEmpresa) {
  return (await autorizarEmpresa(banco, usuarioId, empresaId, permissao)) !== null;
}

/** Autoriza a empresa e confirma que o produto é dela — base de toda operação de personalização. */
async function alcancarProduto(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  permissao: PermissaoEmpresa,
): Promise<{ tipo: "ok" } | SemAcesso | ProdutoAusente> {
  if (!(await temPermissao(banco, usuarioId, empresaId, permissao))) return { tipo: "empresa-nao-encontrada" };
  return (await buscarProdutoDaEmpresa(banco, empresaId, produtoId)) ? { tipo: "ok" } : { tipo: "produto-nao-encontrado" };
}

export async function listarGruposAdministrados(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
): Promise<{ tipo: "lista"; grupos: GrupoComOpcoes[] } | SemAcesso | ProdutoAusente> {
  const alcance = await alcancarProduto(banco, usuarioId, empresaId, produtoId, "ver-produtos");
  if (alcance.tipo !== "ok") return alcance;
  return { tipo: "lista", grupos: await listarGruposDoProduto(banco, empresaId, produtoId) };
}

export async function criarGrupoOpcoes(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  entrada: { nome: string; instrucao?: string | null | undefined; minimoEscolhas: number; maximoEscolhas: number; posicao?: number | undefined },
): Promise<{ tipo: "criado"; grupo: GrupoRegistro } | SemAcesso | ProdutoAusente | LimiteGrupos> {
  const alcance = await alcancarProduto(banco, usuarioId, empresaId, produtoId, "gerenciar-produtos");
  if (alcance.tipo !== "ok") return alcance;
  if ((await contarGruposDoProduto(banco, empresaId, produtoId)) >= MAXIMO_GRUPOS_POR_PRODUTO) return { tipo: "limite-de-grupos" };

  const grupo = await inserirGrupo(banco, {
    empresaId,
    produtoId,
    nome: entrada.nome,
    instrucao: entrada.instrucao ?? null,
    minimoEscolhas: entrada.minimoEscolhas,
    maximoEscolhas: entrada.maximoEscolhas,
    posicao: entrada.posicao,
  });
  return { tipo: "criado", grupo };
}

export async function atualizarGrupoOpcoes(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  grupoId: string,
  entrada: { nome?: string | undefined; instrucao?: string | null | undefined; minimoEscolhas?: number | undefined; maximoEscolhas?: number | undefined; posicao?: number | undefined },
): Promise<{ tipo: "atualizado"; grupo: GrupoRegistro } | SemAcesso | ProdutoAusente | GrupoAusente> {
  const alcance = await alcancarProduto(banco, usuarioId, empresaId, produtoId, "gerenciar-produtos");
  if (alcance.tipo !== "ok") return alcance;
  const atual = await buscarGrupoDoProduto(banco, empresaId, produtoId, grupoId);
  if (!atual) return { tipo: "grupo-nao-encontrado" };

  /*
   * Coerência da faixa com o que JÁ está gravado: alterar só o mínimo não pode deixar min > max.
   * O CHECK do banco é a garantia final; aqui a recusa vira um erro compreensível.
   */
  const minimo = entrada.minimoEscolhas ?? atual.minimoEscolhas;
  const maximo = entrada.maximoEscolhas ?? atual.maximoEscolhas;
  if (minimo > maximo) return { tipo: "grupo-nao-encontrado" };

  const grupo = await atualizarGrupo(banco, empresaId, grupoId, entrada);
  return grupo ? { tipo: "atualizado", grupo } : { tipo: "grupo-nao-encontrado" };
}

export async function excluirGrupoOpcoes(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  grupoId: string,
): Promise<{ tipo: "excluido" } | SemAcesso | ProdutoAusente | GrupoAusente> {
  const alcance = await alcancarProduto(banco, usuarioId, empresaId, produtoId, "gerenciar-produtos");
  if (alcance.tipo !== "ok") return alcance;
  if (!(await buscarGrupoDoProduto(banco, empresaId, produtoId, grupoId))) return { tipo: "grupo-nao-encontrado" };
  // As opções caem por cascata. Pedidos antigos seguem intactos: as escolhas deles são snapshot.
  return (await removerGrupo(banco, empresaId, grupoId)) ? { tipo: "excluido" } : { tipo: "grupo-nao-encontrado" };
}

export async function criarOpcao(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  grupoId: string,
  entrada: { nome: string; precoAdicionalCentavos: number; disponibilidade: DisponibilidadeOpcao; posicao?: number | undefined },
): Promise<{ tipo: "criada"; opcao: OpcaoRegistro } | SemAcesso | ProdutoAusente | GrupoAusente | LimiteOpcoes> {
  const alcance = await alcancarProduto(banco, usuarioId, empresaId, produtoId, "gerenciar-produtos");
  if (alcance.tipo !== "ok") return alcance;
  if (!(await buscarGrupoDoProduto(banco, empresaId, produtoId, grupoId))) return { tipo: "grupo-nao-encontrado" };
  if ((await contarOpcoesDoGrupo(banco, empresaId, grupoId)) >= MAXIMO_OPCOES_POR_GRUPO) return { tipo: "limite-de-opcoes" };

  return { tipo: "criada", opcao: await inserirOpcao(banco, { empresaId, grupoId, ...entrada }) };
}

export async function atualizarOpcaoDoGrupo(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  grupoId: string,
  opcaoId: string,
  entrada: { nome?: string | undefined; precoAdicionalCentavos?: number | undefined; disponibilidade?: DisponibilidadeOpcao | undefined; posicao?: number | undefined },
): Promise<{ tipo: "atualizada"; opcao: OpcaoRegistro } | SemAcesso | ProdutoAusente | GrupoAusente | OpcaoAusente> {
  const alcance = await alcancarProduto(banco, usuarioId, empresaId, produtoId, "gerenciar-produtos");
  if (alcance.tipo !== "ok") return alcance;
  if (!(await buscarGrupoDoProduto(banco, empresaId, produtoId, grupoId))) return { tipo: "grupo-nao-encontrado" };
  if (!(await buscarOpcaoDoGrupo(banco, empresaId, grupoId, opcaoId))) return { tipo: "opcao-nao-encontrada" };

  const opcao = await atualizarOpcao(banco, empresaId, grupoId, opcaoId, entrada);
  return opcao ? { tipo: "atualizada", opcao } : { tipo: "opcao-nao-encontrada" };
}

export async function excluirOpcaoDoGrupo(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  grupoId: string,
  opcaoId: string,
): Promise<{ tipo: "excluida" } | SemAcesso | ProdutoAusente | GrupoAusente | OpcaoAusente> {
  const alcance = await alcancarProduto(banco, usuarioId, empresaId, produtoId, "gerenciar-produtos");
  if (alcance.tipo !== "ok") return alcance;
  if (!(await buscarGrupoDoProduto(banco, empresaId, produtoId, grupoId))) return { tipo: "grupo-nao-encontrado" };
  return (await removerOpcao(banco, empresaId, grupoId, opcaoId)) ? { tipo: "excluida" } : { tipo: "opcao-nao-encontrada" };
}

/*
 * PROGRAMAÇÃO SEMANAL de um grupo. Mesma sequência das demais operações: permissão na empresa →
 * produto da empresa → grupo do produto. A programação é dado comercial do produto, então usa
 * `ver-produtos`/`gerenciar-produtos`. Toda operação devolve a programação COMPLETA do grupo (os sete
 * dias), lida do banco depois de gravar — a tela nunca fica com um palpite local.
 */
type ResultadoProgramacao = { tipo: "programacao"; programacao: ProgramacaoSemanalGrupo } | SemAcesso | ProdutoAusente | GrupoAusente | OpcaoAusente;

async function programacaoDoGrupo(banco: Banco, empresaId: string, grupo: GrupoRegistro): Promise<ProgramacaoSemanalGrupo> {
  return { grupoId: grupo.id, programacaoSemanal: grupo.programacaoSemanal, dias: await listarProgramacaoDoGrupo(banco, empresaId, grupo.id) };
}

export async function consultarProgramacaoSemanal(banco: Banco, usuarioId: string, empresaId: string, produtoId: string, grupoId: string): Promise<ResultadoProgramacao> {
  const alcance = await alcancarProduto(banco, usuarioId, empresaId, produtoId, "ver-produtos");
  if (alcance.tipo !== "ok") return alcance;
  const grupo = await buscarGrupoDoProduto(banco, empresaId, produtoId, grupoId);
  if (!grupo) return { tipo: "grupo-nao-encontrado" };
  return { tipo: "programacao", programacao: await programacaoDoGrupo(banco, empresaId, grupo) };
}

/**
 * Liga ou desliga a programação. Ligar pela primeira vez preenche a semana com as opções do grupo
 * (nada some do cardápio); desligar NÃO apaga os dias; religar retoma o que estava configurado.
 */
export async function definirProgramacaoSemanal(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  grupoId: string,
  ativa: boolean,
): Promise<ResultadoProgramacao> {
  const alcance = await alcancarProduto(banco, usuarioId, empresaId, produtoId, "gerenciar-produtos");
  if (alcance.tipo !== "ok") return alcance;
  if (!(await buscarGrupoDoProduto(banco, empresaId, produtoId, grupoId))) return { tipo: "grupo-nao-encontrado" };

  const grupo = ativa ? await ativarProgramacaoSemanalDoGrupo(banco, empresaId, grupoId) : await definirProgramacaoSemanalDoGrupo(banco, empresaId, grupoId, false);
  if (!grupo) return { tipo: "grupo-nao-encontrado" };
  return { tipo: "programacao", programacao: await programacaoDoGrupo(banco, empresaId, grupo) };
}

/** Substitui as opções de UM dia. Opção de outro grupo (ou de outra empresa) não é encontrada. */
export async function definirOpcoesDoDiaDoGrupo(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  produtoId: string,
  grupoId: string,
  dia: DiaSemana,
  opcaoIds: readonly string[],
): Promise<ResultadoProgramacao> {
  const alcance = await alcancarProduto(banco, usuarioId, empresaId, produtoId, "gerenciar-produtos");
  if (alcance.tipo !== "ok") return alcance;
  if (!(await buscarGrupoDoProduto(banco, empresaId, produtoId, grupoId))) return { tipo: "grupo-nao-encontrado" };

  // O repositório confere de novo, dentro da transação, que TODAS as opções são deste grupo.
  if (!(await definirOpcoesDoDia(banco, empresaId, grupoId, dia, opcaoIds))) return { tipo: "opcao-nao-encontrada" };
  const grupo = await buscarGrupoDoProduto(banco, empresaId, produtoId, grupoId);
  if (!grupo) return { tipo: "grupo-nao-encontrado" };
  return { tipo: "programacao", programacao: await programacaoDoGrupo(banco, empresaId, grupo) };
}
