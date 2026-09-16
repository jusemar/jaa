import type { Banco } from "@jaa/banco";
import { autorizarEmpresa } from "../lib/autorizacao-empresas.js";
import {
  atualizarDadosBasicosEmpresa,
  buscarEmpresaDoUsuario,
  ErroViolacaoUnicaEmpresa,
  type EmpresaDoMembroRegistro,
} from "../repositorios/repositorio-empresas.js";

type ResultadoAtualizarEmpresa =
  | { tipo: "atualizada"; empresa: EmpresaDoMembroRegistro }
  | { tipo: "empresa-nao-encontrada" }
  | { tipo: "slug-indisponivel" };

// Nome e/ou slug. Sem permissão "editar-empresa" (inclusive empresa inexistente) → não encontrada.
export async function atualizarEmpresa(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  dados: { nome?: string | undefined; slug?: string | undefined },
): Promise<ResultadoAtualizarEmpresa> {
  if (!(await autorizarEmpresa(banco, usuarioId, empresaId, "editar-empresa"))) return { tipo: "empresa-nao-encontrada" };

  try {
    await atualizarDadosBasicosEmpresa(banco, empresaId, dados);
  } catch (erro) {
    if (erro instanceof ErroViolacaoUnicaEmpresa && erro.violacao === "slug") return { tipo: "slug-indisponivel" };
    throw erro;
  }

  const empresa = await buscarEmpresaDoUsuario(banco, usuarioId, empresaId);
  return empresa ? { tipo: "atualizada", empresa } : { tipo: "empresa-nao-encontrada" };
}
