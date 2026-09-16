import type { EmpresaPublica, ProdutoPublico } from "@jaa/contratos";
import type { ProdutoRegistro } from "../../produtos/repositorios/repositorio-produtos.js";
import type { EmpresaPublicaRegistro } from "../repositorios/repositorio-empresas-publicas.js";

// Campos escolhidos um a um: nada de empresaId interno, conta, membros, permissões ou datas administrativas.
export function serializarEmpresaPublica(empresa: EmpresaPublicaRegistro): EmpresaPublica {
  return { identidadeId: empresa.identidadeId, nome: empresa.nome, nomeUsuario: empresa.nomeUsuario, slug: empresa.slug };
}

export function serializarProdutoPublico(produto: ProdutoRegistro): ProdutoPublico {
  if (produto.disponibilidade !== "disponivel") throw new Error("Produto indisponível não pertence à consulta de cliente.");
  return { id: produto.id, nome: produto.nome, descricao: produto.descricao, precoCentavos: produto.precoCentavos, disponibilidade: "disponivel" };
}
