import type { Banco } from "@jaa/banco";
import { sql } from "drizzle-orm";

/**
 * LIMITE DE USO por janela fixa, para rotas do Jaa fora do Better Auth (ex.: envio de imagem).
 *
 * Reaproveita a tabela `rate_limits`, onde o rate limit do Better Auth já vive persistido no
 * PostgreSQL: o limite sobrevive a reinícios e vale entre instâncias da API, sem Redis nem dependência
 * nova. A estrutura da tabela NÃO é alterada; as chaves do Jaa usam o prefixo `jaa:`, que nunca
 * colide com as do Better Auth (estas começam pelo IP do cliente).
 *
 * A contagem é UMA instrução atômica (`insert ... on conflict do update`): requisições simultâneas
 * não conseguem "passar juntas" pela mesma vaga. `last_request` guarda o INÍCIO da janela.
 */
export interface RegraLimiteDeUso {
  janelaSegundos: number;
  maximo: number;
}

export type ResultadoLimiteDeUso = { permitido: true } | { permitido: false; tenteNovamenteEmSegundos: number };

export async function consumirLimiteDeUso(
  banco: Banco,
  chave: string,
  regra: RegraLimiteDeUso,
  agoraMs: number = Date.now(),
): Promise<ResultadoLimiteDeUso> {
  const janelaMs = regra.janelaSegundos * 1000;
  const resultado = await banco.execute<{ contagem: number; inicio: string }>(sql`
    insert into rate_limits (id, key, count, last_request)
    values (gen_random_uuid()::text, ${`jaa:${chave}`}, 1, ${agoraMs})
    on conflict (key) do update set
      count = case when rate_limits.last_request <= ${agoraMs - janelaMs} then 1 else rate_limits.count + 1 end,
      last_request = case when rate_limits.last_request <= ${agoraMs - janelaMs} then ${agoraMs} else rate_limits.last_request end
    returning count as contagem, last_request as inicio
  `);

  const linha = resultado.rows[0];
  if (!linha) throw new Error("Contagem de limite de uso não retornou registro.");
  if (linha.contagem <= regra.maximo) return { permitido: true };

  const restanteMs = Number(linha.inicio) + janelaMs - agoraMs;
  return { permitido: false, tenteNovamenteEmSegundos: Math.max(1, Math.ceil(restanteMs / 1000)) };
}
