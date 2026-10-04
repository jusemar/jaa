import type { Banco } from "@jaa/banco";
import { anexosMensagem, mensagens, mensagensExcluidasParaIdentidade } from "@jaa/banco/schema";
import type { AnexoMensagem, EstadoMensagem, MensagemRespondida, ResumoPedido, TipoAudioAceito } from "@jaa/contratos";
import { and, desc, eq, getTableColumns, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { resumoPedidoSql } from "../../pedidos/repositorios/resumo-pedido-sql.js";
import { estadoMensagemSql } from "./estado-mensagem-sql.js";
import { mensagemRespondidaSql, referenciaNaConversaSql } from "./mensagem-respondida-sql.js";

export type MensagemRegistro = typeof mensagens.$inferSelect & {
  estado: EstadoMensagem;
  mensagemRespondida: MensagemRespondida | null;
  // Card de pedido: resumo lido do Pedido referenciado (null nas mensagens de texto).
  pedido: ResumoPedido | null;
  // Imagem ou áudio: metadados do anexo ATIVO (sem chave). Null em texto, pedido e anexo removido.
  anexo: AnexoMensagem | null;
};

/**
 * Metadados públicos do anexo ativo de cada mensagem: subconsulta pelo índice único de mensagem_id,
 * sem N+1. A CHAVE do arquivo fica de fora de propósito — ela só sai do banco na rota que gera a URL
 * assinada, depois da autorização.
 */
function anexoSql(tabelaMensagens = "mensagens"): SQL<AnexoMensagem | null> {
  // Tabela externa qualificada por nome (como em mensagemRespondidaSql): `${mensagens.id}` sairia sem
  // o nome da tabela e, dentro desta subconsulta, viraria o `id` do próprio anexo.
  const mensagem = sql.identifier(tabelaMensagens);
  return sql<AnexoMensagem | null>`(
    select case anexo.tipo::text
      when 'audio' then json_build_object('id', anexo.id, 'tipo', anexo.tipo, 'duracaoMs', anexo.duracao_ms)
      else json_build_object('id', anexo.id, 'tipo', anexo.tipo, 'largura', anexo.largura, 'altura', anexo.altura)
    end
    from anexos_mensagem anexo
    where anexo.mensagem_id = ${mensagem}.id and anexo.removido_em is null
  )`;
}

// Colunas da mensagem + dados derivados (estado e referência da resposta), usadas em toda leitura.
export const colunasMensagemCompleta = {
  ...getTableColumns(mensagens),
  estado: estadoMensagemSql(),
  mensagemRespondida: mensagemRespondidaSql(),
  pedido: resumoPedidoSql(),
  anexo: anexoSql(),
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
  // Também some o que a identidade LIMPOU ("Limpar/Apagar conversa"): id <= limpa_ate dela, pela PK.
  return sql`not exists (
    select 1 from ${mensagensExcluidasParaIdentidade}
    where ${mensagensExcluidasParaIdentidade.mensagemId} = ${mensagens.id}
      and ${mensagensExcluidasParaIdentidade.identidadeId} = ${identidadeId}
  ) and not exists (
    select 1 from participantes_conversa limpeza
    where limpeza.conversa_id = ${mensagens.conversaId}
      and limpeza.identidade_id = ${identidadeId}
      and limpeza.limpa_ate_mensagem_id >= ${mensagens.id}
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
  banco: Banco | Parameters<Parameters<Banco["transaction"]>[0]>[0],
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

  return mensagem ? { ...mensagem, estado: "enviada", mensagemRespondida, pedido: null, anexo: null } : null;
}

type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];

/**
 * Mensagem "imagem" + o seu anexo, na MESMA transação (o commit é conferido pelos triggers diferidos
 * da migration 0043). Mesma idempotência do texto: se o remetente já usou este idCliente, nada é
 * inserido e retorna null — quem chama remove o arquivo que acabou de gravar.
 */
export async function inserirMensagemImagem(
  transacao: Transacao,
  dados: {
    conversaId: string;
    remetenteIdentidadeId: string;
    idCliente: string;
    legenda: string;
    mensagemRespondida: MensagemRespondida | null;
    operadorUsuarioId?: string | null | undefined;
    arquivo: { chave: string; tipoConteudo: string; tamanhoBytes: number; largura: number; altura: number };
  },
): Promise<MensagemRegistro | null> {
  const { mensagemRespondida, legenda, arquivo, ...colunas } = dados;
  const [mensagem] = await transacao
    .insert(mensagens)
    .values({ ...colunas, tipo: "imagem", conteudo: legenda, mensagemRespondidaId: mensagemRespondida?.id ?? null })
    .onConflictDoNothing({ target: [mensagens.remetenteIdentidadeId, mensagens.idCliente] })
    .returning();
  if (!mensagem) return null;

  const [anexo] = await transacao
    .insert(anexosMensagem)
    .values({ conversaId: mensagem.conversaId, mensagemId: mensagem.id, tipo: "imagem", ...arquivo })
    .returning({ id: anexosMensagem.id });
  if (!anexo) throw new Error("Inserção do anexo não retornou registro.");

  return { ...mensagem, estado: "enviada", mensagemRespondida, pedido: null, anexo: { id: anexo.id, tipo: "imagem", largura: arquivo.largura, altura: arquivo.altura } };
}

/**
 * Mensagem "audio" + o seu anexo, na MESMA transação (coerência conferida no commit pelos triggers
 * diferidos, migration 0044). Mesma idempotência: idCliente já usado pelo remetente → null, e quem
 * chama remove o arquivo que acabou de gravar. Áudio não tem legenda: conteúdo sempre vazio.
 */
export async function inserirMensagemAudio(
  transacao: Transacao,
  dados: {
    conversaId: string;
    remetenteIdentidadeId: string;
    idCliente: string;
    mensagemRespondida: MensagemRespondida | null;
    operadorUsuarioId?: string | null | undefined;
    arquivo: { chave: string; tipoConteudo: TipoAudioAceito; tamanhoBytes: number; duracaoMs: number };
  },
): Promise<MensagemRegistro | null> {
  const { mensagemRespondida, arquivo, ...colunas } = dados;
  const [mensagem] = await transacao
    .insert(mensagens)
    .values({ ...colunas, tipo: "audio", conteudo: "", mensagemRespondidaId: mensagemRespondida?.id ?? null })
    .onConflictDoNothing({ target: [mensagens.remetenteIdentidadeId, mensagens.idCliente] })
    .returning();
  if (!mensagem) return null;

  const [anexo] = await transacao
    .insert(anexosMensagem)
    .values({ conversaId: mensagem.conversaId, mensagemId: mensagem.id, tipo: "audio", ...arquivo })
    .returning({ id: anexosMensagem.id });
  if (!anexo) throw new Error("Inserção do anexo não retornou registro.");

  return { ...mensagem, estado: "enviada", mensagemRespondida, pedido: null, anexo: { id: anexo.id, tipo: "audio", duracaoMs: arquivo.duracaoMs } };
}

/**
 * Chaves dos anexos (imagens OU áudios) que a identidade pode ver nesta conversa, entre os pedidos:
 * mensagem desta conversa, do tipo dado, não excluída para todos, não oculta/limpa para ela e com
 * anexo ativo. É o ÚNICO ponto que entrega a chave do arquivo, e só para gerar a URL assinada.
 */
export async function buscarChavesDeAnexosVisiveis(
  banco: Banco,
  tipo: "imagem" | "audio",
  conversaId: string,
  identidadeId: string,
  mensagemIds: readonly string[],
): Promise<{ mensagemId: string; chave: string }[]> {
  if (mensagemIds.length === 0) return [];
  return banco
    .select({ mensagemId: mensagens.id, chave: anexosMensagem.chave })
    .from(mensagens)
    .innerJoin(anexosMensagem, and(eq(anexosMensagem.mensagemId, mensagens.id), eq(anexosMensagem.conversaId, mensagens.conversaId)))
    .where(
      and(
        eq(mensagens.conversaId, conversaId),
        inArray(mensagens.id, [...mensagemIds]),
        eq(mensagens.tipo, tipo),
        eq(anexosMensagem.tipo, tipo),
        isNull(mensagens.excluidaParaTodosEm),
        isNull(anexosMensagem.removidoEm),
        visivelPara(identidadeId),
      ),
    );
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
 * excluída" na mesma instrução. Na MESMA transação, o anexo (se houver) recebe `removido_em`; a linha e
 * a chave ficam, e quem chama apaga o arquivo do storage DEPOIS do commit.
 * Retorna `null` se nada mudou (não é o autor ou já estava excluída); senão, as chaves removidas.
 */
export async function marcarExcluidaParaTodos(
  banco: Banco,
  {
    conversaId,
    mensagemId,
    remetenteIdentidadeId,
    operadorUsuarioId = null,
  }: { conversaId: string; mensagemId: string; remetenteIdentidadeId: string; operadorUsuarioId?: string | null | undefined },
): Promise<{ chavesRemovidas: string[] } | null> {
  return banco.transaction(async (transacao) => {
    const atualizadas = await transacao
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
    if (atualizadas.length === 0) return null;

    const removidos = await transacao
      .update(anexosMensagem)
      .set({ removidoEm: sql`greatest(now(), ${anexosMensagem.criadoEm})` })
      .where(and(eq(anexosMensagem.mensagemId, mensagemId), eq(anexosMensagem.conversaId, conversaId), isNull(anexosMensagem.removidoEm)))
      .returning({ chave: anexosMensagem.chave });
    return { chavesRemovidas: removidos.map((anexo) => anexo.chave) };
  });
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
