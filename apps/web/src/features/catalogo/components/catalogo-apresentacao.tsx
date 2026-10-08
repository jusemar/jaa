"use client";

import { QUANTIDADE_MAXIMA_POR_ITEM, type EmpresaPublica, type FuncionamentoPublico, type GrupoOpcoesPublico, type ProdutoPublico } from "@jaa/contratos";
import { useMemo, useState } from "react";
import { APARENCIA_INDISPONIVEL, acaoOuExplicacao } from "@/components/ui/acao-indisponivel";
import { FaixaRolavel } from "@/components/ui/faixa-rolavel";
import { IconeBusca, IconeCesta, IconeFechar, IconeImagem, IconeLoja, IconeMais, IconeMenos, IconeSeta, IconeVoltar } from "@/components/ui/icones";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { filtrarProdutos, secaoAtiva, type SecaoCardapio } from "../lib/cardapio";
import { BotaoIcone } from "@/components/ui/primitivos";
import { FuncionamentoDaEmpresa, temFuncionamentoVisivel } from "./funcionamento-da-empresa";
import { MontagemProduto, type BloqueioDePedido } from "./montagem-produto";

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
  funcionamento,
  bloqueio,
}: {
  empresa: EmpresaPublica;
  // Aberta ou fechada agora + a semana, como o servidor informou. Ausente enquanto não se sabe.
  funcionamento?: FuncionamentoPublico | undefined;
  // Empresa fechada: as ações de pedir ficam com cara de indisponíveis e explicam ao toque.
  bloqueio?: BloqueioDePedido | undefined;
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
  const temEstado = temFuncionamentoVisivel(funcionamento);
  const fechar = aoFechar ? (
    <BotaoIcone aria-label="Fechar cardápio" title="Fechar cardápio" data-fechar-cardapio onClick={aoFechar}>
      <IconeFechar className="h-4 w-4" />
    </BotaoIcone>
  ) : null;

  return (
    // O nome da empresa não é repetido na tela (está no topo da conversa); fica no nome acessível.
    <div role="group" aria-label={`Cardápio de ${empresa.nome}`} className="flex flex-col gap-2">
      {/*
        BARRA DO CARDÁPIO — um bloco só: aberto/fechado, busca e categorias. Não há mais a faixa
        "Cardápio de <empresa>": quem abriu o cardápio já sabe disso, e a empresa está no topo da
        conversa. Fechar continua existindo, como um X discreto no fim da PRIMEIRA linha que houver.
      */}
      {(temEstado || !montagem || secoes.length > 1 || fechar) && (
        <div data-barra-do-cardapio className="flex flex-col gap-1.5 rounded-jaa border border-borda bg-superficie p-1.5 shadow-cartao sm:p-2">
          {/* Primeira coisa que o cliente lê: dá para pedir agora? Se não, quando? */}
          {temEstado && <FuncionamentoDaEmpresa funcionamento={funcionamento} depois={fechar} />}

          {/* Busca no desenho da busca de conversas. No montador ela não aparece: não há lista para filtrar. */}
          {!montagem && (
            <div className="flex items-center gap-1">
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-jaa-compacto bg-superficie-suave px-3 text-conteudo-suave focus-within:ring-2 focus-within:ring-marca/30 sm:min-h-10">
                <span className="sr-only">Buscar no cardápio</span>
                <IconeBusca className="h-4 w-4 shrink-0" />
                <input
                  name="buscaCardapio"
                  type="search"
                  value={busca}
                  placeholder="Buscar no cardápio"
                  autoComplete="off"
                  onChange={(evento) => setBusca(evento.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-conteudo outline-none placeholder:text-conteudo-suave"
                />
              </label>
              {!temEstado && fechar}
            </div>
          )}

          {/*
            Categorias só quando a empresa organizou o cardápio em mais de uma seção. NÃO existe
            "Todos": cada chip troca o conteúdo inteiro abaixo. A faixa rola por dentro (a página não).
          */}
          {secoes.length > 1 && (
            <div className="flex items-center gap-1">
              <FaixaRolavel role="tablist" aria-label="Categorias do cardápio" className="flex min-w-0 flex-1 gap-1.5 px-0.5 pb-0.5">
                {secoes.map((secao) => (
                  <ChipCategoria key={secao.id} ativo={ativa?.id === secao.id} rotulo={secao.nome} aoEscolher={() => aoEscolherSecao(secao.id)} />
                ))}
              </FaixaRolavel>
              {!temEstado && montagem && fechar}
            </div>
          )}

          {/* Sem estado, sem busca e sem categorias (montador de uma empresa sem horário): só o fechar. */}
          {!temEstado && montagem && secoes.length <= 1 && fechar && <div className="flex justify-end">{fechar}</div>}
        </div>
      )}

      {montagem ? (
        /*
          A categoria escolhida É a montagem: o montador ocupa o lugar da lista. `key` inclui a
          contagem de montagens adicionadas, então cada prato começa do zero sem estado de sobra.
        */
        <MontagemProduto
          key={`${montagem.produto.id}-${montagem.chave}`}
          produto={montagem.produto}
          grupos={montagem.grupos}
          bloqueio={aoAdicionar ? bloqueio : undefined}
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
        <section aria-label={ativa?.nome ?? "Produtos"}>
          <ol data-produtos-do-cardapio className="flex flex-col divide-y divide-borda overflow-hidden rounded-jaa border border-borda bg-superficie shadow-cartao">
            {encontrados.map((produto) => (
              <CardProduto
                key={produto.id}
                produto={produto}
                aoVer={aoVer}
                bloqueio={bloqueio}
                {...(aoAdicionar ? { aoAdicionar: (escolhido: ProdutoPublico) => aoAdicionar(escolhido, 1, [], null) } : {})}
              />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function ChipCategoria({ ativo, rotulo, aoEscolher }: { ativo: boolean; rotulo: string; aoEscolher: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativo}
      onClick={aoEscolher}
      // Selecionada = cheia na cor da marca; as outras, numa superfície suave que diz "dá para tocar".
      className={`flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-colors sm:min-h-8 sm:text-xs ${
        ativo ? "bg-marca text-marca-conteudo" : "bg-superficie-suave text-conteudo-suave hover:bg-realce hover:text-conteudo"
      }`}
    >
      {rotulo}
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
  bloqueio,
}: {
  produto: ProdutoPublico;
  bloqueio?: BloqueioDePedido | undefined;
  aoVer: (produto: ProdutoPublico) => void;
  aoAdicionar?: ((produto: ProdutoPublico) => void) | undefined;
}) {
  return (
    <li data-produto-catalogo-id={produto.id} className="flex items-center gap-2 p-2.5 transition-colors hover:bg-superficie-suave sm:gap-3 sm:p-3">
      {/*
        O botão envolve imagem e texto (em vez de `display:contents`, que tira o botão da árvore de
        acessibilidade em alguns navegadores): tocar em qualquer parte da linha abre o produto.
        Ordem de leitura: imagem → nome (até 2 linhas) → descrição (secundária) → preço.
      */}
      <button type="button" onClick={() => aoVer(produto)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <ImagemProduto url={produto.imagemUrl} nome={produto.nome} className="h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span data-nome-do-produto className="line-clamp-2 text-sm font-semibold leading-snug text-conteudo [overflow-wrap:anywhere]">
            {produto.nome}
          </span>
          {produto.descricao && <span className="line-clamp-2 text-xs leading-snug text-conteudo-suave [overflow-wrap:anywhere]">{produto.descricao}</span>}
          <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
            {produto.personalizavel && <span className="text-[11px] text-conteudo-suave">Monte o seu · a partir de</span>}
            <span data-preco className="fonte-display text-[15px] font-bold leading-none text-marca">
              {formatarPrecoCentavos(produto.precoCentavos)}
            </span>
          </span>
        </span>
      </button>

      {aoAdicionar ? (
        produto.personalizavel ? (
          // Montar abre o produto: mesma coluna compacta do "+", em verde claro (não adiciona direto).
          <button
            type="button"
            data-montar-produto
            aria-label={`Montar ${produto.nome}`}
            title="Montar"
            onClick={() => aoVer(produto)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-jaa-compacto bg-marca-suave text-marca-suave-conteudo transition-colors hover:bg-marca-suave/80 sm:h-9 sm:w-9"
          >
            <IconeSeta className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Adicionar ${produto.nome}`}
            data-adicionar-produto
            {...acaoOuExplicacao(bloqueio?.motivo, bloqueio?.aoExplicar, () => aoAdicionar(produto))}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-jaa-compacto bg-marca text-marca-conteudo shadow-suave transition-colors hover:bg-marca/90 sm:h-9 sm:w-9 ${bloqueio ? APARENCIA_INDISPONIVEL : ""}`}
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
  funcionamento,
  bloqueio,
}: {
  empresa: EmpresaPublica;
  funcionamento?: FuncionamentoPublico | undefined;
  bloqueio?: BloqueioDePedido | undefined;
  produto: ProdutoPublico;
  // Vazio = produto comum: adiciona com quantidade, sem montagem.
  grupos: GrupoOpcoesPublico[];
  aoVoltar: () => void;
  aoAdicionar?: ((produto: ProdutoPublico, quantidade: number, opcaoIds: string[], observacao: string | null) => void) | undefined;
}) {
  const voltar = (
    <BotaoIcone aria-label="Voltar ao cardápio" title="Voltar ao cardápio" data-voltar-ao-cardapio onClick={aoVoltar}>
      <IconeVoltar className="h-4 w-4" />
    </BotaoIcone>
  );
  return (
    <article aria-label="Detalhe do produto" className="painel-entrando flex flex-col gap-2 text-sm">
      {/* Uma linha só: voltar ao cardápio e, ao lado, aberto/fechado (com os horários a um toque). */}
      <div data-barra-do-cardapio className="rounded-jaa border border-borda bg-superficie p-1.5 shadow-cartao sm:p-2">
        {temFuncionamentoVisivel(funcionamento) ? (
          <FuncionamentoDaEmpresa funcionamento={funcionamento} antes={voltar} />
        ) : (
          <div className="flex items-center gap-1">
            {voltar}
            <span className="text-sm font-medium text-conteudo-suave">Cardápio</span>
          </div>
        )}
      </div>

      {/* O produto: imagem, nome, descrição e preço. Nada de "Disponível": indisponível nem chega aqui. */}
      <header className="flex gap-3 rounded-jaa border border-borda bg-superficie p-3 shadow-cartao sm:p-4">
        <ImagemProduto url={produto.imagemUrl} nome={produto.nome} className="h-20 w-20 sm:h-24 sm:w-24" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h4 className="fonte-display text-base font-bold leading-snug [overflow-wrap:anywhere]">
            {produto.nome}
            <span className="sr-only">, de {empresa.nome}</span>
          </h4>
          {produto.descricao && <p className="whitespace-pre-wrap text-xs leading-relaxed text-conteudo-suave [overflow-wrap:anywhere]">{produto.descricao}</p>}
          <p data-preco className="fonte-display mt-auto pt-1 text-lg font-bold leading-none text-marca">
            {formatarPrecoCentavos(produto.precoCentavos)}
          </p>
        </div>
      </header>

      {aoAdicionar &&
        (grupos.length > 0 ? (
          <MontagemProduto produto={produto} grupos={grupos} bloqueio={bloqueio} aoAdicionar={(opcaoIds, quantidade, observacao) => aoAdicionar(produto, quantidade, opcaoIds, observacao)} />
        ) : (
          <AdicionarAoCarrinho produto={produto} bloqueio={bloqueio} aoAdicionar={(quantidade) => aoAdicionar(produto, quantidade, [], null)} />
        ))}
    </article>
  );
}

/** Quantidade (inteira, de 1 ao limite) antes de adicionar ao carrinho — para produto sem montagem. */
function AdicionarAoCarrinho({ produto, aoAdicionar, bloqueio }: { produto: ProdutoPublico; aoAdicionar: (quantidade: number) => void; bloqueio?: BloqueioDePedido | undefined }) {
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
        data-adicionar-produto
        {...acaoOuExplicacao(bloqueio?.motivo, bloqueio?.aoExplicar, () => aoAdicionar(quantidade))}
        className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-jaa-compacto bg-marca px-4 text-sm font-medium text-marca-conteudo shadow-suave transition-colors hover:bg-marca/90 ${bloqueio ? APARENCIA_INDISPONIVEL : ""}`}
      >
        <IconeCesta className="h-4 w-4" />
        Adicionar ao pedido
      </button>
      {bloqueio && (
        <p role="status" data-motivo-do-bloqueio className="w-full text-[11px] text-aviso">
          {bloqueio.motivo}
        </p>
      )}
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
