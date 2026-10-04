import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { sql } from "drizzle-orm";
import { exigirBancoDeTeste } from "../src/banco-de-teste.js";
import { criarConexaoBanco } from "../src/conexao.js";

/*
 * MENSAGEM COM ANEXO (migration 0043) — só o BANCO: tipo "imagem", CHECK de conteúdo reescrita,
 * tabela anexos_mensagem e a coerência conferida no COMMIT pelos triggers diferidos.
 * Roda EXCLUSIVAMENTE no banco descartável criado por scripts/com-banco-teste.ts, que aplica todas as
 * migrations a partir do zero.
 */
const { banco, encerrar } = criarConexaoBanco(exigirBancoDeTeste());

let conversaId = "";
let outraConversaId = "";
let anaId = "";
let brunoId = "";

/** Nome da constraint violada (o pg a informa; o drizzle às vezes embrulha o erro em `cause`). */
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

async function inserirMensagem(executor: Pick<typeof banco, "execute">, dados: { tipo: string; conteudo?: string; conversa?: string; remetente?: string; pedidoId?: string | null }): Promise<string> {
  const id = randomUUID();
  await executor.execute(sql`
    insert into mensagens (id, conversa_id, remetente_identidade_id, id_cliente, tipo, conteudo, pedido_id)
    values (${id}, ${dados.conversa ?? conversaId}, ${dados.remetente ?? anaId}, ${randomUUID()}, ${dados.tipo}::tipo_mensagem, ${dados.conteudo ?? ""}, ${dados.pedidoId ?? null})
  `);
  return id;
}

type Anexo = { tipo?: string; chave?: string; tipoConteudo?: string; tamanhoBytes?: number; largura?: number; altura?: number; conversa?: string; removidoEm?: Date | null };

async function inserirAnexo(executor: Pick<typeof banco, "execute">, mensagemId: string, anexo: Anexo = {}): Promise<string> {
  const chave = anexo.chave ?? `conversas/${conversaId}/${randomUUID()}.webp`;
  await executor.execute(sql`
    insert into anexos_mensagem (conversa_id, mensagem_id, tipo, chave, tipo_conteudo, tamanho_bytes, largura, altura, removido_em)
    values (${anexo.conversa ?? conversaId}, ${mensagemId}, ${anexo.tipo ?? "imagem"}::tipo_anexo, ${chave}, ${anexo.tipoConteudo ?? "image/webp"},
            ${anexo.tamanhoBytes ?? 123456}, ${anexo.largura ?? 1600}, ${anexo.altura ?? 1200}, ${anexo.removidoEm ?? null})
  `);
  return chave;
}

/** Mensagem "imagem" + anexo na MESMA transação (é assim que a API vai gravar). */
async function inserirImagem(conteudo = "", anexo: Anexo = {}): Promise<{ mensagemId: string; chave: string }> {
  return banco.transaction(async (transacao) => {
    const mensagemId = await inserirMensagem(transacao, { tipo: "imagem", conteudo });
    const chave = await inserirAnexo(transacao, mensagemId, anexo);
    return { mensagemId, chave };
  });
}

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
  anaId = await criarPessoa("ana");
  brunoId = await criarPessoa("bruno");
  const criarConversa = async () => {
    const [linha] = (await banco.execute<{ id: string }>(sql`insert into conversas (tipo, chave_direta) values ('direta', ${randomUUID()}) returning id`)).rows;
    await banco.execute(sql`insert into participantes_conversa (conversa_id, identidade_id) values (${linha!.id}, ${anaId}), (${linha!.id}, ${brunoId})`);
    return linha!.id;
  };
  conversaId = await criarConversa();
  outraConversaId = await criarConversa();
});

after(() => encerrar());

