import type { FiltroPedidosEmpresa } from "@jaa/contratos";

/*
 * PAGINAÇÃO da lista de pedidos da empresa. A API pagina por CURSOR (o id do pedido mais antigo da
 * página) e informa o total do filtro; a tela guarda os cursores das páginas já percorridas para
 * poder voltar. Aqui fica só o estado e a conta — sem React, testável sem navegador.
 *
 * Este estado é o "contexto da lista": abrir um pedido e voltar não mexe nele, então a pessoa retorna
 * à MESMA página e ao MESMO filtro.
 */

export const PEDIDOS_POR_PAGINA = 10;

export interface ConsultaPedidos {
  filtro: FiltroPedidosEmpresa;
  // Cursor de cada página a partir da 2ª: a página atual é `cursores.length + 1`.
  cursores: string[];
}

export const CONSULTA_INICIAL: ConsultaPedidos = { filtro: "todos", cursores: [] };

export const paginaAtual = (consulta: ConsultaPedidos) => consulta.cursores.length + 1;
export const cursorDaPagina = (consulta: ConsultaPedidos): string | undefined => consulta.cursores.at(-1);

// Outro filtro é outra lista: volta para a primeira página (a página antiga pode nem existir nele).
export function trocarFiltro(consulta: ConsultaPedidos, filtro: FiltroPedidosEmpresa): ConsultaPedidos {
  return filtro === consulta.filtro ? consulta : { filtro, cursores: [] };
}

export function irParaProxima(consulta: ConsultaPedidos, proximoCursor: string | null): ConsultaPedidos {
  return proximoCursor ? { ...consulta, cursores: [...consulta.cursores, proximoCursor] } : consulta;
}

export function irParaAnterior(consulta: ConsultaPedidos): ConsultaPedidos {
  return consulta.cursores.length === 0 ? consulta : { ...consulta, cursores: consulta.cursores.slice(0, -1) };
}

/**
 * A página deixou de existir? Acontece quando os pedidos dela saem do filtro (mudaram de status) ou
 * a lista encolheu: em vez de mostrar uma página vazia, a tela recua uma página.
 */
export const paginaFicouVazia = (consulta: ConsultaPedidos, quantidadeNaPagina: number) => quantidadeNaPagina === 0 && consulta.cursores.length > 0;

export interface ResumoDaPagina {
  primeiro: number;
  ultimo: number;
  total: number;
  pagina: number;
  totalPaginas: number;
  temAnterior: boolean;
  temProxima: boolean;
  // "1–10 de 36 pedidos" / "3 pedidos" / "1 pedido"
  contagem: string;
}

export function resumoDaPagina(dados: { pagina: number; quantidadeNaPagina: number; total: number; temProxima: boolean }): ResumoDaPagina {
  const primeiro = (dados.pagina - 1) * PEDIDOS_POR_PAGINA + 1;
  const ultimo = primeiro + dados.quantidadeNaPagina - 1;
  // Pedidos chegam enquanto a pessoa navega: o total nunca fica menor do que o que já está na tela.
  const total = Math.max(dados.total, ultimo);
  // Página cheia faz a API oferecer um cursor mesmo quando não sobra nada (10 pedidos exatos): só há
  // próxima página se o total diz que ainda existe pedido depois desta.
  const temProxima = dados.temProxima && ultimo < total;
  const totalPaginas = Math.max(Math.ceil(total / PEDIDOS_POR_PAGINA), dados.pagina, 1);
  const variasPaginas = totalPaginas > 1;
  return {
    primeiro,
    ultimo,
    total,
    pagina: dados.pagina,
    totalPaginas,
    temAnterior: dados.pagina > 1,
    temProxima,
    contagem: variasPaginas ? `${primeiro}–${ultimo} de ${total} pedidos` : `${total} pedido${total === 1 ? "" : "s"}`,
  };
}
