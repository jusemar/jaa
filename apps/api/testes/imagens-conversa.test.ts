import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { anexosMensagem, identidades, mensagens } from "@jaa/banco/schema";
import {
  EVENTO_MENSAGEM_NOVA,
  EVENTO_NOTIFICACAO_NOVA_MENSAGEM,
  LIMITE_URLS_IMAGENS_POR_PEDIDO,
  PREVIA_IMAGEM,
  mensagemSchema,
  paginaMensagensSchema,
  urlsImagensSchema,
  type EventoMensagemNova,
  type EventoNotificacaoNovaMensagem,
  type Mensagem,
} from "@jaa/contratos";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import type { ArmazenamentoPrivado } from "../src/lib/armazenamento/armazenamento-arquivos.js";
import { LIMITE_ENVIO_IMAGEM_CONVERSA } from "../src/lib/armazenamento/receber-imagem.js";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * IMAGENS PRIVADAS NA CONVERSA (API): envio multipart, idempotência, bucket privado (FAKE, em memória),
 * histórico, URLs assinadas em lote, realtime, prévias e exclusão.
 */

// ---------- Bucket privado FAKE ----------
const guardados = new Map<string, { conteudo: Buffer; tipoConteudo: string }>();
const removidas: string[] = [];
let gravacoes = 0;
let falharProximaGravacao = false;
let falharRemocao = false;
let atrasoGravacaoMs = 0;
const armazenamentoPrivado: ArmazenamentoPrivado = {
  nome: "privado-teste",
  async salvar({ chave, conteudo, tipoConteudo }) {
    gravacoes += 1;
    if (atrasoGravacaoMs) await new Promise((r) => setTimeout(r, atrasoGravacaoMs));
    if (falharProximaGravacao) {
      falharProximaGravacao = false;
      throw new Error("Armazenamento respondeu 500 ao gravar o arquivo.");
    }
    guardados.set(chave, { conteudo, tipoConteudo });
    return { chave };
  },
  async remover(chave) {
    if (falharRemocao) throw new Error("Armazenamento respondeu 500 ao remover o arquivo.");
    removidas.push(chave);
    guardados.delete(chave);
  },
  urlAssinadaLeitura(chave, { validadeSegundos = 1200 } = {}) {
    return `https://privado.teste.invalid/jaa-privado/${chave}?X-Amz-Expires=${validadeSegundos}&X-Amz-Signature=fake`;
  },
};

