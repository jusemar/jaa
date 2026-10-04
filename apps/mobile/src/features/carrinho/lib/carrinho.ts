import {
  QUANTIDADE_MAXIMA_POR_ITEM,
  MAXIMO_ITENS_POR_PEDIDO,
  type EmpresaPublica,
  type GrupoOpcoesPublico,
  type ProdutoPublico,
} from "@jaa/contratos";

/*
 * Carrinho do CLIENTE: estado de interface, com UMA empresa por vez. Guarda nome, preço e a montagem
 * escolhida só para EXIBIR; na confirmação o servidor recalcula tudo a partir do banco (preço, mínimo,
 * máximo e acréscimo). O carrinho nunca é autoridade comercial.
 */

/** Escolha exibível: o id vai para a API, os nomes e o acréscimo servem para mostrar a montagem. */
export interface EscolhaCarrinho {
  opcaoId: string;
  grupoNome: string;
  opcaoNome: string;
  precoAdicionalCentavos: number;
}

export interface ItemCarrinho {
  /*
   * Identidade da LINHA, não do produto: o mesmo produto pode estar no carrinho duas vezes com
   * montagens diferentes (um prato grande e um pequeno). É derivada do produto + opções, então
   * adicionar a MESMA configuração de novo soma quantidade em vez de criar outra linha.
   */
  linhaId: string;
  produtoId: string;
  nome: string;
  // Preço do produto JÁ com os acréscimos das opções escolhidas.
  precoUnitarioCentavos: number;
  quantidade: number;
  imagemUrl: string | null;
  escolhas: EscolhaCarrinho[];
  // Instrução de preparo DESTA linha ("sem cebola"); null = sem observação.
  observacao: string | null;
}

export interface Carrinho {
  empresa: EmpresaPublica;
  itens: ItemCarrinho[];
}

export type ResultadoAdicionar =
  | { tipo: "adicionado"; carrinho: Carrinho; linhaId: string }
  // Carrinho aberto de outra empresa: quem chama pergunta antes de substituir (nunca troca em silêncio).
  | { tipo: "outra-empresa"; empresaAtual: EmpresaPublica }
  | { tipo: "limite-de-itens" };

/**
 * Chave determinística da linha: produto + opções em ordem estável + observação (sobrevive a
 * recarregar a página). A OBSERVAÇÃO entra na chave porque "prato grande sem cebola" e "prato
 * grande" são linhas diferentes para quem prepara — somar as duas perderia o pedido de uma delas.
 */
export function linhaDoItem(produtoId: string, opcaoIds: readonly string[], observacao: string | null = null): string {
  return [produtoId, ...[...opcaoIds].sort(), `obs:${observacao ?? ""}`].join("|");
}

export function totalCentavos(carrinho: Carrinho | null): number {
  return (carrinho?.itens ?? []).reduce((total, item) => total + item.precoUnitarioCentavos * item.quantidade, 0);
}

export function quantidadeTotal(carrinho: Carrinho | null): number {
  return (carrinho?.itens ?? []).reduce((total, item) => total + item.quantidade, 0);
}

const limitarQuantidade = (quantidade: number) => Math.min(Math.max(Math.trunc(quantidade), 1), QUANTIDADE_MAXIMA_POR_ITEM);

/**
 * Traduz as opções escolhidas na montagem para o formato exibível do carrinho, preservando a ordem em
 * que os grupos foram apresentados — é assim que o item é lido depois ("Grande · Bife bovino · Arroz").
 */
export function escolhasDaMontagem(grupos: readonly GrupoOpcoesPublico[], opcaoIds: readonly string[]): EscolhaCarrinho[] {
  const escolhidas = new Set(opcaoIds);
  return grupos.flatMap((grupo) =>
    grupo.opcoes
      .filter((opcao) => escolhidas.has(opcao.id))
      .map((opcao) => ({ opcaoId: opcao.id, grupoNome: grupo.nome, opcaoNome: opcao.nome, precoAdicionalCentavos: opcao.precoAdicionalCentavos })),
  );
}

export function adicionarAoCarrinho(
  carrinho: Carrinho | null,
  empresa: EmpresaPublica,
  produto: ProdutoPublico,
  quantidade = 1,
  escolhas: readonly EscolhaCarrinho[] = [],
  observacao: string | null = null,
): ResultadoAdicionar {
  if (carrinho && carrinho.itens.length > 0 && carrinho.empresa.identidadeId !== empresa.identidadeId) {
    return { tipo: "outra-empresa", empresaAtual: carrinho.empresa };
  }

  const atual = carrinho && carrinho.empresa.identidadeId === empresa.identidadeId ? carrinho : { empresa, itens: [] };
  const linhaId = linhaDoItem(
    produto.id,
    escolhas.map((escolha) => escolha.opcaoId),
    observacao,
  );
  const existente = atual.itens.find((item) => item.linhaId === linhaId);
  // O limite do pedido é de LINHAS: duas montagens do mesmo produto são dois itens para a empresa.
  if (!existente && atual.itens.length >= MAXIMO_ITENS_POR_PEDIDO) return { tipo: "limite-de-itens" };

  const itens = existente
    ? atual.itens.map((item) => (item.linhaId === linhaId ? { ...item, quantidade: limitarQuantidade(item.quantidade + quantidade) } : item))
    : [
        ...atual.itens,
        {
          linhaId,
          produtoId: produto.id,
          nome: produto.nome,
          // Espelha o cálculo do servidor (preço base + acréscimos). O servidor recalcula na confirmação.
          precoUnitarioCentavos: produto.precoCentavos + escolhas.reduce((soma, escolha) => soma + escolha.precoAdicionalCentavos, 0),
          quantidade: limitarQuantidade(quantidade),
          imagemUrl: produto.imagemUrl,
          escolhas: [...escolhas],
          observacao,
        },
      ];

  return { tipo: "adicionado", carrinho: { empresa, itens }, linhaId };
}

