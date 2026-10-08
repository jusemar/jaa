import type { DisponibilidadeProduto, Produto } from "@jaa/contratos";
import { IconeEtiqueta, IconeImagem, IconeSeta, IconeVoltar } from "@/components/ui/icones";
import { MenuMais } from "@/components/ui/menu-mais";
import { Botao, BotaoIcone, EstadoVazio, Selo } from "@/components/ui/primitivos";
import { formatarPrecoCentavos } from "../lib/precos";

/*
 * LISTA de produtos do catálogo: só apresenta e avisa quem clicou no quê. Componente puro, o que
 * permite testá-lo renderizando para string, sem navegador.
 *
 * Composição de cada item (a da referência aprovada, pensada primeiro para o celular):
 *
 *   [imagem]  Nome do produto                     R$ 24,90  ⋮
 *             Descrição, em até duas linhas
 *             🏷 Categoria
 *
 * O nome em cima, a descrição logo abaixo, a categoria discreta por último; o preço, menor, no canto
 * direito, à esquerda dos três pontos verticais. Não há botão nem texto de ação no item: tocar nele
 * abre a edição, e o menu ⋮ guarda "Editar" e a troca de disponibilidade.
 *
 * DISPONÍVEL é o estado normal e não ganha selo. Só a exceção aparece: produto indisponível tem um
 * selo discreto e o item esmaecido.
 *
 * Em telas largas (`lg`) os mesmos cartões ficam em duas colunas, em vez de esticar a lista.
 */

export const ROTULO_DISPONIBILIDADE: Record<DisponibilidadeProduto, string> = { disponivel: "Disponível", indisponivel: "Indisponível" };

export interface Paginacao {
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
}

