import type { Banco } from "@jaa/banco";
import type { IdentidadeOperavel } from "@jaa/contratos";
import { autorizarIdentidadeEmpresarial } from "../../empresas/lib/autorizacao-empresas.js";
import { listarEmpresasDoUsuario } from "../../empresas/repositorios/repositorio-empresas.js";
import { buscarIdentidadePessoalDoUsuario } from "../repositorios/repositorio-identidades.js";

/**
 * "Quais identidades esta CONTA pode operar?" e "pode operar ESTA?", decididas só no servidor.
 * - pessoal: a identidade pessoal da própria conta;
 * - empresarial: identidades de empresas em que a conta tem a permissão de operar (via autorizacao-empresas).
 * Escolher uma identidade no cliente é intenção; ações futuras em nome dela devem chamar
 * `autorizarOperacaoIdentidade` antes de agir.
 */
export async function listarIdentidadesOperaveis(banco: Banco, usuarioId: string): Promise<IdentidadeOperavel[]> {
  const pessoal = await buscarIdentidadePessoalDoUsuario(banco, usuarioId);
  const empresas = await listarEmpresasDoUsuario(banco, usuarioId);
  return [
    ...(pessoal ? [{ tipo: "pessoal" as const, identidadeId: pessoal.id, nomeExibicao: pessoal.nomeExibicao, nomeUsuario: pessoal.nomeUsuario }] : []),
    ...empresas.map((empresa) => ({
      tipo: "empresarial" as const,
      identidadeId: empresa.identidadeId,
      nomeExibicao: empresa.nome,
      nomeUsuario: empresa.nomeUsuario,
      empresa: { id: empresa.id, slug: empresa.slug, papel: empresa.papel },
    })),
  ];
}

export async function autorizarOperacaoIdentidade(banco: Banco, usuarioId: string, identidadeId: string): Promise<IdentidadeOperavel | null> {
  const pessoal = await buscarIdentidadePessoalDoUsuario(banco, usuarioId);
  if (pessoal?.id === identidadeId) {
    return { tipo: "pessoal", identidadeId: pessoal.id, nomeExibicao: pessoal.nomeExibicao, nomeUsuario: pessoal.nomeUsuario };
  }
  const acesso = await autorizarIdentidadeEmpresarial(banco, usuarioId, identidadeId);
  if (!acesso) return null;
  return (await listarIdentidadesOperaveis(banco, usuarioId)).find((identidade) => identidade.identidadeId === identidadeId) ?? null;
}