const PREFIXO = `img${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987668101", "+5531987668102", "+5531987668103"],
  prefixoIp: "198.51.118.",
  armazenamentoPrivado,
});

let ana: Pessoa;
let bruno: Pessoa;
let carla: Pessoa;
let identidadeEmpresa = "";
let conversaAB = "";
let conversaAC = "";
let conversaEmpresaB = "";

// ---------- Imagens de teste ----------
const imagem = (formato: "jpeg" | "png" | "webp", largura = 400, altura = 300) => {
  const base = sharp({ create: { width: largura, height: altura, channels: 3, background: "#c0392b" } });
  return (formato === "jpeg" ? base.jpeg() : formato === "png" ? base.png() : base.webp()).toBuffer();
};
const TIPOS = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

type Envio = {
  idCliente?: string;
  legenda?: string;
  mensagemRespondidaId?: string;
  arquivo?: { conteudo: Buffer; tipo: string; nome?: string };
  arquivoPrimeiro?: boolean;
};

async function enviar(pessoa: Pessoa, conversaId: string, envio: Envio = {}) {
  const arquivo = envio.arquivo ?? { conteudo: await imagem("jpeg"), tipo: "image/jpeg" };
  const campos = [
    { campo: "idCliente", valor: envio.idCliente ?? randomUUID() },
    ...(envio.legenda !== undefined ? [{ campo: "legenda", valor: envio.legenda }] : []),
    ...(envio.mensagemRespondidaId ? [{ campo: "mensagemRespondidaId", valor: envio.mensagemRespondidaId }] : []),
  ];
  const parteArquivo = { arquivo: { nome: arquivo.nome ?? "foto.jpg", tipo: arquivo.tipo, conteudo: arquivo.conteudo } };
  return ctx.enviarMultipart(pessoa, `/conversas/${conversaId}/mensagens/imagem`, envio.arquivoPrimeiro ? [parteArquivo, ...campos] : [...campos, parteArquivo]);
}

async function enviarOk(pessoa: Pessoa, conversaId: string, envio: Envio = {}): Promise<Mensagem> {
  const resposta = await enviar(pessoa, conversaId, envio);
  assert.equal(resposta.statusCode, 201, resposta.body);
  return mensagemSchema.parse(resposta.json());
}

const urls = (pessoa: Pessoa, conversaId: string, mensagemIds: string[]) => ctx.api(pessoa, "POST", `/conversas/${conversaId}/imagens/urls`, { mensagemIds });
const idsComUrl = async (pessoa: Pessoa, conversaId: string, mensagemIds: string[]) =>
  urlsImagensSchema.parse((await urls(pessoa, conversaId, mensagemIds)).json()).imagens.map((item) => item.mensagemId);

const chaveDoAnexo = async (mensagemId: string) => (await ctx.banco.select().from(anexosMensagem).where(eq(anexosMensagem.mensagemId, mensagemId)))[0];

async function abrirConversa(pessoa: Pessoa, nomeUsuario: string): Promise<string> {
  const resposta = await ctx.api(pessoa, "POST", "/conversas/diretas", { nomeUsuario });
  assert.ok([200, 201].includes(resposta.statusCode), resposta.body);
  return resposta.json().id;
}

before(async () => {
  await ctx.iniciar();
  ana = await ctx.criarPessoa(0, `${PREFIXO}_ana`, "Ana Imagem");
  bruno = await ctx.criarPessoa(1, `${PREFIXO}_bruno`, "Bruno Imagem");
  carla = await ctx.criarPessoa(2, `${PREFIXO}_carla`, "Carla Fora");
  const empresa = await ctx.api(ana, "POST", "/empresas", { nome: "Loja Imagem", nomeUsuario: `${PREFIXO}_loja`, slug: `${PREFIXO}-loja` });
  assert.equal(empresa.statusCode, 201, empresa.body);
  identidadeEmpresa = empresa.json().identidadeId;
  conversaAB = await abrirConversa(ana, `${PREFIXO}_bruno`);
  conversaAC = await abrirConversa(ana, `${PREFIXO}_carla`);
  conversaEmpresaB = await abrirConversa(bruno, `${PREFIXO}_loja`);
});

after(() => ctx.encerrar());

describe("envio: autorização", () => {
  it("participante envia: 201, mensagem imagem com anexo só de metadados e arquivo no bucket privado", async () => {
    const antes = gravacoes;
    const mensagem = await enviarOk(ana, conversaAB, { legenda: "  Olha a pizza!  " });
    assert.equal(mensagem.tipo, "imagem");
    assert.equal(mensagem.conteudo, "Olha a pizza!", "legenda com as regras do texto (trim)");
    assert.deepEqual(Object.keys(mensagem.anexo ?? {}).sort(), ["altura", "id", "largura", "tipo"]);
    assert.deepEqual({ ...mensagem.anexo, id: undefined }, { id: undefined, tipo: "imagem", largura: 400, altura: 300 });
    assert.equal(gravacoes, antes + 1);

    const anexo = await chaveDoAnexo(mensagem.id);
    assert.ok(anexo);
    assert.match(anexo.chave, new RegExp(`^imagem-conversa/${conversaAB}/[0-9a-f-]{36}\\.webp$`), "chave gerada pelo servidor");
    assert.equal(anexo.tipoConteudo, "image/webp");
    assert.equal(anexo.tamanhoBytes, guardados.get(anexo.chave)?.conteudo.byteLength);
  });

  it("não participante: 404 sem processar nem gravar (nem um arquivo inválido chega a ser lido)", async () => {
    const antes = gravacoes;
    const resposta = await enviar(carla, conversaAB, { arquivo: { conteudo: Buffer.from("não é imagem"), tipo: "image/jpeg" } });
    assert.equal(resposta.statusCode, 404, resposta.body);
    assert.equal(resposta.json().codigo, "CONVERSA_NAO_ENCONTRADA");
    assert.equal(gravacoes, antes);
  });

  it("identidade empresarial operada envia como a empresa; sem vínculo, 403", async () => {
    const mensagem = await enviarOk(como(ana, identidadeEmpresa), conversaEmpresaB);
    assert.equal(mensagem.remetenteIdentidadeId, identidadeEmpresa);
    const antes = gravacoes;
    const semVinculo = await enviar(como(bruno, identidadeEmpresa), conversaEmpresaB);
    assert.equal(semVinculo.statusCode, 403, semVinculo.body);
    assert.equal(semVinculo.json().codigo, "IDENTIDADE_NAO_AUTORIZADA");
    assert.equal(gravacoes, antes);
  });

  it("campos depois do arquivo não valem: sem idCliente antes do arquivo, 400 sem gravar", async () => {
    const antes = gravacoes;
    const resposta = await enviar(ana, conversaAB, { arquivoPrimeiro: true });
    assert.equal(resposta.statusCode, 400, resposta.body);
    assert.equal(resposta.json().codigo, "DADOS_INVALIDOS");
    assert.match(resposta.json().mensagem, /antes do arquivo/i);
    assert.equal(gravacoes, antes);
  });

  it("legenda só com espaços vira imagem sem legenda; acima de 4000 é recusada", async () => {
    assert.equal((await enviarOk(ana, conversaAB, { legenda: "   " })).conteudo, "");
    const longa = await enviar(ana, conversaAB, { legenda: "x".repeat(4001) });
    assert.equal(longa.statusCode, 400, longa.body);
  });
});

describe("envio: arquivo", () => {
  for (const formato of ["jpeg", "png", "webp"] as const) {
    it(`${formato.toUpperCase()} válido é aceito e guardado como WebP`, async () => {
      const mensagem = await enviarOk(ana, conversaAB, { arquivo: { conteudo: await imagem(formato), tipo: TIPOS[formato] } });
      const anexo = await chaveDoAnexo(mensagem.id);
      const guardado = guardados.get(anexo!.chave);
      assert.equal(guardado?.tipoConteudo, "image/webp");
      assert.equal((await sharp(guardado!.conteudo).metadata()).format, "webp");
    });
  }

  it("bytes falsos, GIF e HEIC são recusados sem gravar", async () => {
    const antes = gravacoes;
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
    for (const arquivo of [
      { conteudo: Buffer.from("<?php echo 1; ?>"), tipo: "image/jpeg" },
      { conteudo: gif, tipo: "image/gif" },
      { conteudo: Buffer.from("ftypheic-falso"), tipo: "image/heic" },
    ]) {
      const resposta = await enviar(ana, conversaAB, { arquivo });
      assert.equal(resposta.statusCode, 400, resposta.body);
      assert.equal(resposta.json().codigo, "ARQUIVO_INVALIDO");
    }
    assert.equal(gravacoes, antes);
  });

  it("acima de 8 MB: 413 sem gravar", async () => {
    const antes = gravacoes;
    const resposta = await enviar(ana, conversaAB, { arquivo: { conteudo: Buffer.alloc(8 * 1024 * 1024 + 1, 1), tipo: "image/jpeg" } });
    assert.equal(resposta.statusCode, 413, resposta.body);
    assert.equal(gravacoes, antes);
  });

  it("EXIF (onde vive o GPS) é removido e o maior lado fica em 1600 px", async () => {
    const comExif = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#fff" } })
      .withExif({ IFD0: { Copyright: "Jaa", Software: "camera" } })
      .jpeg()
      .toBuffer();
    const mensagem = await enviarOk(ana, conversaAB, { arquivo: { conteudo: comExif, tipo: "image/jpeg" } });
    assert.deepEqual({ ...mensagem.anexo, id: undefined }, { id: undefined, tipo: "imagem", largura: 1600, altura: 1067 });
    const metadados = await sharp(guardados.get((await chaveDoAnexo(mensagem.id))!.chave)!.conteudo).metadata();
    assert.equal(metadados.exif, undefined);
    assert.equal(metadados.width, 1600);
  });
});

describe("envio: idempotência", () => {
  it("retry com o mesmo idCliente devolve a mesma mensagem sem processar nem gravar de novo", async () => {
    const idCliente = randomUUID();
    const primeira = await enviarOk(ana, conversaAB, { idCliente, legenda: "uma vez" });
    const antes = gravacoes;
    // Até um arquivo inválido no retry prova que os bytes nem foram lidos.
    const retry = await enviar(ana, conversaAB, { idCliente, legenda: "uma vez", arquivo: { conteudo: Buffer.from("x"), tipo: "image/jpeg" } });
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().id, primeira.id);
    assert.equal(gravacoes, antes);

    const outra = await enviar(ana, conversaAB, { idCliente, legenda: "outra legenda" });
    assert.equal(outra.statusCode, 409, outra.body);
    assert.equal(outra.json().codigo, "ID_CLIENTE_REUTILIZADO");
  });

  it("duas tentativas simultâneas: uma mensagem, um anexo, e o arquivo perdedor é removido", async () => {
    const idCliente = randomUUID();
    const removidasAntes = removidas.length;
    atrasoGravacaoMs = 150; // as duas passam da checagem de idempotência antes de qualquer commit
    const [a, b] = await Promise.all([enviar(ana, conversaAB, { idCliente }), enviar(ana, conversaAB, { idCliente })]);
    atrasoGravacaoMs = 0;
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 201]);
    assert.equal(a.json().id, b.json().id);

    const linhas = await ctx.banco.select({ id: mensagens.id }).from(mensagens).where(eq(mensagens.idCliente, idCliente));
    assert.equal(linhas.length, 1);
    const anexo = await chaveDoAnexo(linhas[0]!.id);
    assert.ok(anexo && guardados.has(anexo.chave), "o arquivo da vencedora existe");
    assert.equal(removidas.length, removidasAntes + 1, "o da perdedora foi removido");
    assert.ok(!guardados.has(removidas.at(-1)!));
  });
});

describe("envio: falhas do armazenamento e da transação", () => {
  it("falha ao gravar no bucket: nenhuma mensagem é criada", async () => {
    const idCliente = randomUUID();
    falharProximaGravacao = true;
    const resposta = await enviar(ana, conversaAB, { idCliente });
    assert.equal(resposta.statusCode, 500);
    assert.equal((await ctx.banco.select().from(mensagens).where(eq(mensagens.idCliente, idCliente))).length, 0);
  });

  it("falha da transação depois do PUT: o arquivo recém-gravado é removido", async () => {
    const idCliente = randomUUID();
    const removidasAntes = removidas.length;
    // Gatilho temporário que recusa a inserção do anexo: simula erro do banco depois do PUT.
    await ctx.banco.execute(sql`create function teste_recusa_anexo() returns trigger language plpgsql as $$ begin raise exception 'falha simulada'; end $$`);
    await ctx.banco.execute(sql`create trigger teste_recusa_anexo before insert on anexos_mensagem for each row execute function teste_recusa_anexo()`);
    try {
      const resposta = await enviar(ana, conversaAB, { idCliente });
      assert.equal(resposta.statusCode, 500);
    } finally {
      await ctx.banco.execute(sql`drop trigger teste_recusa_anexo on anexos_mensagem`);
      await ctx.banco.execute(sql`drop function teste_recusa_anexo()`);
    }
    assert.equal((await ctx.banco.select().from(mensagens).where(eq(mensagens.idCliente, idCliente))).length, 0);
    assert.equal(removidas.length, removidasAntes + 1);
    assert.ok(!guardados.has(removidas.at(-1)!), "nenhum arquivo órfão ficou");
  });
});

describe("histórico, realtime e prévias", () => {
  it("mensagem:nova leva tipo imagem e anexo, sem URL e sem chave; a notificação diz só \"Foto\"", async () => {
    const socketB = await ctx.conectar(bruno);
    const novas = coletar<EventoMensagemNova>(socketB, EVENTO_MENSAGEM_NOVA);
    const avisos = coletar<EventoNotificacaoNovaMensagem>(socketB, EVENTO_NOTIFICACAO_NOVA_MENSAGEM);
    const mensagem = await enviarOk(ana, conversaAB, { legenda: "legenda secreta" });
    await aguardarAte(() => novas.some((evento) => evento.mensagem.id === mensagem.id) && avisos.some((aviso) => aviso.mensagemId === mensagem.id));

    const evento = novas.find((item) => item.mensagem.id === mensagem.id)!;
    assert.equal(evento.mensagem.tipo, "imagem");
    assert.deepEqual(evento.mensagem.anexo, mensagem.anexo);
    const chave = (await chaveDoAnexo(mensagem.id))!.chave;
    const bruto = JSON.stringify(evento);
    assert.ok(!bruto.includes(chave) && !bruto.includes("http") && !bruto.includes("Signature"));

    const aviso = avisos.find((item) => item.mensagemId === mensagem.id)!;
    assert.equal(aviso.previaConteudo, PREVIA_IMAGEM);
    assert.ok(!JSON.stringify(aviso).includes("legenda secreta"));
  });

  it("histórico traz a imagem só com metadados; nenhuma chave em nenhum payload", async () => {
    const mensagem = await enviarOk(ana, conversaAB);
    const historico = await ctx.api(bruno, "GET", `/conversas/${conversaAB}/mensagens?limite=100`);
    const pagina = paginaMensagensSchema.parse(historico.json());
    const daImagem = pagina.mensagens.find((item) => item.id === mensagem.id);
    assert.deepEqual(daImagem?.anexo, mensagem.anexo);
    const chave = (await chaveDoAnexo(mensagem.id))!.chave;
    for (const corpo of [historico.body, JSON.stringify(mensagem), (await ctx.api(bruno, "GET", "/conversas")).body]) {
      assert.ok(!corpo.includes(chave) && !corpo.includes("imagem-conversa/") && !corpo.includes("jaa-privado"));
    }
    // Texto e pedido continuam com anexo null.
    assert.ok(pagina.mensagens.filter((item) => item.tipo !== "imagem").every((item) => item.anexo === null));
  });

  it("resposta a imagem: prévia = legenda, ou \"Foto\" sem legenda; imagem também responde a texto", async () => {
    const comLegenda = await enviarOk(ana, conversaAB, { legenda: "Pizza de calabresa" });
    const semLegenda = await enviarOk(ana, conversaAB);
    const respostaTexto = await ctx.api(bruno, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente: randomUUID(), conteudo: "Que delícia", mensagemRespondidaId: comLegenda.id });
    assert.equal(respostaTexto.statusCode, 201, respostaTexto.body);
    assert.deepEqual([respostaTexto.json().mensagemRespondida.tipo, respostaTexto.json().mensagemRespondida.previaConteudo], ["imagem", "Pizza de calabresa"]);

    const respostaImagem = await enviarOk(bruno, conversaAB, { mensagemRespondidaId: semLegenda.id });
    assert.deepEqual([respostaImagem.mensagemRespondida?.tipo, respostaImagem.mensagemRespondida?.previaConteudo], ["imagem", PREVIA_IMAGEM]);

    const imagemRespondeTexto = await enviarOk(ana, conversaAB, { mensagemRespondidaId: respostaTexto.json().id });
    assert.equal(imagemRespondeTexto.mensagemRespondida?.previaConteudo, "Que delícia");

    const deOutraConversa = await enviar(ana, conversaAC, { mensagemRespondidaId: comLegenda.id });
    assert.equal(deOutraConversa.statusCode, 404, deOutraConversa.body);
    assert.equal(deOutraConversa.json().codigo, "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA");
  });

  it("imagem não é editável (nem a legenda)", async () => {
    const mensagem = await enviarOk(ana, conversaAB, { legenda: "antes" });
    const edicao = await ctx.api(ana, "PATCH", `/conversas/${conversaAB}/mensagens/${mensagem.id}`, { conteudo: "depois" });
    assert.equal(edicao.statusCode, 409, edicao.body);
    assert.equal(edicao.json().codigo, "MENSAGEM_NAO_EDITAVEL");
  });
});

describe("URLs assinadas em lote", () => {
  it("participante recebe URL e expiraEm (~20 min); não participante, 404", async () => {
    const mensagem = await enviarOk(ana, conversaAB);
    const antes = Date.now();
    const resposta = await urls(bruno, conversaAB, [mensagem.id]);
    assert.equal(resposta.statusCode, 200, resposta.body);
    const [item] = urlsImagensSchema.parse(resposta.json()).imagens;
    assert.equal(item?.mensagemId, mensagem.id);
    assert.match(item?.url ?? "", /X-Amz-Expires=1200/);
    const validade = new Date(item!.expiraEm).getTime() - antes;
    assert.ok(validade > 19 * 60 * 1000 && validade <= 20 * 60 * 1000 + 5000, `validade ${validade}`);
    assert.deepEqual(Object.keys(item!).sort(), ["expiraEm", "mensagemId", "url"], "sem chave nem bucket como campo");

    const fora = await urls(carla, conversaAB, [mensagem.id]);
    assert.equal(fora.statusCode, 404, fora.body);
  });

  it("ids de texto, inexistentes ou de OUTRA conversa não vazam", async () => {
    const imagemAC = await enviarOk(ana, conversaAC);
    const imagemAB = await enviarOk(ana, conversaAB);
    const texto = await ctx.api(ana, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente: randomUUID(), conteudo: "oi" });
    assert.deepEqual(await idsComUrl(ana, conversaAB, [imagemAB.id, imagemAC.id, texto.json().id, randomUUID()]), [imagemAB.id]);
  });

  it("excluir para MIM: quem excluiu não recebe; o outro participante continua recebendo e o arquivo fica", async () => {
    const mensagem = await enviarOk(ana, conversaAB);
    const chave = (await chaveDoAnexo(mensagem.id))!.chave;
    const exclusao = await ctx.api(bruno, "DELETE", `/conversas/${conversaAB}/mensagens/${mensagem.id}?escopo=mim`);
    assert.equal(exclusao.statusCode, 200, exclusao.body);
    assert.deepEqual(await idsComUrl(bruno, conversaAB, [mensagem.id]), []);
    assert.deepEqual(await idsComUrl(ana, conversaAB, [mensagem.id]), [mensagem.id]);
    assert.ok(guardados.has(chave));
    assert.equal((await chaveDoAnexo(mensagem.id))!.removidoEm, null);
  });

  it("aceita até 100 ids por pedido", async () => {
    const ids = Array.from({ length: LIMITE_URLS_IMAGENS_POR_PEDIDO }, () => randomUUID());
    assert.equal((await urls(ana, conversaAB, ids)).statusCode, 200);
    assert.equal((await urls(ana, conversaAB, [...ids, randomUUID()])).statusCode, 400);
    assert.equal((await urls(ana, conversaAB, [])).statusCode, 400);
  });
});

describe("excluir para todos", () => {
  it("tombstone + removido_em na mesma transação; arquivo apagado depois; sem anexo e sem URL", async () => {
    const mensagem = await enviarOk(ana, conversaAB, { legenda: "vai sumir" });
    const chave = (await chaveDoAnexo(mensagem.id))!.chave;
    const exclusao = await ctx.api(ana, "DELETE", `/conversas/${conversaAB}/mensagens/${mensagem.id}?escopo=todos`);
    assert.equal(exclusao.statusCode, 200, exclusao.body);
    const tombstone = mensagemSchema.parse(exclusao.json());
    assert.deepEqual([tombstone.tipo, tombstone.conteudo, tombstone.anexo], ["imagem", "", null]);
    assert.ok(tombstone.excluidaEm);

    const anexo = await chaveDoAnexo(mensagem.id);
    assert.ok(anexo?.removidoEm, "removido_em marcado");
    assert.equal(anexo?.chave, chave, "a linha e a chave ficam para auditoria");
    assert.ok(removidas.includes(chave) && !guardados.has(chave), "arquivo apagado do bucket");
    assert.deepEqual(await idsComUrl(bruno, conversaAB, [mensagem.id]), []);
    const historico = paginaMensagensSchema.parse((await ctx.api(bruno, "GET", `/conversas/${conversaAB}/mensagens?limite=100`)).json());
    assert.equal(historico.mensagens.find((item) => item.id === mensagem.id)?.anexo, null);
  });

  it("falha ao apagar o arquivo não desfaz o tombstone (fica órfão para a varredura)", async () => {
    const mensagem = await enviarOk(ana, conversaAB);
    falharRemocao = true;
    try {
      const exclusao = await ctx.api(ana, "DELETE", `/conversas/${conversaAB}/mensagens/${mensagem.id}?escopo=todos`);
      assert.equal(exclusao.statusCode, 200, exclusao.body);
    } finally {
      falharRemocao = false;
    }
    assert.ok((await chaveDoAnexo(mensagem.id))?.removidoEm);
    assert.deepEqual(await idsComUrl(ana, conversaAB, [mensagem.id]), []);
  });
});

describe("limite de envios e bloqueio", () => {
  it("limite por conta é aplicado antes de processar e gravar", async () => {
    const [linha] = await ctx.banco.select({ usuarioId: identidades.usuarioId }).from(identidades).where(eq(identidades.id, carla.identidadeId));
    await ctx.banco.execute(sql`
      insert into rate_limits (id, key, count, last_request)
      values (${randomUUID()}, ${`jaa:envio-imagem-conversa:${linha!.usuarioId}`}, ${LIMITE_ENVIO_IMAGEM_CONVERSA.maximo}, ${Date.now()})
    `);
    const antes = gravacoes;
    // Arquivo inválido: se fosse processado, a resposta seria 400 — o 429 prova que nem foi lido.
    const resposta = await enviar(carla, conversaAC, { arquivo: { conteudo: Buffer.from("x"), tipo: "image/jpeg" } });
    assert.equal(resposta.statusCode, 429, resposta.body);
    assert.equal(resposta.json().codigo, "LIMITE_DE_ENVIOS_ATINGIDO");
    assert.ok(Number(resposta.headers["retry-after"]) > 0);
    assert.equal(gravacoes, antes);
  });

  it("bloqueio entre as pessoas impede o envio, como no texto, sem gravar", async () => {
    assert.ok([200, 201].includes((await ctx.api(bruno, "POST", "/bloqueios", { identidadeId: ana.identidadeId })).statusCode));
    try {
      const antes = gravacoes;
      const resposta = await enviar(ana, conversaAB);
      assert.equal(resposta.statusCode, 403, resposta.body);
      assert.equal(resposta.json().codigo, "COMUNICACAO_BLOQUEADA");
      assert.equal(gravacoes, antes);
    } finally {
      await ctx.api(bruno, "DELETE", `/bloqueios/${ana.identidadeId}`);
    }
  });
});
