"use client";

import type { CatalogoPublico, GrupoOpcoesPublico, ProdutoPublico } from "@jaa/contratos";
import { useCallback, useEffect, useMemo, useState } from "react";
import { obterCatalogo, obterProdutoDoCatalogo } from "../lib/api-catalogo";
import { montarSecoes, produtoParaMontarNaSecao, secaoAtiva } from "../lib/cardapio";
import { Cardapio, DetalheProdutoCatalogo } from "./catalogo-apresentacao";

/*
 * Cardápio aberto a partir de uma conversa com empresa. Usa a consulta PÚBLICA do mesmo domínio
 * Produto, e é AQUI que vivem os dados: catálogo, categoria escolhida e os grupos do produto aberto.
 *
 * Duas formas de montar o mesmo produto personalizável, com o MESMO componente e a mesma regra:
 *  - pela CATEGORIA, quando ela tem um único produto personalizável (ex.: "Monte seu prato"): o
 *    montador aparece no lugar da lista e os chips continuam à vista;
 *  - pelo PRODUTO, abrindo o detalhe de um item personalizável de uma categoria com vários.
 */

// Montagem carregada: o produto relido do servidor, seus grupos e a contagem de montagens já feitas.
type Montagem = { produto: ProdutoPublico; grupos: GrupoOpcoesPublico[]; chave: number };

