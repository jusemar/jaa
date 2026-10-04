import type { Banco } from "@jaa/banco";
import type { IdentidadeOperavel } from "@jaa/contratos";
import { autorizarIdentidadeEmpresarial } from "../../empresas/lib/autorizacao-empresas.js";
import { listarEmpresasDoUsuario } from "../../empresas/repositorios/repositorio-empresas.js";
import { buscarChavesDeFoto, buscarIdentidadePessoalDoUsuario } from "../repositorios/repositorio-identidades.js";

type SemFoto<T> = T extends unknown ? Omit<T, "fotoUrl"> : never;

/**
 * Identidade operável SEM a foto: é o que a autorização precisa (id e tipo) e o que roda a cada
 * requisição agindo como empresa. A foto só é buscada quando a lista vai para a tela (`comFotos`).
 */
export type IdentidadeOperavelRegistro = SemFoto<IdentidadeOperavel>;

/**
 * "Quais identidades esta CONTA pode operar?" e "pode operar ESTA?", decididas só no servidor.
 * - pessoal: a identidade pessoal da própria conta;
 * - empresarial: identidades de empresas em que a conta tem a permissão de operar (via autorizacao-empresas).
 * Escolher uma identidade no cliente é intenção; ações futuras em nome dela devem chamar
 * `autorizarOperacaoIdentidade` antes de agir.
 */
export async function listarIdentidadesOperaveis(banco: Banco, usuarioId: string): Promise<IdentidadeOperavelRegistro[]> {
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

export async function autorizarOperacaoIdentidade(banco: Banco, usuarioId: string, identidadeId: string): Promise<IdentidadeOperavelRegistro | null> {
  const pessoal = await buscarIdentidadePessoalDoUsuario(banco, usuarioId);
  if (pessoal?.id === identidadeId) {
    return { tipo: "pessoal", identidadeId: pessoal.id, nomeExibicao: pessoal.nomeExibicao, nomeUsuario: pessoal.nomeUsuario };
  }
  const acesso = await autorizarIdentidadeEmpresarial(banco, usuarioId, identidadeId);
  if (!acesso) return null;
  return (await listarIdentidadesOperaveis(banco, usuarioId)).find((identidade) => identidade.identidadeId === identidadeId) ?? null;
}

/**
 * Acrescenta a foto (avatar/logo) às identidades OPERÁVEIS, para o seletor "Agindo como". São da
 * própria conta — pessoal dela ou empresa que ela opera —, então a privacidade de terceiros não se aplica.
 */
export async function comFotos(
  banco: Banco,
  operaveis: readonly IdentidadeOperavelRegistro[],
  urlPublica: (chave: string) => string | null,
): Promise<IdentidadeOperavel[]> {
  const chaves = await buscarChavesDeFoto(banco, operaveis.map((identidade) => identidade.identidadeId));
  return operaveis.map((identidade) => {
    const chave = chaves.get(identidade.identidadeId);
    return { ...identidade, fotoUrl: chave ? urlPublica(chave) : null };
  });
}
