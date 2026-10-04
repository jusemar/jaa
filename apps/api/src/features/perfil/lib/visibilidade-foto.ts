import type { Banco } from "@jaa/banco";
import { contatos, excecoesPrivacidade, identidades, preferenciasIdentidade } from "@jaa/banco/schema";
import { podeVer } from "@jaa/contratos";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { PREFERENCIAS_PADRAO } from "../repositorios/repositorio-perfil.js";

/**
 * Monta o endereço público a partir da CHAVE gravada (ex.: `armazenamento.urlPublica`). Recebido por
 * parâmetro para que perfil e listas não dependam de provedor de arquivos.
 */
export type MontarUrlPublica = (chave: string) => string | null;

/**
 * FOTO VISÍVEL de várias identidades para UM observador, de uma vez (sem N+1).
 *
 * É a MESMA regra do perfil público (`podeVer`, decidida pelo DONO da foto): `visibilidadeFoto` +
 * "o dono me tem na agenda dele" + exceção do dono para mim. Quem não pode ver recebe `null` — a URL
 * nunca chega ao cliente para ser escondida lá. A própria identidade sempre vê a própria foto.
 *
 * Devolve só identidades que TÊM foto e podem vê-la; para as demais, `fotoVisivel` resolve `null`.
 */
export async function resolverFotosVisiveis(
  banco: Banco,
  observadorId: string,
  identidadeIds: readonly string[],
  urlPublica: MontarUrlPublica,
): Promise<Map<string, string>> {
  const ids = [...new Set(identidadeIds)];
  const fotos = new Map<string, string>();
  if (ids.length === 0) return fotos;

  const linhas = await banco
    .select({
      identidadeId: identidades.id,
      fotoChave: identidades.fotoChave,
      visibilidadeFoto: preferenciasIdentidade.visibilidadeFoto,
      // "Contato" na regra é a agenda do DONO: ele salvou o observador.
      contatoDoDono: contatos.contatoIdentidadeId,
      excecao: excecoesPrivacidade.decisao,
    })
    .from(identidades)
    .leftJoin(preferenciasIdentidade, eq(preferenciasIdentidade.identidadeId, identidades.id))
    .leftJoin(contatos, and(eq(contatos.identidadeId, identidades.id), eq(contatos.contatoIdentidadeId, observadorId)))
    .leftJoin(excecoesPrivacidade, and(eq(excecoesPrivacidade.identidadeId, identidades.id), eq(excecoesPrivacidade.alvoIdentidadeId, observadorId)))
    .where(and(inArray(identidades.id, ids), isNotNull(identidades.fotoChave)));

  for (const linha of linhas) {
    if (!linha.fotoChave) continue;
    const visivel =
      linha.identidadeId === observadorId ||
      podeVer({
        visibilidade: linha.visibilidadeFoto ?? PREFERENCIAS_PADRAO.visibilidadeFoto,
        ehContato: linha.contatoDoDono !== null,
        excecao: linha.excecao,
      });
    const url = visivel ? urlPublica(linha.fotoChave) : null;
    if (url) fotos.set(linha.identidadeId, url);
  }
  return fotos;
}

/** Acrescenta `fotoUrl` (já filtrada pela privacidade) a identidades públicas, preservando a ordem. */
export async function comFotosVisiveis<T extends { identidadeId: string }>(
  banco: Banco,
  observadorId: string,
  itens: readonly T[],
  urlPublica: MontarUrlPublica,
): Promise<(T & { fotoUrl: string | null })[]> {
  const fotos = await resolverFotosVisiveis(banco, observadorId, itens.map((item) => item.identidadeId), urlPublica);
  return itens.map((item) => ({ ...item, fotoUrl: fotos.get(item.identidadeId) ?? null }));
}
