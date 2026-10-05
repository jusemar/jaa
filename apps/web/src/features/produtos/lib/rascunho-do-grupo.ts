import {
  MAXIMO_ESCOLHAS_POR_GRUPO,
  type AtualizarGrupoOpcoesEntrada,
  type AtualizarOpcaoEntrada,
  type CriarGrupoOpcoesEntrada,
  type CriarOpcaoEntrada,
  type GrupoOpcoesProduto,
} from "@jaa/contratos";
import { centavosParaCampo, interpretarPrecoDigitado } from "./precos.ts";

/*
 * RASCUNHO da aba "Opções e regras": o gestor edita nome, instrução, mínimo, máximo e as opções à
 * vontade, e só "Salvar grupo" grava. Aqui ficam as regras puras: o que mudou e quais gravações isso
 * exige. Quem chama a API é o editor.
 *
 * A API grava uma coisa por vez (o grupo, cada opção). O plano lista SÓ o que mudou, na ordem em que
 * será gravado, para o editor poder dizer com precisão o que ficou salvo se uma gravação falhar.
 */

export interface OpcaoEmRascunho {
  // Identidade da LINHA na tela (estável enquanto a janela está aberta), mesmo antes de existir no servidor.
  chave: string;
  // null = opção nova, ainda não gravada.
  id: string | null;
  nome: string;
  // Texto digitado, em reais ("2,50"). Vazio = sem acréscimo.
  acrescimo: string;
  ativa: boolean;
}

export interface RascunhoDoGrupo {
  nome: string;
  instrucao: string;
  minimo: string;
  maximo: string;
  opcoes: OpcaoEmRascunho[];
}

const textoDoAcrescimo = (centavos: number) => (centavos > 0 ? centavosParaCampo(centavos) : "");

export function rascunhoInicial(grupo: GrupoOpcoesProduto | null): RascunhoDoGrupo {
  if (!grupo) return { nome: "", instrucao: "", minimo: "0", maximo: "1", opcoes: [] };
  return {
    nome: grupo.nome,
    instrucao: grupo.instrucao ?? "",
    minimo: String(grupo.minimoEscolhas),
    maximo: String(grupo.maximoEscolhas),
    opcoes: grupo.opcoes.map((opcao) => ({ chave: opcao.id, id: opcao.id, nome: opcao.nome, acrescimo: textoDoAcrescimo(opcao.precoAdicionalCentavos), ativa: opcao.disponibilidade === "disponivel" })),
  };
}

/** Acréscimo digitado → centavos inteiros. Vazio ou zero = 0; texto inválido = null. Sem float. */
export function interpretarAcrescimo(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === "" || /^0+([.,]0{1,2})?$/.test(limpo)) return 0;
  return interpretarPrecoDigitado(limpo);
}

const inteiro = (texto: string): number | null => (/^\d+$/.test(texto.trim()) ? Number(texto.trim()) : null);

export interface PlanoDoGrupo {
  // Grupo novo: precisa ser criado antes de qualquer opção.
  criar: CriarGrupoOpcoesEntrada | null;
  // Grupo existente: só os campos que mudaram (null = nada mudou no grupo).
  grupo: AtualizarGrupoOpcoesEntrada | null;
  alteradas: Array<{ id: string; entrada: AtualizarOpcaoEntrada }>;
  novas: Array<{ chave: string; entrada: CriarOpcaoEntrada }>;
}

export type ResultadoDoPlano = { ok: true; plano: PlanoDoGrupo } | { ok: false; erro: string };