export function CatalogoDaEmpresa({
  identidadeEmpresaId,
  aoFechar,
  aoAdicionarAoCarrinho,
}: {
  identidadeEmpresaId: string;
  aoFechar: () => void;
  // Ausente quando quem olha é a própria empresa (não faz pedido de si mesma).
  aoAdicionarAoCarrinho?: (
    empresa: CatalogoPublico["empresa"],
    produto: ProdutoPublico,
    quantidade: number,
    // Grupos + opções escolhidas + observação: a conversa precisa disso para montar o item do carrinho.
    montagem: { grupos: GrupoOpcoesPublico[]; opcaoIds: string[]; observacao: string | null },
  ) => void;
}) {
  const [catalogo, setCatalogo] = useState<CatalogoPublico | null>(null);
  // Produto aberto pelo DETALHE: sempre relido do servidor, junto dos grupos disponíveis.
  const [aberto, setAberto] = useState<{ produto: ProdutoPublico; grupos: GrupoOpcoesPublico[] } | null>(null);
  /*
   * Seção escolhida pela pessoa. `null` = ainda não escolheu — a seção aberta é então DERIVADA
   * (`secaoInicial`: a de montagem, senão a primeira). Assim não há efeito sincronizando estado com
   * o carregamento do catálogo, e a primeira pintura já vem com a categoria certa selecionada.
   */
  const [secaoEscolhidaId, setSecaoEscolhidaId] = useState<string | null>(null);
  // Última montagem CARREGADA do servidor; só vale enquanto for a do produto da categoria atual.
  const [montagemCarregada, setMontagemCarregada] = useState<{ produto: ProdutoPublico; grupos: GrupoOpcoesPublico[] } | null>(null);
  // Cresce a cada item adicionado: é o que reinicia o montador para a pessoa montar outro.
  const [montagensFeitas, setMontagensFeitas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void obterCatalogo(identidadeEmpresaId).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setCatalogo(resultado.dados);
      else setErro(resultado.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, [identidadeEmpresaId]);

  /*
   * Seções na ordem em que o cliente as vê (montagem primeiro). São calculadas aqui, e não na
   * apresentação, porque é a seção aberta que decide se há grupos de opções a buscar no servidor.
   */
  const secoes = useMemo(() => montarSecoes(catalogo?.categorias ?? [], catalogo?.produtos ?? []), [catalogo]);
  const aberta = secaoAtiva(secoes, secaoEscolhidaId);

  /*
   * A seção aberta é um montador? Então os grupos são carregados do servidor (a listagem do catálogo
   * não os traz) e ficam no lugar da lista. Trocar de categoria muda isso e os produtos normais voltam.
   */
  const produtoDaCategoriaId = produtoParaMontarNaSecao(aberta)?.id ?? null;

  useEffect(() => {
    if (produtoDaCategoriaId === null) return;
    let ativo = true;
    void obterProdutoDoCatalogo(identidadeEmpresaId, produtoDaCategoriaId).then((resultado) => {
      if (!ativo) return;
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setErro(null);
      setMontagemCarregada({ produto: resultado.dados.produto, grupos: resultado.dados.grupos });
    });
    return () => {
      ativo = false;
    };
  }, [identidadeEmpresaId, produtoDaCategoriaId]);

  /*
   * A montagem exibida é DERIVADA: só aparece se o que foi carregado corresponde ao produto da
   * categoria atual. Assim trocar de categoria não precisa "limpar" estado dentro de um efeito, e
   * nunca se vê por um instante o montador da categoria anterior.
   */
  const montagem: Montagem | null =
    montagemCarregada !== null && montagemCarregada.produto.id === produtoDaCategoriaId
      ? { ...montagemCarregada, chave: montagensFeitas }
      : null;

  async function ver(escolhido: ProdutoPublico) {
    // Relê do servidor: pode ter ficado indisponível, e é de lá que vêm os grupos a montar.
    const resultado = await obterProdutoDoCatalogo(identidadeEmpresaId, escolhido.id);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    setAberto({ produto: resultado.dados.produto, grupos: resultado.dados.grupos });
  }

  const adicionar = useCallback(
    (produto: ProdutoPublico, quantidade: number, grupos: GrupoOpcoesPublico[], opcaoIds: string[], observacao: string | null) => {
      if (!catalogo || !aoAdicionarAoCarrinho) return;
      aoAdicionarAoCarrinho(catalogo.empresa, produto, quantidade, { grupos, opcaoIds, observacao });
      setMontagensFeitas((feitas) => feitas + 1);
    },
    [catalogo, aoAdicionarAoCarrinho],
  );

  return (
    /*
     * O cardápio ocupa a coluna CENTRAL (no lugar das mensagens), com o papel de parede da conversa
     * aparecendo por trás dos cards — é o formato da referência de UI/UX aprovada. Fechar devolve as
     * mensagens; o compositor nunca sai do rodapé.
     */
    <section aria-label="Cardápio da empresa" className="mx-auto flex w-full max-w-4xl flex-col gap-2.5 px-3 py-3 sm:px-5 sm:py-4">
      {!catalogo && !erro && (
        <p className="rounded-jaa bg-superficie px-4 py-6 text-center text-sm text-conteudo-suave shadow-cartao">Carregando o cardápio…</p>
      )}
      {catalogo && !aberto && (
        <Cardapio
          empresa={catalogo.empresa}
          secoes={secoes}
          secaoEscolhidaId={secaoEscolhidaId}
          aoEscolherSecao={setSecaoEscolhidaId}
          {...(montagem ? { montagem } : {})}
          aoFechar={aoFechar}
          aoVer={(produto) => void ver(produto)}
          {...(aoAdicionarAoCarrinho
            ? {
                aoAdicionar: (produto: ProdutoPublico, quantidade: number, opcaoIds: string[], observacao: string | null) =>
                  // Pela lista, o produto é comum (o card só oferece "Adicionar" a quem não tem grupos).
                  adicionar(produto, quantidade, montagem?.grupos ?? [], opcaoIds, observacao),
              }
            : {})}
        />
      )}
      {catalogo && aberto && (
        <DetalheProdutoCatalogo
          empresa={catalogo.empresa}
          produto={aberto.produto}
          grupos={aberto.grupos}
          aoVoltar={() => setAberto(null)}
          {...(aoAdicionarAoCarrinho
            ? {
                aoAdicionar: (produto: ProdutoPublico, quantidade: number, opcaoIds: string[], observacao: string | null) => {
                  adicionar(produto, quantidade, aberto.grupos, opcaoIds, observacao);
                  // Item montado e adicionado: volta ao cardápio, que é o próximo passo natural.
                  setAberto(null);
                },
              }
            : {})}
        />
      )}
      {erro && (
        <p role="alert" className="rounded-jaa bg-superficie px-4 py-3 text-sm text-perigo shadow-cartao">
          {erro}
        </p>
      )}
    </section>
  );
}