export function alterarQuantidade(carrinho: Carrinho, linhaId: string, quantidade: number): Carrinho {
  if (quantidade < 1) return removerDoCarrinho(carrinho, linhaId);
  return { ...carrinho, itens: carrinho.itens.map((item) => (item.linhaId === linhaId ? { ...item, quantidade: limitarQuantidade(quantidade) } : item)) };
}

export function removerDoCarrinho(carrinho: Carrinho, linhaId: string): Carrinho {
  return { ...carrinho, itens: carrinho.itens.filter((item) => item.linhaId !== linhaId) };
}

// Itens para a API: produto, quantidade e as opções escolhidas (preço e total são do servidor).
export function itensParaPedido(carrinho: Carrinho): Array<{ produtoId: string; quantidade: number; opcaoIds?: string[]; observacao?: string }> {
  return carrinho.itens.map((item) => ({
    produtoId: item.produtoId,
    quantidade: item.quantidade,
    ...(item.escolhas.length > 0 ? { opcaoIds: item.escolhas.map((escolha) => escolha.opcaoId) } : {}),
    ...(item.observacao === null ? {} : { observacao: item.observacao }),
  }));
}

/** Resumo da montagem em uma linha, para o carrinho e o card do pedido ("Grande · Bife bovino"). */
export function resumirEscolhas(escolhas: readonly EscolhaCarrinho[]): string {
  return escolhas.map((escolha) => escolha.opcaoNome).join(" · ");
}

/*
 * Persistência local por identidade: o carrinho sobrevive a recarregar a página e a navegar entre telas,
 * sem virar autoridade comercial. Outra identidade no mesmo navegador não herda o carrinho.
 */
const chave = (identidadeId: string) => `jaa:carrinho:${identidadeId}`;

const textoOuNulo = (valor: unknown) => (typeof valor === "string" && valor !== "" ? valor : null);
const inteiroPositivo = (valor: unknown) => (typeof valor === "number" && Number.isFinite(valor) ? Math.trunc(valor) : null);

function normalizarEscolha(valor: unknown): EscolhaCarrinho | null {
  if (typeof valor !== "object" || valor === null) return null;
  const bruto = valor as Record<string, unknown>;
  const opcaoId = textoOuNulo(bruto.opcaoId);
  const grupoNome = textoOuNulo(bruto.grupoNome);
  const opcaoNome = textoOuNulo(bruto.opcaoNome);
  const precoAdicionalCentavos = inteiroPositivo(bruto.precoAdicionalCentavos) ?? 0;
  return opcaoId && grupoNome && opcaoNome ? { opcaoId, grupoNome, opcaoNome, precoAdicionalCentavos } : null;
}

/**
 * Lê um item gravado por QUALQUER versão anterior do Jaa. Carrinhos salvos antes da personalização
 * têm `precoCentavos` e não têm `linhaId` nem `escolhas`: são aceitos e completados aqui, em vez de
 * fazer a pessoa perder o carrinho por causa de uma atualização.
 */
function normalizarItem(valor: unknown): ItemCarrinho | null {
  if (typeof valor !== "object" || valor === null) return null;
  const bruto = valor as Record<string, unknown>;
  const produtoId = textoOuNulo(bruto.produtoId);
  const nome = textoOuNulo(bruto.nome);
  const preco = inteiroPositivo(bruto.precoUnitarioCentavos) ?? inteiroPositivo(bruto.precoCentavos);
  const quantidade = inteiroPositivo(bruto.quantidade);
  if (!produtoId || !nome || preco === null || preco < 1 || quantidade === null || quantidade < 1) return null;

  const escolhas = Array.isArray(bruto.escolhas) ? bruto.escolhas.map(normalizarEscolha).filter((escolha): escolha is EscolhaCarrinho => escolha !== null) : [];
  const observacao = textoOuNulo(bruto.observacao);
  return {
    /*
     * A chave é sempre RECALCULADA, nunca lida do que estava gravado: ela é derivada de produto +
     * opções + observação, e derivar de novo mantém carrinhos antigos válidos mesmo quando o formato
     * da chave muda. Confiar na gravada faria o mesmo produto virar duas linhas depois de uma
     * atualização do Jaa.
     */
    linhaId: linhaDoItem(
      produtoId,
      escolhas.map((escolha) => escolha.opcaoId),
      observacao,
    ),
    produtoId,
    nome,
    precoUnitarioCentavos: preco,
    quantidade: limitarQuantidade(quantidade),
    imagemUrl: textoOuNulo(bruto.imagemUrl),
    escolhas,
    observacao,
  };
}

export function lerCarrinho(identidadeId: string): Carrinho | null {
  try {
    const guardado = window.localStorage.getItem(chave(identidadeId));
    if (!guardado) return null;
    const carrinho = JSON.parse(guardado) as Carrinho;
    if (!carrinho?.empresa?.identidadeId || !Array.isArray(carrinho.itens)) return null;
    const itens = carrinho.itens.map(normalizarItem).filter((item): item is ItemCarrinho => item !== null);
    return itens.length > 0 ? { empresa: carrinho.empresa, itens } : null;
  } catch {
    return null;
  }
}

export function gravarCarrinho(identidadeId: string, carrinho: Carrinho | null): void {
  try {
    if (!carrinho || carrinho.itens.length === 0) window.localStorage.removeItem(chave(identidadeId));
    else window.localStorage.setItem(chave(identidadeId), JSON.stringify(carrinho));
  } catch {
    // Sem armazenamento: o carrinho vale só enquanto a página estiver aberta.
  }
}
