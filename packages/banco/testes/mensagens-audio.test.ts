import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { exigirBancoDeTeste } from "../src/banco-de-teste.js";
import { criarConexaoBanco } from "../src/conexao.js";

/*
 * MENSAGEM DE ÁUDIO (migration 0044) — só o BANCO: tipo "audio" em mensagens e em anexos, metadados
 * por tipo (imagem = dimensões, áudio = duração) e a coerência mensagem ↔ anexo no COMMIT.
 * Roda EXCLUSIVAMENTE no banco descartável, que aplica todas as migrations a partir do zero.
 */
const { banco, encerrar } = criarConexaoBanco(exigirBancoDeTeste());

let conversaId = "";
let outraConversaId = "";
let anaId = "";

function constraintDe(erro: unknown): string | undefined {
  const atual = erro as { constraint?: string; cause?: unknown } | null;
  return atual?.constraint ?? (atual?.cause as { constraint?: string } | undefined)?.constraint;
}

async function recusa(constraint: string, executar: () => Promise<unknown>) {
  await assert.rejects(executar, (erro) => {
    assert.equal(constraintDe(erro), constraint, String(erro));
    return true;
  });
}

type Executor = Pick<typeof banco, "execute">;

async function inserirMensagem(executor: Executor, tipo: string, conteudo = ""): Promise<string> {
  const id = randomUUID();
  await executor.execute(sql`
    insert into mensagens (id, conversa_id, remetente_identidade_id, id_cliente, tipo, conteudo)
    values (${id}, ${conversaId}, ${anaId}, ${randomUUID()}, ${tipo}::tipo_mensagem, ${conteudo})
  `);
  return id;
}

type Anexo = { tipo?: string; tipoConteudo?: string; largura?: number | null; altura?: number | null; duracaoMs?: number | null; conversa?: string; chave?: string };

async function inserirAnexo(executor: Executor, mensagemId: string, anexo: Anexo = {}): Promise<string> {
  const tipo = anexo.tipo ?? "audio";
  const chave = anexo.chave ?? `audio-conversa/${conversaId}/${randomUUID()}.webm`;
  await executor.execute(sql`
    insert into anexos_mensagem (conversa_id, mensagem_id, tipo, chave, tipo_conteudo, tamanho_bytes, largura, altura, duracao_ms)
    values (${anexo.conversa ?? conversaId}, ${mensagemId}, ${tipo}::tipo_anexo, ${chave}, ${anexo.tipoConteudo ?? (tipo === "audio" ? "audio/webm" : "image/webp")},
            48000, ${anexo.largura === undefined ? null : anexo.largura}, ${anexo.altura === undefined ? null : anexo.altura}, ${anexo.duracaoMs === undefined ? 12_000 : anexo.duracaoMs})
  `);
  return chave;
}

/** Mensagem "audio" + anexo na MESMA transação (é assim que a API grava). */
const inserirAudio = (anexo: Anexo = {}, conteudo = "") =>
  banco.transaction(async (transacao) => {
    const mensagemId = await inserirMensagem(transacao, "audio", conteudo);
    const chave = await inserirAnexo(transacao, mensagemId, anexo);
    return { mensagemId, chave };
  });

before(async () => {
  const sufixo = randomUUID().slice(0, 8);
  const criarPessoa = async (nome: string) => {
    const usuario = `u_${nome}_${sufixo}`;
    await banco.execute(sql`insert into users (id, name, email) values (${usuario}, ${nome}, ${`${usuario}@teste.invalid`})`);
    const [linha] = (await banco.execute<{ id: string }>(sql`
      insert into identidades (usuario_id, tipo, nome_exibicao, nome_usuario) values (${usuario}, 'pessoal', ${nome}, ${`${nome}_${sufixo}`}) returning id
    `)).rows;
    return linha!.id;
  };
  anaId = await criarPessoa("anaaudio");
  const brunoId = await criarPessoa("brunoaudio");
  const criarConversa = async () => {
    const [linha] = (await banco.execute<{ id: string }>(sql`insert into conversas (tipo, chave_direta) values ('direta', ${randomUUID()}) returning id`)).rows;
    await banco.execute(sql`insert into participantes_conversa (conversa_id, identidade_id) values (${linha!.id}, ${anaId}), (${linha!.id}, ${brunoId})`);
    return linha!.id;
  };
  conversaId = await criarConversa();
  outraConversaId = await criarConversa();
});

after(() => encerrar());

describe("migration 0044 aplicada do zero", () => {
  test("coluna de duração, dimensões opcionais e gatilho da mensagem cobrindo áudio", async () => {
    const colunas = (await banco.execute<{ column_name: string; is_nullable: string }>(sql`
      select column_name, is_nullable from information_schema.columns
      where table_name = 'anexos_mensagem' and column_name in ('largura', 'altura', 'duracao_ms') order by column_name
    `)).rows;
    assert.deepEqual(colunas, [
      { column_name: "altura", is_nullable: "YES" },
      { column_name: "duracao_ms", is_nullable: "YES" },
      { column_name: "largura", is_nullable: "YES" },
    ]);
    const [gatilho] = (await banco.execute<{ definicao: string }>(sql`select pg_get_triggerdef(oid) as definicao from pg_trigger where tgname = 'mensagens_coerencia_anexo'`)).rows;
    assert.match(gatilho!.definicao, /imagem.*audio/s);
    const restricoes = (await banco.execute<{ conname: string }>(sql`select conname from pg_constraint where conrelid = 'anexos_mensagem'::regclass and contype = 'c' order by conname`)).rows.map((linha) => linha.conname);
    assert.ok(restricoes.includes("anexos_mensagem_metadados_por_tipo") && restricoes.includes("anexos_mensagem_audio_formato"));
    assert.ok(!restricoes.includes("anexos_mensagem_dimensoes_positivas"), "substituída pela de metadados por tipo");
  });
});

