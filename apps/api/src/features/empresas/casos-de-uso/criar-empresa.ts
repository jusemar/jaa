import type { Banco } from "@jaa/banco";
import {
  buscarEmpresaDoUsuario,
  ErroViolacaoUnicaEmpresa,
  inserirEmpresaComProprietario,
  listarEmpresasDoUsuario,
  type EmpresaDoMembroRegistro,
} from "../repositorios/repositorio-empresas.js";

type ResultadoCriarEmpresa =
  | { tipo: "criada" | "ja-existente"; empresa: EmpresaDoMembroRegistro }
  | { tipo: "slug-indisponivel" }
  | { tipo: "nome-usuario-indisponivel" };

/**
 * Cria empresa + identidade empresarial + vínculo de PROPRIETÁRIO para a conta da sessão, atomicamente.
 * Idempotente para retry: se esta mesma conta já criou exatamente esta empresa (mesmos slug, @usuario
 * e nome), devolve a existente em vez de conflito. A unicidade final é do banco, inclusive sob concorrência.
 */
export async function criarEmpresa(
  banco: Banco,
  usuarioId: string,
  entrada: { nome: string; nomeUsuario: string; slug: string },
): Promise<ResultadoCriarEmpresa> {
  try {
    const empresaId = await inserirEmpresaComProprietario(banco, { usuarioId, ...entrada });
    const empresa = await buscarEmpresaDoUsuario(banco, usuarioId, empresaId);
    if (!empresa) throw new Error("Empresa criada não encontrada para o proprietário.");
    return { tipo: "criada", empresa };
  } catch (erro) {
    if (!(erro instanceof ErroViolacaoUnicaEmpresa)) throw erro;

    const repetida = (await listarEmpresasDoUsuario(banco, usuarioId)).find(
      (empresa) => empresa.slug === entrada.slug && empresa.nomeUsuario === entrada.nomeUsuario && empresa.nome === entrada.nome,
    );
    if (repetida) return { tipo: "ja-existente", empresa: repetida };
    return { tipo: erro.violacao === "slug" ? "slug-indisponivel" : "nome-usuario-indisponivel" };
  }
}
