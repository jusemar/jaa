import type { Banco } from "@jaa/banco";
import type { PapelMembroEmpresa } from "@jaa/contratos";
import { buscarEmpresaDaIdentidade, buscarPapelDoUsuarioNaEmpresa } from "../repositorios/repositorio-empresas.js";

/**
 * Ponto ÚNICO de autorização empresarial: "esta conta pode fazer X nesta empresa?".
 * Rotas e casos de uso pedem uma PERMISSÃO; nunca comparam dono/usuarioId diretamente.
 * Novos papéis (administrador, atendente, funcionário, entregador) só acrescentam linhas à tabela
 * abaixo. O cliente não informa papel, dono nem slug para autorizar: tudo vem do vínculo persistido.
 */
export type PermissaoEmpresa =
  | "ver-empresa"
  | "editar-empresa"
  | "operar-identidade-empresarial"
  // Produtos: ver/gerenciar dados comerciais; disponibilidade separada (ex.: futuro atendente).
  | "ver-produtos"
  | "gerenciar-produtos"
  | "alterar-disponibilidade-produto";

const PERMISSOES_POR_PAPEL: Record<PapelMembroEmpresa, ReadonlySet<PermissaoEmpresa>> = {
  proprietario: new Set([
    "ver-empresa",
    "editar-empresa",
    "operar-identidade-empresarial",
    "ver-produtos",
    "gerenciar-produtos",
    "alterar-disponibilidade-produto",
  ]),
};

export function papelPermite(papel: PapelMembroEmpresa, permissao: PermissaoEmpresa): boolean {
  return PERMISSOES_POR_PAPEL[papel].has(permissao);
}

export type AcessoEmpresa = { empresaId: string; papel: PapelMembroEmpresa };

// null = sem acesso OU empresa inexistente (quem chama responde 404, sem revelar a diferença).
export async function autorizarEmpresa(
  banco: Banco,
  usuarioId: string,
  empresaId: string,
  permissao: PermissaoEmpresa,
): Promise<AcessoEmpresa | null> {
  const papel = await buscarPapelDoUsuarioNaEmpresa(banco, usuarioId, empresaId);
  return papel && papelPermite(papel, permissao) ? { empresaId, papel } : null;
}

// A conta pode agir como esta identidade EMPRESARIAL? (identidade pessoal: ver autorizacao-identidades)
export async function autorizarIdentidadeEmpresarial(banco: Banco, usuarioId: string, identidadeId: string): Promise<AcessoEmpresa | null> {
  const empresaId = await buscarEmpresaDaIdentidade(banco, identidadeId);
  return empresaId ? autorizarEmpresa(banco, usuarioId, empresaId, "operar-identidade-empresarial") : null;
}
