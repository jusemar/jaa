import type { Banco } from "@jaa/banco";
import { mensagens, mensagensExcluidasParaIdentidade } from "@jaa/banco/schema";
import type { EstadoMensagem, MensagemRespondida } from "@jaa/contratos";
import { and, desc, eq, getTableColumns, isNull, lt, sql, type SQL } from "drizzle-orm";
import { estadoMensagemSql } from "./estado-mensagem-sql.js";
import { mensagemRespondidaSql, referenciaNaConversaSql } from "./mensagem-respondida-sql.js";

export type MensagemRegistro = typeof mensagens.$inferSelect & {
  estado: EstadoMensagem;
  mensagemRespondida: MensagemRespondida | null;
};

// Colunas da mensagem + dados derivados (estado e referência da resposta), usadas em toda leitura.
export const colunasMensagemCompleta = {
  ...getTableColumns(mensagens),
  estado: estadoMensagemSql(),
  mensagemRespondida: mensagemRespondidaSql(),
};

const CODIGO_VIOLACAO_FK = "23503";

// A FK de resposta recusou a referência (mensagem de outra conversa ou inexistente).
export function ehViolacaoReferenciaResposta(erro: unknown): boolean {
  const causa = erro instanceof Error && erro.cause && typeof erro.cause === "object" ? erro.cause : erro;
  return (
    typeof causa === "object" &&
    causa !== null &&
    "code" in causa &&
    causa.code === CODIGO_VIOLACAO_FK &&
    "constraint" in causa &&
    causa.constraint === "mensagens_mensagem_respondida_fk"
  );
}

// Mensagem não excluída "para mim" pela identidade (usa a PK de mensagens_excluidas_para_identidade).
export function visivelPara(identidadeId: string): SQL {
  return sql`not exists (
    select 1 from ${mensagensExcluidasParaIdentidade}
    where ${mensagensExcluidasParaIdentidade.mensagemId} = ${mensagens.id}
      and ${mensagensExcluidasParaIdentidade.identidadeId} = ${identidadeId}
  )`;
}

// Referência respondível DESTA conversa para a identidade; null se não existir nela, se for de outra
// conversa, se estiver excluída para todos ou excluída para quem responde.
export async function buscarReferenciaNaConversa(
  banco: Banco,
  conversaId: string,
  mensagemId: string,
  identidadeId: string,
): Promise<MensagemRespondida | null> {
  const resultado = await banco.execute<{ referencia: MensagemRespondida }>(referenciaNaConversaSql(conversaId, mensagemId, identidadeId));
  return resultado.rows[0]?.referencia ?? null;
}

/**
 * Insere a mensagem ou, se este remetente já enviou esta mesma tentativa (idCliente),
 * não insere nada e retorna null. Uma única instrução: atômica mesmo com retries simultâneos.
 * Recém-persistida = "enviada": nenhuma confirmação pode existir antes do commit.
 */
export async function inserirMensagemTexto(
  banco: Banco,
  dados: {
    conversaId: string;
    remetenteIdentidadeId: string;
    idCliente: string;
    conteudo: string;
    mensagemRespondida: MensagemRespondida | null;
    operadorUsuarioId?: string | null | undefined;
  },
): Promise<MensagemRegistro | null> {
  const { mensagemRespondida, ...colunas } = dados;
  const [mensagem] = await banco
    .insert(mensagens)
    .values({ ...colunas, tipo: "texto", mensagemRespondidaId: mensagemRespondida?.id ?? null })
    .onConflictDoNothing({ target: [mensagens.remetenteIdentidadeId, mensagens.idCliente] })
    .returning();

  return mensagem ? { ...mensagem, estado: "enviada", mensagemRespondida } : null;
}

export async function buscarMensagemPorIdCliente(
  banco: Banco,
  remetenteIdentidadeId: string,
  idCliente: string,
): Promise<MensagemRegistro | null> {
  const [mensagem] = await banco
    .select(colunasMensagemCompleta)
    .from(mensagens)
    .where(and(eq(mensagens.remetenteIdentidadeId, remetenteIdentidadeId), eq(mensagens.idCliente, idCliente)))
    .limit(1);

  return mensagem ?? null;
}

/**
 * Página de histórico da mais recente para a mais antiga, ordenada por id (UUIDv7).
 * Busca `limite + 1` para saber se há mais sem uma segunda consulta.
 */
export async function listarMensagensDaConversa(
  banco: Banco,
  conversaId: string,
  identidadeId: string,
  { antesDe, limite }: { antesDe?: string | undefined; limite: number },
): Promise<{ mensagens: MensagemRegistro[]; haMais: boolean }> {
  // Mensagens excluídas "para mim" nunca entram na página (o filtro está no SQL, antes do limite).
  const linhas = await banco
    .select(colunasMensagemCompleta)
    .from(mensagens)
    .where(and(eq(mensagens.conversaId, conversaId), antesDe ? lt(mensagens.id, antesDe) : undefined, visivelPara(identidadeId)))
    .orderBy(desc(mensagens.id))
    .limit(limite + 1);

  return { mensagens: linhas.slice(0, limite), haMais: linhas.length > limite };
}

