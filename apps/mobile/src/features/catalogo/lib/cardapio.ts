import type { CategoriaPublica, ProdutoPublico } from "@jaa/contratos";

/*
 * Regras de APRESENTAÇÃO do cardápio, puras e testáveis: seções, ordem, busca e seção inicial.
 *
 * As categorias são as que a EMPRESA cadastrou (nome e ordem vêm do servidor) — o Jaa não conhece
 * "bebidas", "sobremesas" nem categoria alguma. Produto sem categoria cai em uma seção final, porque
 * esconder produto por falta de organização seria perder venda.
 *
 * O cardápio mostra UMA seção por vez. Não existe "Todos": misturar categorias tirava a função dos
 * chips e deixava a lista longa sem começo nem fim.
 */

export const NOME_SECAO_SEM_CATEGORIA = "Outros";

/*
 * A seção dos produtos sem categoria precisa de uma identidade PRÓPRIA na interface. Usar `null`
 * para isso confundia com "nenhuma seção escolhida" — daí um id explícito, que nunca colide com um
 * uuid de categoria real.
 */
export const ID_SECAO_SEM_CATEGORIA = "sem-categoria";

export interface SecaoCardapio {
  // Identidade da seção na interface; nunca nula.
  id: string;
  // Categoria real da empresa; null na seção dos produtos sem categoria.
  categoriaId: string | null;
  nome: string;
  produtos: ProdutoPublico[];
  /*
   * Esta seção É o montador: tem um produto só e ele é personalizável. Quem decide é o MODELO
   * (a empresa criou a categoria e pôs nela um produto com grupos), não o nome da categoria.
   */
  montagem: boolean;
}

// Busca tolerante: ignora acento e caixa, porque ninguém digita "Pizza Calabresa" com acento certo.
const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Procura no nome E na descrição: "sem lactose" costuma estar só na descrição. */
export function filtrarProdutos(produtos: readonly ProdutoPublico[], busca: string): ProdutoPublico[] {
  const termo = normalizar(busca);
  if (termo === "") return [...produtos];
  return produtos.filter((produto) => normalizar(`${produto.nome} ${produto.descricao ?? ""}`).includes(termo));
}

/**
 * Seções do cardápio, na ordem em que o cliente as vê:
 *
 *  1. a seção de MONTAGEM primeiro, quando existir — é a experiência que a empresa quer oferecer de
 *     entrada, e a que rende mais quando aparece antes da lista comum;
 *  2. depois as categorias na ordem da empresa (`posicao`, empate pelo nome);
 *  3. por último "Outros", os produtos sem categoria.
 *
 * Seção vazia não aparece.
 */
export function montarSecoes(categorias: readonly CategoriaPublica[], produtos: readonly ProdutoPublico[]): SecaoCardapio[] {
  const ordenadas = [...categorias].sort((a, b) => a.posicao - b.posicao || a.nome.localeCompare(b.nome, "pt-BR"));

  const secoes: SecaoCardapio[] = ordenadas.map((categoria) => {
    const daCategoria = produtos.filter((produto) => produto.categoriaId === categoria.id);
    return {
      id: categoria.id,
      categoriaId: categoria.id,
      nome: categoria.nome,
      produtos: daCategoria,
      montagem: ehMontagem(daCategoria),
    };
  });

  /*
   * Produto cuja categoria não veio na lista (foi apagada entre as duas leituras, por exemplo)
   * também entra em "Outros": nenhum produto disponível fica invisível por causa de organização.
   */
  const idsConhecidos = new Set(ordenadas.map((categoria) => categoria.id));
  const semCategoria = produtos.filter((produto) => produto.categoriaId === null || !idsConhecidos.has(produto.categoriaId));
  if (semCategoria.length > 0) {
    // "Outros" nunca é seção de montagem: é o resto, e não uma experiência montada pela empresa.
    secoes.push({ id: ID_SECAO_SEM_CATEGORIA, categoriaId: null, nome: NOME_SECAO_SEM_CATEGORIA, produtos: semCategoria, montagem: false });
  }

  const comProdutos = secoes.filter((secao) => secao.produtos.length > 0);
  // Ordenação estável: a montagem sobe, o resto mantém a ordem da empresa.
  return [...comProdutos.filter((secao) => secao.montagem), ...comProdutos.filter((secao) => !secao.montagem)];
}

/** Uma seção é montador quando tem UM produto só e ele é personalizável. */
function ehMontagem(produtos: readonly ProdutoPublico[]): boolean {
  const unico = produtos.length === 1 ? produtos[0] : undefined;
  return unico?.personalizavel === true;
}

/**
 * Seção que abre selecionada: a de MONTAGEM quando existir; senão a primeira disponível. Como
 * `montarSecoes` já põe a montagem na frente, é sempre a primeira — declarado como função para o
 * motivo ficar explícito e testável.
 */
export function secaoInicial(secoes: readonly SecaoCardapio[]): SecaoCardapio | null {
  return secoes.find((secao) => secao.montagem) ?? secoes[0] ?? null;
}

/** Seção escolhida, ou a inicial quando a escolha não existe mais (categoria apagada, por exemplo). */
export function secaoAtiva(secoes: readonly SecaoCardapio[], escolhida: string | null): SecaoCardapio | null {
  return secoes.find((secao) => secao.id === escolhida) ?? secaoInicial(secoes);
}

/**
 * Produto a montar na seção, quando ela for de montagem. Devolver o produto (e não só um booleano)
 * é o que permite a quem cuida dos dados buscar os grupos dele no servidor.
 */
export function produtoParaMontarNaSecao(secao: SecaoCardapio | null): ProdutoPublico | null {
  return secao?.montagem ? (secao.produtos[0] ?? null) : null;
}
