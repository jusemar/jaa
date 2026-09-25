"use client";

import type { EmpresaPublica, ProdutoPublico } from "@jaa/contratos";
import { useCallback, useSyncExternalStore } from "react";
import {
  adicionarAoCarrinho,
  alterarQuantidade,
  removerDoCarrinho,
  type Carrinho,
  type EscolhaCarrinho,
  type ResultadoAdicionar,
} from "../lib/carrinho";
import { assinarCarrinho, carrinhoAtual, guardarCarrinho } from "../lib/deposito-carrinho";

// Carrinho do cliente com persistência local por identidade (sobrevive a recarregar a página).
export function useCarrinho(identidadeId: string) {
  const carrinho = useSyncExternalStore(
    assinarCarrinho,
    () => carrinhoAtual(identidadeId),
    // No servidor não há carrinho: ele é estado do navegador daquela pessoa.
    () => null,
  );

  const guardar = useCallback((novo: Carrinho | null) => guardarCarrinho(identidadeId, novo), [identidadeId]);

  return {
    carrinho,
    // Devolve o resultado para quem chama decidir (ex.: perguntar antes de trocar de empresa).
    adicionar: useCallback(
      (
        empresa: EmpresaPublica,
        produto: ProdutoPublico,
        quantidade = 1,
        escolhas: readonly EscolhaCarrinho[] = [],
        observacao: string | null = null,
      ): ResultadoAdicionar => {
        const resultado = adicionarAoCarrinho(carrinho, empresa, produto, quantidade, escolhas, observacao);
        if (resultado.tipo === "adicionado") guardar(resultado.carrinho);
        return resultado;
      },
      [carrinho, guardar],
    ),
    // Substitui explicitamente o carrinho por um novo de outra empresa (nunca automático).
    substituirPorEmpresa: useCallback(
      (empresa: EmpresaPublica, produto: ProdutoPublico, quantidade = 1, escolhas: readonly EscolhaCarrinho[] = [], observacao: string | null = null) => {
        const resultado = adicionarAoCarrinho(null, empresa, produto, quantidade, escolhas, observacao);
        if (resultado.tipo === "adicionado") guardar(resultado.carrinho);
      },
      [guardar],
    ),
    // `linhaId`, não `produtoId`: o mesmo produto pode estar no carrinho em duas montagens.
    alterarQuantidade: useCallback((linhaId: string, quantidade: number) => carrinho && guardar(alterarQuantidade(carrinho, linhaId, quantidade)), [carrinho, guardar]),
    remover: useCallback((linhaId: string) => carrinho && guardar(removerDoCarrinho(carrinho, linhaId)), [carrinho, guardar]),
    limpar: useCallback(() => guardar(null), [guardar]),
  };
}