export async function buscarMensagemNaConversa(banco: Banco, conversaId: string, mensagemId: string): Promise<MensagemRegistro | null> {
  const [mensagem] = await banco
    .select(colunasMensagemCompleta)
    .from(mensagens)
    .where(and(eq(mensagens.id, mensagemId), eq(mensagens.conversaId, conversaId)))
    .limit(1);

  return mensagem ?? null;
}

/**
 * Troca o conteúdo de uma mensagem de TEXTO do próprio autor. As condições de autoria, conversa e
 * tipo estão na mesma instrução: mesmo que a verificação anterior fique desatualizada, outra identidade
 * nunca edita. id, criadoEm, remetente e referência de resposta não são tocados.
 * Retorna false se nada foi alterado.
 */
export async function atualizarConteudoMensagem(
  banco: Banco,
  {
    conversaId,
    mensagemId,
    remetenteIdentidadeId,
    conteudo,
    operadorUsuarioId = null,
  }: { conversaId: string; mensagemId: string; remetenteIdentidadeId: string; conteudo: string; operadorUsuarioId?: string | null | undefined },
): Promise<boolean> {
  const atualizadas = await banco
    .update(mensagens)
    .set({ conteudo, editadaEm: sql`greatest(now(), ${mensagens.criadoEm})`, editadaPorUsuarioId: operadorUsuarioId })
    .where(
      and(
        eq(mensagens.id, mensagemId),
        eq(mensagens.conversaId, conversaId),
        eq(mensagens.remetenteIdentidadeId, remetenteIdentidadeId),
        eq(mensagens.tipo, "texto"),
        isNull(mensagens.excluidaParaTodosEm),
      ),
    )
    .returning({ id: mensagens.id });

  return atualizadas.length > 0;
}

export async function estaOcultaPara(banco: Banco, mensagemId: string, identidadeId: string): Promise<boolean> {
  const [linha] = await banco
    .select({ mensagemId: mensagensExcluidasParaIdentidade.mensagemId })
    .from(mensagensExcluidasParaIdentidade)
    .where(and(eq(mensagensExcluidasParaIdentidade.mensagemId, mensagemId), eq(mensagensExcluidasParaIdentidade.identidadeId, identidadeId)))
    .limit(1);
  return linha !== undefined;
}

export async function listarIdentidadesQueOcultaram(banco: Banco, mensagemId: string): Promise<string[]> {
  const linhas = await banco
    .select({ identidadeId: mensagensExcluidasParaIdentidade.identidadeId })
    .from(mensagensExcluidasParaIdentidade)
    .where(eq(mensagensExcluidasParaIdentidade.mensagemId, mensagemId));
  return linhas.map((linha) => linha.identidadeId);
}

/**
 * "Excluir para todos": tombstone (a linha fica; conteúdo apagado). Autoria, conversa e "ainda não
 * excluída" na mesma instrução. Retorna false se nada mudou (não é o autor ou já estava excluída).
 */
export async function marcarExcluidaParaTodos(
  banco: Banco,
  {
    conversaId,
    mensagemId,
    remetenteIdentidadeId,
    operadorUsuarioId = null,
  }: { conversaId: string; mensagemId: string; remetenteIdentidadeId: string; operadorUsuarioId?: string | null | undefined },
): Promise<boolean> {
  const atualizadas = await banco
    .update(mensagens)
    .set({ conteudo: "", excluidaParaTodosEm: sql`greatest(now(), ${mensagens.criadoEm})`, excluidaPorUsuarioId: operadorUsuarioId })
    .where(
      and(
        eq(mensagens.id, mensagemId),
        eq(mensagens.conversaId, conversaId),
        eq(mensagens.remetenteIdentidadeId, remetenteIdentidadeId),
        isNull(mensagens.excluidaParaTodosEm),
      ),
    )
    .returning({ id: mensagens.id });
  return atualizadas.length > 0;
}

// "Excluir para mim". Idempotente (PK + ON CONFLICT). Retorna true só na primeira vez.
export async function ocultarParaIdentidade(
  banco: Banco,
  dados: { conversaId: string; mensagemId: string; identidadeId: string },
): Promise<boolean> {
  const inseridas = await banco
    .insert(mensagensExcluidasParaIdentidade)
    .values(dados)
    .onConflictDoNothing({ target: [mensagensExcluidasParaIdentidade.mensagemId, mensagensExcluidasParaIdentidade.identidadeId] })
    .returning({ mensagemId: mensagensExcluidasParaIdentidade.mensagemId });
  return inseridas.length > 0;
}

// Última mensagem da conversa que a identidade ainda vê (para reconciliar a lista após "excluir para mim").
export async function buscarUltimaMensagemVisivel(banco: Banco, conversaId: string, identidadeId: string): Promise<MensagemRegistro | null> {
  const [mensagem] = await banco
    .select(colunasMensagemCompleta)
    .from(mensagens)
    .where(and(eq(mensagens.conversaId, conversaId), visivelPara(identidadeId)))
    .orderBy(desc(mensagens.id))
    .limit(1);
  return mensagem ?? null;
}
