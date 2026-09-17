import type { DisponibilidadeProduto, Produto } from "@jaa/contratos";
import { Botao, Cartao, EstadoVazio, Selo } from "@/components/ui/primitivos";
import { formatarPrecoCentavos } from "../lib/precos";

/*
 * LISTA de produtos: só apresenta e avisa quem clicou no quê. Componente puro, o que permite
 * testá-lo renderizando para string, sem navegador.
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
    <Cartao>
      <ol aria-label="Produtos" className="flex flex-col divide-y divide-borda">
        {produtos.map((produto) => (
          <li key={produto.id} data-produto-id={produto.id} data-disponibilidade={produto.disponibilidade} className="flex items-start gap-3 p-3">
            <Miniatura produto={produto} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className={`min-w-0 truncate text-sm font-medium ${produto.disponibilidade === "indisponivel" ? "text-conteudo-suave" : ""}`}>{produto.nome}</span>
                {produto.categoriaNome && <Selo>{produto.categoriaNome}</Selo>}
              </span>
              {produto.descricao && <span className="line-clamp-2 whitespace-pre-wrap text-xs text-conteudo-suave [overflow-wrap:anywhere]">{produto.descricao}</span>}
              <span data-preco className="text-sm font-semibold">
                {formatarPrecoCentavos(produto.precoCentavos)}
              </span>
              <span data-rotulo-disponibilidade className={`text-xs ${produto.disponibilidade === "disponivel" ? "text-marca" : "text-aviso"}`}>
                {ROTULO_DISPONIBILIDADE[produto.disponibilidade]}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <Botao aparencia="secundario" onClick={() => aoEditar(produto)}>
                Editar
              </Botao>
              <Botao aparencia="discreto" onClick={() => aoAlternarDisponibilidade(produto)}>
                {produto.disponibilidade === "disponivel" ? "Marcar indisponível" : "Marcar disponível"}
              </Botao>
            </span>
          </li>
        ))}
      </ol>
    </Cartao>
  );
}

function Miniatura({ produto }: { produto: Produto }) {
  if (!produto.imagemUrl) {
    return (
      <span aria-hidden data-sem-imagem className="flex h-14 w-14 shrink-0 items-center justify-center rounded-jaa bg-superficie-suave text-lg text-conteudo-suave">
        📦
      </span>
    );
  }
  // <img> puro: a imagem vem do armazenamento de arquivos do Jaa e já sai dimensionada de lá.
  // alt vazio porque o nome do produto está ao lado — leitor de tela não deve repetir.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={produto.imagemUrl} alt="" className="h-14 w-14 shrink-0 rounded-jaa object-cover" />;
}

/** Paginação simples: a empresa quer saber onde está e ir para a próxima página. */
export function ControlePaginacao({ paginacao, aoTrocar }: { paginacao: Paginacao; aoTrocar: (pagina: number) => void }) {
  if (paginacao.total === 0) return null;
  const primeiro = (paginacao.pagina - 1) * paginacao.limite + 1;
  const ultimo = Math.min(paginacao.pagina * paginacao.limite, paginacao.total);

  return (
    <nav aria-label="Páginas de produtos" className="flex flex-wrap items-center justify-between gap-2">
      <p aria-live="polite" className="text-xs text-conteudo-suave">
        {primeiro}–{ultimo} de {paginacao.total} produto{paginacao.total === 1 ? "" : "s"}
      </p>
      <span className="flex items-center gap-2">
        <Botao aparencia="secundario" data-pagina-anterior disabled={paginacao.pagina <= 1} onClick={() => aoTrocar(paginacao.pagina - 1)}>
          Anterior
        </Botao>
        <span className="text-xs text-conteudo-suave">
          Página {paginacao.pagina} de {paginacao.totalPaginas}
        </span>
        <Botao aparencia="secundario" data-pagina-proxima disabled={paginacao.pagina >= paginacao.totalPaginas} onClick={() => aoTrocar(paginacao.pagina + 1)}>
          Próxima
        </Botao>
      </span>
    </nav>
  );
}
