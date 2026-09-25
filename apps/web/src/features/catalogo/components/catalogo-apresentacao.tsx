"use client";

import { QUANTIDADE_MAXIMA_POR_ITEM, type EmpresaPublica, type GrupoOpcoesPublico, type ProdutoPublico } from "@jaa/contratos";
import { useMemo, useState } from "react";
import { IconeBusca, IconeCesta, IconeFechar, IconeImagem, IconeLoja, IconeMais, IconeMenos, IconeVoltar } from "@/components/ui/icones";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { filtrarProdutos, secaoAtiva, type SecaoCardapio } from "../lib/cardapio";
import { MontagemProduto } from "./montagem-produto";

/*
 * CARDÁPIO do cliente dentro da conversa: busca, categorias da empresa e cards de produto.
 *
 * Categorias, nomes, imagens e preços são TODOS da empresa — não há categoria, produto nem rótulo
 * de exemplo escrito no código. Quando a empresa não cadastrou categoria nenhuma, os chips
 * simplesmente não aparecem e o cardápio é uma lista só, sem espaço morto.
 *
 * Esta camada apenas apresenta: quem adiciona ao carrinho é a conversa, e o pedido é sempre
 * recalculado pelo servidor.
 */

export function Cardapio({
  empresa,
  secoes,
  secaoEscolhidaId,
  aoEscolherSecao,
  montagem,
  aoVer,
  aoAdicionar,
  aoFechar,
}: {
  empresa: EmpresaPublica;
  /*
   * Seções já montadas e ORDENADAS por quem cuida dos dados (montagem primeiro, depois a ordem da
   * empresa, "Outros" no fim). Aqui é só apresentação: uma seção por vez, nunca categorias juntas.
   */
  secoes: SecaoCardapio[];
  // null = ninguém escolheu ainda; a seção inicial é derivada, não gravada.
  secaoEscolhidaId: string | null;
  aoEscolherSecao: (secaoId: string) => void;
  /*
   * Montagem da seção atual, já carregada pelo componente de dados. Quando existe, ela substitui a
   * lista de produtos: a seção É o montador. Os chips continuam visíveis, então trocar de categoria
   * volta para os produtos normais.
   */
  montagem?: { produto: ProdutoPublico; grupos: GrupoOpcoesPublico[]; chave: number } | undefined;
  aoVer: (produto: ProdutoPublico) => void;
  // Ausente quando quem olha é a própria empresa (não faz pedido de si mesma).
  aoAdicionar?: ((produto: ProdutoPublico, quantidade: number, opcaoIds: string[], observacao: string | null) => void) | undefined;
  aoFechar?: (() => void) | undefined;
}) {
  const [busca, setBusca] = useState("");

  const ativa = secaoAtiva(secoes, secaoEscolhidaId);
  /*
   * A busca filtra DENTRO da seção aberta. Os chips seguem contando o total da categoria, então a
   * barra de categorias não muda de tamanho enquanto se digita.
   */
  const encontrados = useMemo(() => filtrarProdutos(ativa?.produtos ?? [], busca), [ativa, busca]);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Cabeçalho do cardápio dentro da conversa: quem é a loja e como sair dela. */}
      <div className="flex items-center gap-2 rounded-jaa border border-borda bg-superficie p-3 shadow-cartao sm:p-4">
        <h3 className="fonte-display flex min-w-0 flex-1 items-center gap-2 text-sm font-bold sm:text-base">
          <IconeLoja className="h-5 w-5 shrink-0 text-marca" />
          <span className="truncate">Cardápio de {empresa.nome}</span>
        </h3>
        {aoFechar && (
          <button
            type="button"
            onClick={aoFechar}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-jaa-compacto px-3 text-xs font-medium text-conteudo-suave transition-colors hover:bg-realce hover:text-conteudo"
          >
            <IconeFechar className="h-4 w-4" />
            <span className="hidden sm:inline">Fechar</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-jaa border border-borda bg-superficie p-3 shadow-cartao sm:p-4">
        {/* Busca no mesmo desenho da busca de conversas: campo suave, sem borda, com ícone à esquerda.
            No montador ela não aparece: ali não há lista de produtos para filtrar. */}
        {!montagem && (
        <label className="flex min-h-11 items-center gap-2 rounded-jaa-compacto bg-superficie-suave px-3 text-conteudo-suave focus-within:ring-2 focus-within:ring-marca/30 sm:min-h-10">
          <span className="sr-only">Buscar no cardápio</span>
          <IconeBusca className="h-4 w-4 shrink-0" />
          <input
            name="buscaCardapio"
            type="search"
            value={busca}
            placeholder="Buscar produto"
            autoComplete="off"
            onChange={(evento) => setBusca(evento.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-conteudo outline-none placeholder:text-conteudo-suave"
          />
        </label>
        )}

        {/*
          Chips só quando a empresa organizou o cardápio em mais de uma seção. NÃO existe "Todos":
          o cardápio trabalha por categoria, então cada chip troca o conteúdo inteiro abaixo.
        */}
        {secoes.length > 1 && (
          <div role="tablist" aria-label="Categorias do cardápio" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {secoes.map((secao) => (
              <ChipCategoria
                key={secao.id}
                ativo={ativa?.id === secao.id}
                rotulo={secao.nome}
                total={secao.produtos.length}
                aoEscolher={() => aoEscolherSecao(secao.id)}
              />
            ))}
          </div>
        )}
      </div>

      {montagem ? (
        /*
          A categoria escolhida É a montagem: o montador ocupa o lugar da lista. `key` inclui a
          contagem de montagens adicionadas, então cada prato começa do zero sem estado de sobra.
        */
        <MontagemProduto
          key={`${montagem.produto.id}-${montagem.chave}`}
          produto={montagem.produto}
          grupos={montagem.grupos}
          {...(aoAdicionar
            ? {
                aoAdicionar: (opcaoIds: string[], quantidade: number, observacao: string | null) =>
                  aoAdicionar(montagem.produto, quantidade, opcaoIds, observacao),
              }
            : { aoAdicionar: () => {} })}
        />
      ) : encontrados.length === 0 ? (
        <div className="rounded-jaa border border-borda bg-superficie px-4 py-12 text-center shadow-cartao">
          <IconeLoja className="mx-auto h-8 w-8 text-conteudo-suave" />
          <p className="mt-3 text-sm font-bold">{busca.trim() === "" ? "Nada aqui por enquanto" : "Nada encontrado"}</p>
          <p className="mt-1 text-xs text-conteudo-suave">
            {busca.trim() === ""
              ? "Esta empresa ainda não tem produtos disponíveis."
              : `Nenhum produto de “${ativa?.nome ?? "cardápio"}” corresponde a “${busca.trim()}”.`}
          </p>
        </div>
      ) : (
        // UMA seção por vez: o que aparece aqui é sempre o conteúdo do chip selecionado.
        <section aria-label={ativa?.nome ?? "Produtos"} className="flex flex-col gap-2">
          <ol className="flex flex-col gap-2">
            {encontrados.map((produto) => (
              <CardProduto
                key={produto.id}
                produto={produto}
                aoVer={aoVer}
                {...(aoAdicionar ? { aoAdicionar: (escolhido: ProdutoPublico) => aoAdicionar(escolhido, 1, [], null) } : {})}
              />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function ChipCategoria({ ativo, rotulo, total, aoEscolher }: { ativo: boolean; rotulo: string; total: number; aoEscolher: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativo}
      onClick={aoEscolher}
      className={`flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors ${
        ativo ? "bg-marca text-marca-conteudo" : "text-conteudo-suave hover:bg-realce hover:text-conteudo"
      }`}
    >
      {rotulo}
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ativo ? "bg-marca-conteudo/20" : "bg-superficie-suave"}`}>{total}</span>
    </button>
  );
}

/**
 * Card do produto. O corpo inteiro abre o detalhe; o botão à direita é a ação rápida. Produto que
 * precisa ser MONTADO não tem "Adicionar" direto — seria adicionar algo que ainda não foi escolhido.
 */
function CardProduto({
  produto,
  aoVer,
  aoAdicionar,
}: {
  produto: ProdutoPublico;
  aoVer: (produto: ProdutoPublico) => void;
  aoAdicionar?: ((produto: ProdutoPublico) => void) | undefined;
}) {
  return (
    <li
      data-produto-catalogo-id={produto.id}
      className="flex items-center gap-3 rounded-jaa border border-borda bg-superficie p-3 shadow-cartao transition-colors hover:bg-superficie-suave"
    >
      {/*
        O botão envolve imagem e texto (em vez de `display:contents`, que tira o botão da árvore de
        acessibilidade em alguns navegadores): tocar em qualquer parte do card abre o produto.
      */}
      <button type="button" onClick={() => aoVer(produto)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <ImagemProduto url={produto.imagemUrl} nome={produto.nome} className="h-14 w-14" />
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold sm:text-sm">{produto.nome}</span>
          {produto.descricao && <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-conteudo-suave">{produto.descricao}</span>}
          <span className="mt-1 flex flex-wrap items-baseline gap-1.5">
            <span data-preco className="fonte-display text-sm font-bold text-marca">
              {formatarPrecoCentavos(produto.precoCentavos)}
            </span>
            {produto.personalizavel && <span className="text-[10px] text-conteudo-suave">a partir de · monte do seu jeito</span>}
          </span>
        </span>
      </button>

      {aoAdicionar ? (
        produto.personalizavel ? (
          <button
            type="button"
            data-montar-produto
            onClick={() => aoVer(produto)}
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-jaa-compacto bg-marca-suave px-3 text-xs font-medium text-marca-suave-conteudo shadow-suave transition-colors hover:bg-marca-suave/80 sm:min-h-9"
          >
            Montar
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Adicionar ${produto.nome}`}
            onClick={() => aoAdicionar(produto)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-jaa-compacto bg-marca text-marca-conteudo shadow-suave transition-colors hover:bg-marca/90 sm:h-9 sm:w-9"
          >
            <IconeMais className="h-4 w-4" />
          </button>
        )
      ) : null}
    </li>
  );
}

export function DetalheProdutoCatalogo({
  empresa,
  produto,
  grupos,
  aoVoltar,
  aoAdicionar,
}: {
  empresa: EmpresaPublica;
  produto: ProdutoPublico;
  // Vazio = produto comum: adiciona com quantidade, sem montagem.
  grupos: GrupoOpcoesPublico[];
  aoVoltar: () => void;
  aoAdicionar?: ((produto: ProdutoPublico, quantidade: number, opcaoIds: string[], observacao: string | null) => void) | undefined;
}) {
  return (
    <article aria-label="Detalhe do produto" className="painel-entrando flex flex-col gap-2.5 text-sm">
      <div className="flex items-center gap-2 rounded-jaa border border-borda bg-superficie p-3 shadow-cartao sm:p-4">
        <button
          type="button"
          onClick={aoVoltar}
          className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-jaa-compacto px-2 text-xs font-medium text-conteudo-suave transition-colors hover:bg-realce hover:text-conteudo"
        >
          <IconeVoltar className="h-4 w-4" />
          Cardápio
        </button>
      </div>

      <header className="flex gap-3 rounded-jaa border border-borda bg-superficie p-3 shadow-cartao sm:p-4">
        <ImagemProduto url={produto.imagemUrl} nome={produto.nome} className="h-20 w-20" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h4 className="fonte-display text-sm font-bold sm:text-base">{produto.nome}</h4>
          <p className="text-[11px] text-conteudo-suave">{empresa.nome}</p>
          {produto.descricao && <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-4 text-conteudo-suave [overflow-wrap:anywhere]">{produto.descricao}</p>}
          <p data-preco className="fonte-display mt-1 text-base font-bold text-marca">
            {formatarPrecoCentavos(produto.precoCentavos)}
          </p>
          <p data-disponibilidade className="text-[11px] text-marca">
            Disponível
          </p>
        </div>
      </header>

      {aoAdicionar &&
        (grupos.length > 0 ? (
          <MontagemProduto produto={produto} grupos={grupos} aoAdicionar={(opcaoIds, quantidade, observacao) => aoAdicionar(produto, quantidade, opcaoIds, observacao)} />
        ) : (
          <AdicionarAoCarrinho produto={produto} aoAdicionar={(quantidade) => aoAdicionar(produto, quantidade, [], null)} />
        ))}
    </article>
  );
}

/** Quantidade (inteira, de 1 ao limite) antes de adicionar ao carrinho — para produto sem montagem. */
function AdicionarAoCarrinho({ produto, aoAdicionar }: { produto: ProdutoPublico; aoAdicionar: (quantidade: number) => void }) {
  const [quantidade, setQuantidade] = useState(1);
  const limitar = (valor: number) => Math.min(Math.max(Math.trunc(valor), 1), QUANTIDADE_MAXIMA_POR_ITEM);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-jaa border border-borda bg-superficie p-3 shadow-cartao sm:p-4">
      <span className="flex h-10 items-center rounded-jaa-compacto border border-borda">
        <button
          type="button"
          aria-label={`Diminuir quantidade de ${produto.nome}`}
          onClick={() => setQuantidade(limitar(quantidade - 1))}
          className="grid h-9 w-9 place-items-center rounded-jaa-compacto text-conteudo-suave transition-colors hover:bg-realce"
        >
          <IconeMenos />
        </button>
        {/* O campo continua existindo para quem digita um número grande direto. */}
        <label className="sr-only" htmlFor="quantidade-produto">
          Quantidade
        </label>
        <input
          id="quantidade-produto"
          name="quantidadeProduto"
          type="number"
          min={1}
          max={QUANTIDADE_MAXIMA_POR_ITEM}
          value={quantidade}
          onChange={(evento) => setQuantidade(limitar(Number(evento.target.value) || 1))}
          className="w-8 border-none bg-transparent text-center text-sm font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label={`Aumentar quantidade de ${produto.nome}`}
          onClick={() => setQuantidade(limitar(quantidade + 1))}
          className="grid h-9 w-9 place-items-center rounded-jaa-compacto text-conteudo-suave transition-colors hover:bg-realce"
        >
          <IconeMais />
        </button>
      </span>
      <button
        type="button"
        onClick={() => aoAdicionar(quantidade)}
        className="flex h-10 flex-1 items-center justify-center gap-2 rounded-jaa-compacto bg-marca px-4 text-sm font-medium text-marca-conteudo shadow-suave transition-colors hover:bg-marca/90"
      >
        <IconeCesta className="h-4 w-4" />
        Adicionar ao pedido
      </button>
    </div>
  );
}

/**
 * Imagem do produto quando a empresa cadastrou uma; sem ela, um marcador neutro.
 * A administração de imagem é da empresa (features/produtos) — aqui é só leitura.
 */
function ImagemProduto({ url, nome, className }: { url: string | null; nome: string; className: string }) {
  if (!url) {
    return (
      <span aria-hidden data-sem-imagem className={`grid shrink-0 place-items-center rounded-jaa-compacto bg-superficie-suave text-conteudo-suave/60 ${className}`}>
        <IconeImagem className="h-6 w-6" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={nome} loading="lazy" className={`shrink-0 rounded-jaa-compacto border border-borda object-cover ${className}`} />;
}
