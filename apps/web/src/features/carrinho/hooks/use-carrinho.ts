"use client";

import type { CatalogoPublico, EmpresaPublica, ProdutoPublico } from "@jaa/contratos";
import { useCallback, useSyncExternalStore } from "react";
import {
  adicionarAoCarrinho,
  alterarQuantidade,
  atualizarImagensDoCarrinho,
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
    // Catálogo recém-lido do servidor: a imagem de cada item passa a ser a ATUAL do produto.
    sincronizarImagens: useCallback(
      (catalogo: CatalogoPublico) => {
        // Lê o carrinho ATUAL do depósito (não o deste render): o catálogo chega depois, e um item
        // adicionado nesse meio-tempo não pode ser sobrescrito por uma cópia antiga.
        const atual = carrinhoAtual(identidadeId);
        if (!atual) return;
        const atualizado = atualizarImagensDoCarrinho(atual, catalogo.empresa.identidadeId, catalogo.produtos);
        if (atualizado !== atual) guardar(atualizado);
      },
      [identidadeId, guardar],
    ),
  };
}