export function ListaProdutos({
  produtos,
  aoEditar,
  aoAlternarDisponibilidade,
  aoNovo,
}: {
  produtos: Produto[];
  aoEditar: (produto: Produto) => void;
  aoAlternarDisponibilidade: (produto: Produto) => void;
  aoNovo?: () => void;
}) {
  if (produtos.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum produto por aqui"
        descricao="Cadastre o primeiro produto do catálogo ou ajuste os filtros da busca."
        acao={aoNovo ? <Botao onClick={aoNovo}>Novo produto</Botao> : undefined}
      />
    );
  }

  return (
    <ol aria-label="Produtos" data-lista-de-produtos className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
      {produtos.map((produto) => {
        const disponivel = produto.disponibilidade === "disponivel";
        return (
          <li
            key={produto.id}
            data-produto-id={produto.id}
            data-disponibilidade={produto.disponibilidade}
            className="flex items-start rounded-jaa border border-borda bg-superficie py-2 pl-2 pr-0.5 transition-colors hover:bg-superficie-suave sm:py-2.5 sm:pl-2.5"
          >
            {/* O item inteiro abre a edição: é o gesto natural no celular (o menu ⋮ também tem "Editar"). */}
            <button type="button" data-abrir-produto title="Editar" onClick={() => aoEditar(produto)} className="flex min-w-0 flex-1 items-start gap-2.5 rounded-jaa-compacto pr-2 text-left min-[380px]:gap-3">
              <Miniatura produto={produto} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
                <span data-nome-do-produto className={`line-clamp-2 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere] ${disponivel ? "text-conteudo" : "text-conteudo-suave"}`}>
                  {produto.nome}
                </span>
                {produto.descricao && (
                  <span data-descricao className="line-clamp-2 text-[13px] leading-snug text-conteudo-suave [overflow-wrap:anywhere]">
                    {produto.descricao}
                  </span>
                )}
                {(produto.categoriaNome || !disponivel) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {produto.categoriaNome && (
                      <span data-categoria className="flex min-w-0 items-center gap-1 text-xs text-conteudo-suave">
                        <IconeEtiqueta className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{produto.categoriaNome}</span>
                      </span>
                    )}
                    {/* Só a exceção é dita: disponível é o normal e não precisa de selo. */}
                    {!disponivel && (
                      <span data-rotulo-disponibilidade>
                        <Selo tom="atencao">{ROTULO_DISPONIBILIDADE.indisponivel}</Selo>
                      </span>
                    )}
                  </span>
                )}
              </span>
              {/* Preço no canto direito, menor que o nome, colado aos três pontos. */}
              <span data-preco className={`shrink-0 whitespace-nowrap py-0.5 pl-1 text-sm font-semibold leading-snug ${disponivel ? "text-conteudo" : "text-conteudo-suave"}`}>
                {formatarPrecoCentavos(produto.precoCentavos)}
              </span>
            </button>

            <div data-acoes-do-produto className="-ml-2 -mt-2 shrink-0 sm:-mt-1.5">
              <MenuMais
                vertical
                rotulo={`Ações de ${produto.nome}`}
                itens={[
                  { id: "editar", rotulo: "Editar", aoEscolher: () => aoEditar(produto) },
                  {
                    id: "alternar-disponibilidade",
                    rotulo: disponivel ? "Marcar indisponível" : "Tornar disponível",
                    aoEscolher: () => aoAlternarDisponibilidade(produto),
                  },
                ]}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Miniatura({ produto }: { produto: Produto }) {
  // Produto indisponível: a imagem esmaece. O nome continua legível e o selo diz a situação.
  const apagada = produto.disponibilidade === "indisponivel" ? "opacity-60" : "";
  if (!produto.imagemUrl) {
    return (
      <span aria-hidden data-sem-imagem className={`grid h-16 w-16 min-[380px]:h-[4.5rem] min-[380px]:w-[4.5rem] shrink-0 place-items-center rounded-jaa-compacto bg-superficie-suave text-conteudo-suave ${apagada}`}>
        <IconeImagem className="h-5 w-5" />
      </span>
    );
  }
  // <img> puro: a imagem vem do armazenamento de arquivos do Jaa e já sai dimensionada de lá.
  // alt vazio porque o nome do produto está ao lado — leitor de tela não deve repetir.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={produto.imagemUrl} alt="" className={`h-16 w-16 min-[380px]:h-[4.5rem] min-[380px]:w-[4.5rem] shrink-0 rounded-jaa-compacto object-cover ${apagada}`} />;
}

/**
 * Paginação compacta: "1–20 de 45 produtos" e, quando há mais de uma página, ‹ 2 / 3 ›.
 * Com uma página só não existe para onde ir: os botões nem aparecem.
 */
export function ControlePaginacao({ paginacao, aoTrocar }: { paginacao: Paginacao; aoTrocar: (pagina: number) => void }) {
  if (paginacao.total === 0) return null;
  const primeiro = (paginacao.pagina - 1) * paginacao.limite + 1;
  const ultimo = Math.min(paginacao.pagina * paginacao.limite, paginacao.total);
  const variasPaginas = paginacao.totalPaginas > 1;

  return (
    <nav aria-label="Páginas de produtos" className="flex min-h-9 items-center justify-between gap-3 px-1.5 sm:px-0">
      <p aria-live="polite" className="text-xs text-conteudo-suave">
        {variasPaginas ? `${primeiro}–${ultimo} de ${paginacao.total} produtos` : `${paginacao.total} produto${paginacao.total === 1 ? "" : "s"}`}
      </p>
      {variasPaginas && (
        <div data-paginas className="flex items-center gap-1">
          <BotaoIcone aria-label="Página anterior" title="Página anterior" data-pagina-anterior disabled={paginacao.pagina <= 1} onClick={() => aoTrocar(paginacao.pagina - 1)}>
            <IconeVoltar className="h-4 w-4" />
          </BotaoIcone>
          <span data-pagina-atual aria-label={`Página ${paginacao.pagina} de ${paginacao.totalPaginas}`} className="min-w-12 text-center text-sm font-medium tabular-nums text-conteudo">
            {paginacao.pagina} <span className="text-conteudo-suave">/ {paginacao.totalPaginas}</span>
          </span>
          <BotaoIcone aria-label="Próxima página" title="Próxima página" data-pagina-proxima disabled={paginacao.pagina >= paginacao.totalPaginas} onClick={() => aoTrocar(paginacao.pagina + 1)}>
            <IconeSeta className="h-4 w-4" />
          </BotaoIcone>
        </div>
      )}
    </nav>
  );
}
