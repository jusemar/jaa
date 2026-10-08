import type { Banco } from "@jaa/banco";
import { MAXIMO_EMPRESAS_CRIADAS_POR_CONTA } from "@jaa/contratos";
import {
  buscarEmpresaDoUsuario,
  ErroLimiteDeEmpresas,
  ErroViolacaoUnicaEmpresa,
  inserirEmpresaComProprietario,
  listarEmpresasDoUsuario,
  type EmpresaDoMembroRegistro,
} from "../repositorios/repositorio-empresas.js";

type ResultadoCriarEmpresa =
  | { tipo: "criada" | "ja-existente"; empresa: EmpresaDoMembroRegistro }
  | { tipo: "slug-indisponivel" }
  | { tipo: "nome-usuario-indisponivel" }
  | { tipo: "limite-de-empresas" };

/**
 * Cria empresa + identidade empresarial + vínculo de PROPRIETÁRIO para a conta da sessão, atomicamente.
 * Idempotente para retry: se esta mesma conta já criou exatamente esta empresa (mesmos slug, @usuario
 * e nome), devolve a existente em vez de conflito. A unicidade final é do banco, inclusive sob concorrência.
 *
 * LIMITE: cada conta CRIA no máximo `MAXIMO_EMPRESAS_CRIADAS_POR_CONTA` empresa(s) — contam as de que
 * ela é proprietária; participar de outras por vínculo não conta. Repetir a MESMA criação continua
 * devolvendo a empresa já criada (retry não vira "limite atingido").
 */
export async function criarEmpresa(
  banco: Banco,
  usuarioId: string,
  entrada: { nome: string; nomeUsuario: string; slug: string },
  maximoCriadas: number = MAXIMO_EMPRESAS_CRIADAS_POR_CONTA,
): Promise<ResultadoCriarEmpresa> {
  const repetida = (empresa: EmpresaDoMembroRegistro) => empresa.slug === entrada.slug && empresa.nomeUsuario === entrada.nomeUsuario && empresa.nome === entrada.nome;
  try {
    const empresaId = await inserirEmpresaComProprietario(banco, { usuarioId, ...entrada }, { maximoCriadas });
    const empresa = await buscarEmpresaDoUsuario(banco, usuarioId, empresaId);
    if (!empresa) throw new Error("Empresa criada não encontrada para o proprietário.");
    return { tipo: "criada", empresa };
  } catch (erro) {
    if (!(erro instanceof ErroViolacaoUnicaEmpresa) && !(erro instanceof ErroLimiteDeEmpresas)) throw erro;

    const existente = (await listarEmpresasDoUsuario(banco, usuarioId)).find(repetida);
    if (existente) return { tipo: "ja-existente", empresa: existente };
    if (erro instanceof ErroLimiteDeEmpresas) return { tipo: "limite-de-empresas" };
    return { tipo: erro.violacao === "slug" ? "slug-indisponivel" : "nome-usuario-indisponivel" };
  }
}