describe("migrations aplicadas do zero", () => {
  test("enum, tabela, índices e triggers diferidos existem", async () => {
    const valores = (await banco.execute<{ v: string }>(sql`select unnest(enum_range(null::tipo_mensagem))::text as v`)).rows.map((linha) => linha.v);
    assert.deepEqual(valores, ["texto", "pedido", "imagem", "audio"]);
    const anexo = (await banco.execute<{ v: string }>(sql`select unnest(enum_range(null::tipo_anexo))::text as v`)).rows.map((linha) => linha.v);
    assert.deepEqual(anexo, ["imagem", "audio"]);

    const gatilhos = (await banco.execute<{ tgname: string; deferrable: boolean; initdeferred: boolean }>(sql`
      select tgname, tgdeferrable as deferrable, tginitdeferred as initdeferred from pg_trigger
      where tgname in ('mensagens_coerencia_anexo', 'anexos_mensagem_coerencia_mensagem') order by tgname
    `)).rows;
    assert.deepEqual(gatilhos, [
      { tgname: "anexos_mensagem_coerencia_mensagem", deferrable: true, initdeferred: true },
      { tgname: "mensagens_coerencia_anexo", deferrable: true, initdeferred: true },
    ]);
  });
});

describe("texto e pedido continuam como antes", () => {
  test("texto válido é aceito; vazio ou só espaços é recusado", async () => {
    await inserirMensagem(banco, { tipo: "texto", conteudo: "oi" });
    await recusa("mensagens_conteudo_texto_valido", () => inserirMensagem(banco, { tipo: "texto", conteudo: "" }));
    await recusa("mensagens_conteudo_texto_valido", () => inserirMensagem(banco, { tipo: "texto", conteudo: "   " }));
    await recusa("mensagens_conteudo_texto_valido", () => inserirMensagem(banco, { tipo: "texto", conteudo: "x".repeat(4001) }));
  });

  test("pedido: sem pedido_id é recusado; conteúdo não vazio é recusado", async () => {
    await recusa("mensagens_pedido_por_tipo", () => inserirMensagem(banco, { tipo: "pedido" }));
    // Com um pedido_id qualquer a FK seria a primeira a recusar; a regra de conteúdo vem da CHECK.
    await recusa("mensagens_conteudo_texto_valido", () => inserirMensagem(banco, { tipo: "pedido", conteudo: "texto" }));
  });

  test("texto não dispara a verificação de anexo (mensagem comum segue sem custo extra)", async () => {
    await banco.transaction(async (transacao) => {
      await inserirMensagem(transacao, { tipo: "texto", conteudo: "sem anexo" });
    });
  });
});

describe("mensagem imagem", () => {
  test("imagem + anexo válido na mesma transação → commit aceito (sem legenda e com legenda)", async () => {
    const { mensagemId } = await inserirImagem();
    await inserirImagem("Olha a pizza!");
    const [linha] = (await banco.execute<{ n: number }>(sql`select count(*)::int as n from anexos_mensagem where mensagem_id = ${mensagemId}`)).rows;
    assert.equal(linha?.n, 1);
  });

  test("anexo pode ser inserido ANTES da mensagem na transação (a verificação é no commit)", async () => {
    await banco.transaction(async (transacao) => {
      const mensagemId = randomUUID();
      // FK é imediata: a mensagem precisa existir antes do anexo. O que é diferido é a coerência.
      await transacao.execute(sql`
        insert into mensagens (id, conversa_id, remetente_identidade_id, id_cliente, tipo, conteudo)
        values (${mensagemId}, ${conversaId}, ${anaId}, ${randomUUID()}, 'imagem'::tipo_mensagem, '')
      `);
      await inserirAnexo(transacao, mensagemId);
    });
  });

  test("legenda só com espaços ou acima de 4000 caracteres é recusada", async () => {
    await recusa("mensagens_conteudo_texto_valido", () => inserirImagem("   "));
    await recusa("mensagens_conteudo_texto_valido", () => inserirImagem("x".repeat(4001)));
    await inserirImagem("x".repeat(4000));
  });

  test("imagem SEM anexo → commit recusado", async () => {
    await recusa("mensagens_imagem_exige_anexo", () => banco.transaction(async (transacao) => void (await inserirMensagem(transacao, { tipo: "imagem" }))));
  });

  test("imagem não pode referenciar pedido", async () => {
    await recusa("mensagens_pedido_por_tipo", () => inserirMensagem(banco, { tipo: "imagem", pedidoId: randomUUID() }));
  });

  test("anexo em mensagem de TEXTO → commit recusado", async () => {
    const textoId = await inserirMensagem(banco, { tipo: "texto", conteudo: "oi" });
    await recusa("anexos_mensagem_tipo_coerente", () => inserirAnexo(banco, textoId));
  });

  test("dois anexos na mesma mensagem → recusado (um por mensagem nesta fase)", async () => {
    const { mensagemId } = await inserirImagem();
    await recusa("anexos_mensagem_um_por_mensagem", () => inserirAnexo(banco, mensagemId));
  });

  test("chave duplicada → recusada", async () => {
    const { chave } = await inserirImagem();
    await recusa("anexos_mensagem_chave_unica", () => inserirImagem("", { chave }));
  });

  test("FK composta: anexo apontando a mensagem com a conversa ERRADA é recusado", async () => {
    await recusa("anexos_mensagem_mensagem_fk", () =>
      banco.transaction(async (transacao) => {
        const mensagemId = await inserirMensagem(transacao, { tipo: "imagem" });
        await inserirAnexo(transacao, mensagemId, { conversa: outraConversaId });
      }),
    );
  });

  test("metadados inválidos são recusados", async () => {
    await recusa("anexos_mensagem_tamanho_positivo", () => inserirImagem("", { tamanhoBytes: 0 }));
    await recusa("anexos_mensagem_metadados_por_tipo", () => inserirImagem("", { largura: 0 }));
    await recusa("anexos_mensagem_metadados_por_tipo", () => inserirImagem("", { altura: -1 }));
    await recusa("anexos_mensagem_chave_valida", () => inserirImagem("", { chave: "" }));
    await recusa("anexos_mensagem_chave_valida", () => inserirImagem("", { chave: "x".repeat(301) }));
    // Vazio numa IMAGEM viola duas regras (vazio e "não é webp"): o PostgreSQL informa qualquer uma.
    await assert.rejects(
      () => inserirImagem("", { tipoConteudo: "" }),
      (erro) => ["anexos_mensagem_tipo_conteudo_valido", "anexos_mensagem_imagem_em_webp"].includes(constraintDe(erro) ?? ""),
    );
  });

  test("imagem só em image/webp (o pipeline sempre reencoda)", async () => {
    await recusa("anexos_mensagem_imagem_em_webp", () => inserirImagem("", { tipoConteudo: "image/jpeg" }));
  });

  test("apagar a mensagem com anexo é recusado (RESTRICT: exclusão é tombstone)", async () => {
    const { mensagemId } = await inserirImagem();
    await recusa("anexos_mensagem_mensagem_fk", () => banco.execute(sql`delete from mensagens where id = ${mensagemId}`));
  });
});