describe("mensagem audio", () => {
  test("áudio válido: conteúdo vazio + um anexo de áudio com duração, sem dimensões", async () => {
    const { mensagemId } = await inserirAudio();
    const [linha] = (await banco.execute<{ tipo: string; largura: number | null; altura: number | null; duracao_ms: number }>(sql`
      select tipo::text, largura, altura, duracao_ms from anexos_mensagem where mensagem_id = ${mensagemId}
    `)).rows;
    assert.deepEqual(linha, { tipo: "audio", largura: null, altura: null, duracao_ms: 12_000 });
    await inserirAudio({ tipoConteudo: "audio/mp4" });
  });

  test("áudio não tem legenda: conteúdo precisa ser vazio", async () => {
    await recusa("mensagens_conteudo_texto_valido", () => inserirAudio({}, "legenda"));
  });

  test("áudio exige anexo: sem anexo, o commit é recusado", async () => {
    await recusa("mensagens_audio_exige_anexo", () => banco.transaction((transacao) => inserirMensagem(transacao, "audio")));
  });

  test("tipos não se misturam: áudio com anexo de imagem e imagem com anexo de áudio são recusados", async () => {
    await recusa("mensagens_audio_exige_anexo", () =>
      banco.transaction(async (transacao) => inserirAnexo(transacao, await inserirMensagem(transacao, "audio"), { tipo: "imagem", largura: 800, altura: 600, duracaoMs: null })),
    );
    await recusa("mensagens_imagem_exige_anexo", () => banco.transaction(async (transacao) => inserirAnexo(transacao, await inserirMensagem(transacao, "imagem"))));
  });

  test("texto e pedido não recebem anexo de áudio", async () => {
    await recusa("anexos_mensagem_tipo_coerente", () => banco.transaction(async (transacao) => inserirAnexo(transacao, await inserirMensagem(transacao, "texto", "oi"))));
  });

  test("metadados por tipo: áudio sem duração, com duração zero ou com dimensões é recusado; imagem com duração também", async () => {
    await recusa("anexos_mensagem_metadados_por_tipo", () => inserirAudio({ duracaoMs: null }));
    await recusa("anexos_mensagem_metadados_por_tipo", () => inserirAudio({ duracaoMs: 0 }));
    await recusa("anexos_mensagem_metadados_por_tipo", () => inserirAudio({ largura: 0, altura: 0 }));
    await recusa("anexos_mensagem_metadados_por_tipo", () =>
      banco.transaction(async (transacao) => inserirAnexo(transacao, await inserirMensagem(transacao, "imagem"), { tipo: "imagem", largura: 800, altura: 600, duracaoMs: 1000 })),
    );
  });

  test("formato: só audio/webm e audio/mp4", async () => {
    for (const tipoConteudo of ["audio/mpeg", "audio/ogg", "video/webm", "image/webp"]) {
      await recusa("anexos_mensagem_audio_formato", () => inserirAudio({ tipoConteudo }));
    }
  });

  test("um áudio = um anexo, e o anexo é de mensagem DESTA conversa", async () => {
    const { mensagemId } = await inserirAudio();
    await recusa("anexos_mensagem_um_por_mensagem", () => inserirAnexo(banco, mensagemId));
    await recusa("anexos_mensagem_mensagem_fk", () =>
      banco.transaction(async (transacao) => inserirAnexo(transacao, await inserirMensagem(transacao, "audio"), { conversa: outraConversaId })),
    );
  });
});

describe("tombstone do áudio", () => {
  test("anexo não pode ser removido enquanto a mensagem é visível", async () => {
    const { mensagemId } = await inserirAudio();
    await recusa("mensagens_anexo_ativo_enquanto_visivel", () => banco.execute(sql`update anexos_mensagem set removido_em = now() where mensagem_id = ${mensagemId}`));
  });

  test("excluir para todos: tombstone + removido_em na mesma transação; linha e chave permanecem", async () => {
    const { mensagemId, chave } = await inserirAudio();
    await banco.transaction(async (transacao) => {
      await transacao.execute(sql`update mensagens set excluida_para_todos_em = greatest(now(), criado_em), conteudo = '' where id = ${mensagemId}`);
      await transacao.execute(sql`update anexos_mensagem set removido_em = greatest(now(), criado_em) where mensagem_id = ${mensagemId}`);
    });
    const [linha] = (await banco.execute<{ chave: string; removido: boolean; tipo: string }>(sql`
      select a.chave, a.removido_em is not null as removido, m.tipo::text as tipo from anexos_mensagem a join mensagens m on m.id = a.mensagem_id where m.id = ${mensagemId}
    `)).rows;
    assert.deepEqual(linha, { chave, removido: true, tipo: "audio" });
  });

  test("a mensagem com anexo não se apaga fisicamente (RESTRICT)", async () => {
    const { mensagemId } = await inserirAudio();
    await recusa("anexos_mensagem_mensagem_fk", () => banco.execute(sql`delete from mensagens where id = ${mensagemId}`));
  });
});