/** Valida o rascunho e devolve as gravações necessárias. Nada é gravado aqui. */
export function planejarGravacao(grupo: GrupoOpcoesProduto | null, rascunho: RascunhoDoGrupo): ResultadoDoPlano {
  const nome = rascunho.nome.trim();
  if (nome === "" || rascunho.opcoes.some((opcao) => opcao.nome.trim() === "")) return { ok: false, erro: "Preencha o nome do grupo e de todas as opções." };

  const minimo = inteiro(rascunho.minimo);
  const maximo = inteiro(rascunho.maximo);
  if (minimo === null || maximo === null || maximo < 1 || minimo > maximo) return { ok: false, erro: "O máximo deve ser pelo menos 1 e não pode ser menor que o mínimo." };
  if (maximo > MAXIMO_ESCOLHAS_POR_GRUPO) return { ok: false, erro: `O máximo de escolhas vai até ${MAXIMO_ESCOLHAS_POR_GRUPO}.` };

  const acrescimos = rascunho.opcoes.map((opcao) => interpretarAcrescimo(opcao.acrescimo));
  if (acrescimos.some((valor) => valor === null)) return { ok: false, erro: "Informe o acréscimo como 5,00 — ou deixe em branco para não mudar o preço." };

  const instrucao = rascunho.instrucao.trim() === "" ? null : rascunho.instrucao.trim();
  const plano: PlanoDoGrupo = { criar: null, grupo: null, alteradas: [], novas: [] };

  if (!grupo) plano.criar = { nome, instrucao, minimoEscolhas: minimo, maximoEscolhas: maximo };
  else {
    const mudancas: AtualizarGrupoOpcoesEntrada = {
      ...(nome !== grupo.nome ? { nome } : {}),
      ...(instrucao !== grupo.instrucao ? { instrucao } : {}),
      // Mínimo e máximo vão juntos: o servidor valida a faixa com os dois valores.
      ...(minimo !== grupo.minimoEscolhas || maximo !== grupo.maximoEscolhas ? { minimoEscolhas: minimo, maximoEscolhas: maximo } : {}),
    };
    if (Object.keys(mudancas).length > 0) plano.grupo = mudancas;
  }

  rascunho.opcoes.forEach((opcao, indice) => {
    const centavos = acrescimos[indice] ?? 0;
    const disponibilidade = opcao.ativa ? ("disponivel" as const) : ("indisponivel" as const);
    const salva = opcao.id ? grupo?.opcoes.find((item) => item.id === opcao.id) : undefined;
    if (!opcao.id || !salva) {
      plano.novas.push({ chave: opcao.chave, entrada: { nome: opcao.nome.trim(), precoAdicionalCentavos: centavos, disponibilidade } });
      return;
    }
    const entrada: AtualizarOpcaoEntrada = {
      ...(opcao.nome.trim() !== salva.nome ? { nome: opcao.nome.trim() } : {}),
      ...(centavos !== salva.precoAdicionalCentavos ? { precoAdicionalCentavos: centavos } : {}),
      ...(disponibilidade !== salva.disponibilidade ? { disponibilidade } : {}),
    };
    if (Object.keys(entrada).length > 0) plano.alteradas.push({ id: opcao.id, entrada });
  });

  return { ok: true, plano };
}

export const planoVazio = (plano: PlanoDoGrupo) => plano.criar === null && plano.grupo === null && plano.alteradas.length === 0 && plano.novas.length === 0;

/** Há algo no rascunho que ainda não está no servidor? Rascunho inválido conta como alterado. */
export function grupoAlterado(grupo: GrupoOpcoesProduto | null, rascunho: RascunhoDoGrupo): boolean {
  if (!grupo) return rascunho.nome.trim() !== "" || rascunho.instrucao.trim() !== "" || rascunho.opcoes.length > 0 || rascunho.minimo.trim() !== "0" || rascunho.maximo.trim() !== "1";
  const resultado = planejarGravacao(grupo, rascunho);
  return !resultado.ok || !planoVazio(resultado.plano);
}

/**
 * O servidor devolveu o grupo depois de APAGAR uma opção: a linha dela sai do rascunho; o resto do que
 * o gestor digitou (inclusive opções novas ainda não gravadas) continua como está.
 */
export function semAOpcao(rascunho: RascunhoDoGrupo, chave: string): RascunhoDoGrupo {
  return { ...rascunho, opcoes: rascunho.opcoes.filter((opcao) => opcao.chave !== chave) };
}

/** Uma opção nova acabou de ser gravada: a linha passa a apontar para o id que o servidor criou. */
export function comOpcaoGravada(rascunho: RascunhoDoGrupo, chave: string, id: string): RascunhoDoGrupo {
  return { ...rascunho, opcoes: rascunho.opcoes.map((opcao) => (opcao.chave === chave ? { ...opcao, id } : opcao)) };
}