describe("tombstone e remoção do anexo", () => {
  test("excluir para todos: mensagem vira tombstone, anexo recebe removido_em, a chave fica", async () => {
    const { mensagemId, chave } = await inserirImagem("legenda");
    await banco.transaction(async (transacao) => {
      await transacao.execute(sql`update mensagens set excluida_para_todos_em = now(), conteudo = '' where id = ${mensagemId}`);
      await transacao.execute(sql`update anexos_mensagem set removido_em = now() where mensagem_id = ${mensagemId}`);
    });
    const [linha] = (await banco.execute<{ chave: string; removido: boolean }>(sql`select chave, removido_em is not null as removido from anexos_mensagem where mensagem_id = ${mensagemId}`)).rows;
    assert.deepEqual(linha, { chave, removido: true });
  });

  test("tombstone com anexo ainda ativo é válido (a limpeza do arquivo pode vir depois)", async () => {
    const { mensagemId } = await inserirImagem();
    await banco.execute(sql`update mensagens set excluida_para_todos_em = now(), conteudo = '' where id = ${mensagemId}`);
  });

  test("anexo removido em mensagem ainda VISÍVEL → commit recusado", async () => {
    const { mensagemId } = await inserirImagem();
    await recusa("mensagens_anexo_ativo_enquanto_visivel", () => banco.execute(sql`update anexos_mensagem set removido_em = now() where mensagem_id = ${mensagemId}`));
  });

  test("apagar fisicamente o anexo de uma mensagem imagem → commit recusado", async () => {
    const { mensagemId } = await inserirImagem();
    await recusa("mensagens_imagem_exige_anexo", () => banco.execute(sql`delete from anexos_mensagem where mensagem_id = ${mensagemId}`));
  });

  test("tombstone mantém a regra de conteúdo vazio também para imagem", async () => {
    const { mensagemId } = await inserirImagem("legenda");
    await recusa("mensagens_conteudo_texto_valido", () => banco.execute(sql`update mensagens set excluida_para_todos_em = now() where id = ${mensagemId}`));
  });
});
