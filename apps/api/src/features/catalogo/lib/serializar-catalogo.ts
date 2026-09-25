import type { CategoriaPublica, EmpresaPublica, ProdutoPublico } from "@jaa/contratos";
import type { CategoriaComContagem } from "../../produtos/repositorios/repositorio-categorias.js";
import type { ProdutoRegistro } from "../../produtos/repositorios/repositorio-produtos.js";
import type { EmpresaPublicaRegistro } from "../repositorios/repositorio-empresas-publicas.js";

// Campos escolhidos um a um: nada de empresaId interno, conta, membros, permissões ou datas administrativas.
export function serializarEmpresaPublica(empresa: EmpresaPublicaRegistro): EmpresaPublica {
  return { identidadeId: empresa.identidadeId, nome: empresa.nome, nomeUsuario: empresa.nomeUsuario, slug: empresa.slug };
}

// A contagem administrativa de produtos por categoria não é assunto do cliente: fica fora.
export function serializarCategoriaPublica(categoria: CategoriaComContagem): CategoriaPublica {
  return { id: categoria.id, nome: categoria.nome, posicao: categoria.posicao };
}

/**
 * Produto na visão de CLIENTE. A imagem sai como URL pública montada na LEITURA a partir da chave
 * gravada (o banco guarda chave, nunca URL), exatamente como na visão administrativa.
 */
export function serializarProdutoPublico(
  produto: ProdutoRegistro,
  opcoes: { urlPublica?: ((chave: string) => string | null) | undefined; personalizavel?: boolean | undefined } = {},
): ProdutoPublico {
  if (produto.disponibilidade !== "disponivel") throw new Error("Produto indisponível não pertence à consulta de cliente.");
  const urlPublica = opcoes.urlPublica ?? (() => null);
  return {
    id: produto.id,
    nome: produto.nome,
    descricao: produto.descricao,
    precoCentavos: produto.precoCentavos,
    disponibilidade: "disponivel",
    categoriaId: produto.categoriaId,
    imagemUrl: produto.imagemChave ? urlPublica(produto.imagemChave) : null,
    personalizavel: opcoes.personalizavel ?? false,
  };
}
