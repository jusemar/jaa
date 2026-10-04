import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { anexosMensagem, identidades, mensagens } from "@jaa/banco/schema";
import {
  EVENTO_MENSAGEM_NOVA,
  EVENTO_NOTIFICACAO_NOVA_MENSAGEM,
  PREVIA_AUDIO,
  TAMANHO_MAXIMO_AUDIO_BYTES,
  TAMANHO_MAXIMO_IMAGEM_BYTES,
  mensagemSchema,
  paginaConversasSchema,
  paginaMensagensSchema,
  urlsAudiosSchema,
  urlsImagensSchema,
  type EventoMensagemNova,
  type EventoNotificacaoNovaMensagem,
  type Mensagem,
} from "@jaa/contratos";
import { eq, sql } from "drizzle-orm";
import type { ArmazenamentoPrivado } from "../src/lib/armazenamento/armazenamento-arquivos.js";
import { LIMITE_ENVIO_AUDIO_CONVERSA } from "../src/lib/armazenamento/receber-imagem.js";
import { mp4Falso, webmFalso } from "./apoio/audios-de-teste.js";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * MENSAGENS DE VOZ NA CONVERSA (API): envio multipart, formato pelos bytes, duração, idempotência,
 * bucket privado (FAKE, em memória), histórico, URLs assinadas, realtime, prévias e exclusão.
 */

const guardados = new Map<string, { conteudo: Buffer; tipoConteudo: string }>();
const removidas: string[] = [];
let gravacoes = 0;
let falharProximaGravacao = false;
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
    removidas.push(chave);
    guardados.delete(chave);
  },
  urlAssinadaLeitura(chave, { validadeSegundos = 1200 } = {}) {
    return `https://privado.teste.invalid/jaa-privado/${chave}?X-Amz-Expires=${validadeSegundos}&X-Amz-Signature=fake`;
  },
};

const PREFIXO = `aud${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987668201", "+5531987668202", "+5531987668203"],
  prefixoIp: "198.51.123.",
  armazenamentoPrivado,
});

let ana: Pessoa;
let bruno: Pessoa;
let carla: Pessoa;
let identidadeEmpresa = "";
let conversaAB = "";
let conversaAC = "";
let conversaEmpresaB = "";

type Envio = {
  idCliente?: string;
  duracaoMs?: number | string | null;
  mensagemRespondidaId?: string;
  arquivo?: { conteudo: Buffer; tipo: string; nome?: string };
  arquivoPrimeiro?: boolean;
};

async function enviar(pessoa: Pessoa, conversaId: string, envio: Envio = {}) {
  const arquivo = envio.arquivo ?? { conteudo: webmFalso(16_000), tipo: "audio/webm;codecs=opus" };
  const campos = [
    { campo: "idCliente", valor: envio.idCliente ?? randomUUID() },
    ...(envio.mensagemRespondidaId ? [{ campo: "mensagemRespondidaId", valor: envio.mensagemRespondidaId }] : []),
    ...(envio.duracaoMs === null ? [] : [{ campo: "duracaoMs", valor: String(envio.duracaoMs ?? 4000) }]),
  ];
  const parteArquivo = { arquivo: { nome: arquivo.nome ?? "audio.webm", tipo: arquivo.tipo, conteudo: arquivo.conteudo } };
  return ctx.enviarMultipart(pessoa, `/conversas/${conversaId}/mensagens/audio`, envio.arquivoPrimeiro ? [parteArquivo, ...campos] : [...campos, parteArquivo]);
}

async function enviarOk(pessoa: Pessoa, conversaId: string, envio: Envio = {}): Promise<Mensagem> {
  const resposta = await enviar(pessoa, conversaId, envio);
  assert.equal(resposta.statusCode, 201, resposta.body);
  return mensagemSchema.parse(resposta.json());
}

const urls = (pessoa: Pessoa, conversaId: string, mensagemIds: string[]) => ctx.api(pessoa, "POST", `/conversas/${conversaId}/audios/urls`, { mensagemIds });
const idsComUrl = async (pessoa: Pessoa, conversaId: string, mensagemIds: string[]) =>
  urlsAudiosSchema.parse((await urls(pessoa, conversaId, mensagemIds)).json()).audios.map((item) => item.mensagemId);
const anexoDe = async (mensagemId: string) => (await ctx.banco.select().from(anexosMensagem).where(eq(anexosMensagem.mensagemId, mensagemId)))[0];

async function abrirConversa(pessoa: Pessoa, nomeUsuario: string): Promise<string> {
  const resposta = await ctx.api(pessoa, "POST", "/conversas/diretas", { nomeUsuario });
  assert.ok([200, 201].includes(resposta.statusCode), resposta.body);
  return resposta.json().id;
}

const enviarTexto = async (pessoa: Pessoa, conversaId: string, conteudo: string, mensagemRespondidaId?: string): Promise<Mensagem> => {
  const resposta = await ctx.api(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente: randomUUID(), conteudo, ...(mensagemRespondidaId ? { mensagemRespondidaId } : {}) });
  assert.equal(resposta.statusCode, 201, resposta.body);
  return mensagemSchema.parse(resposta.json());
};

before(async () => {
  await ctx.iniciar();
  ana = await ctx.criarPessoa(0, `${PREFIXO}_ana`, "Ana Áudio");
  bruno = await ctx.criarPessoa(1, `${PREFIXO}_bruno`, "Bruno Áudio");
  carla = await ctx.criarPessoa(2, `${PREFIXO}_carla`, "Carla Fora");
  const empresa = await ctx.api(ana, "POST", "/empresas", { nome: "Loja Áudio", nomeUsuario: `${PREFIXO}_loja`, slug: `${PREFIXO}-loja` });
  assert.equal(empresa.statusCode, 201, empresa.body);
  identidadeEmpresa = empresa.json().identidadeId;
  conversaAB = await abrirConversa(ana, `${PREFIXO}_bruno`);
  conversaAC = await abrirConversa(ana, `${PREFIXO}_carla`);
  conversaEmpresaB = await abrirConversa(bruno, `${PREFIXO}_loja`);
});

after(() => ctx.encerrar());

describe("envio: autorização e campos", () => {
  it("participante envia: 201, mensagem audio sem conteúdo, anexo só com duração, original no bucket privado", async () => {
    const antes = gravacoes;
    const conteudo = webmFalso(16_000);
    const mensagem = await enviarOk(ana, conversaAB, { arquivo: { conteudo, tipo: "audio/webm;codecs=opus" }, duracaoMs: 4000 });
    assert.deepEqual([mensagem.tipo, mensagem.conteudo, mensagem.pedido, mensagem.estado], ["audio", "", null, "enviada"]);
    assert.deepEqual({ ...mensagem.anexo, id: undefined }, { id: undefined, tipo: "audio", duracaoMs: 4000 });
    assert.equal(gravacoes, antes + 1);

    const anexo = (await anexoDe(mensagem.id))!;
    assert.match(anexo.chave, new RegExp(`^audio-conversa/${conversaAB}/[0-9a-f-]{36}\\.webm$`));
    assert.deepEqual([anexo.tipo, anexo.tipoConteudo, anexo.tamanhoBytes, anexo.duracaoMs, anexo.largura, anexo.altura], ["audio", "audio/webm", conteudo.length, 4000, null, null]);
    const guardado = guardados.get(anexo.chave)!;
    assert.equal(guardado.tipoConteudo, "audio/webm");
    assert.ok(guardado.conteudo.equals(conteudo), "o original é guardado como veio (sem reencodar)");
    assert.ok(!JSON.stringify(mensagem).includes(anexo.chave) && !JSON.stringify(mensagem).includes("http"));
  });

  it("MP4/AAC (o que o app e o Safari gravam): a duração vem do ARQUIVO, não do cliente", async () => {
    const mensagem = await enviarOk(ana, conversaAB, { arquivo: { conteudo: mp4Falso({ duracaoMs: 7300 }), tipo: "audio/mp4", nome: "audio.m4a" }, duracaoMs: 1000 });
    assert.deepEqual({ ...mensagem.anexo, id: undefined }, { id: undefined, tipo: "audio", duracaoMs: 7300 });
    const anexo = (await anexoDe(mensagem.id))!;
    assert.ok(anexo.chave.endsWith(".m4a"));
    assert.equal(anexo.tipoConteudo, "audio/mp4");
  });

  it("não participante: 404 sem ler nem gravar (nem um arquivo inválido chega a ser lido)", async () => {
    const antes = gravacoes;
    const resposta = await enviar(carla, conversaAB, { arquivo: { conteudo: Buffer.from("lixo"), tipo: "audio/webm" } });
    assert.equal(resposta.statusCode, 404, resposta.body);
    assert.equal(resposta.json().codigo, "CONVERSA_NAO_ENCONTRADA");
    assert.equal(gravacoes, antes);
  });

  it("identidade empresarial operada envia como a empresa; sem vínculo, 403", async () => {
    const mensagem = await enviarOk(como(ana, identidadeEmpresa), conversaEmpresaB);
    assert.equal(mensagem.remetenteIdentidadeId, identidadeEmpresa);
    assert.equal((await enviar(como(bruno, identidadeEmpresa), conversaEmpresaB)).statusCode, 403);
  });

  it("campos depois do arquivo não valem; sem idCliente ou sem duracaoMs antes do arquivo, 400 sem gravar", async () => {
    const antes = gravacoes;
    for (const envio of [{ arquivoPrimeiro: true }, { duracaoMs: null }, { duracaoMs: "abc" }, { duracaoMs: "0" }, { idCliente: "nao-e-uuid" }] satisfies Envio[]) {
      const resposta = await enviar(ana, conversaAB, envio);
      assert.equal(resposta.statusCode, 400, resposta.body);
      assert.equal(resposta.json().codigo, "DADOS_INVALIDOS");
    }
    assert.equal(gravacoes, antes);
  });
});

describe("envio: arquivo", () => {
  it("MIME recusado, bytes de outro formato e MIME que discorda dos bytes: 400 sem gravar", async () => {
    const antes = gravacoes;
    const casos: Envio["arquivo"][] = [
      { conteudo: webmFalso(), tipo: "audio/mpeg", nome: "musica.mp3" },
      { conteudo: webmFalso(), tipo: "audio/ogg" },
      { conteudo: webmFalso(), tipo: "application/octet-stream" },
      { conteudo: Buffer.from("ID3 isto é um mp3 renomeado".padEnd(4000, "x")), tipo: "audio/webm", nome: "audio.webm" },
      { conteudo: mp4Falso({ duracaoMs: 4000 }), tipo: "audio/webm", nome: "audio.webm" },
      { conteudo: mp4Falso({ duracaoMs: 4000, marca: "qt  " }), tipo: "audio/mp4" },
      { conteudo: Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(4000)]), tipo: "audio/mp4", nome: "foto.m4a" },
    ];
    for (const arquivo of casos) {
      const resposta = await enviar(ana, conversaAB, { arquivo: arquivo! });
      assert.equal(resposta.statusCode, 400, `${arquivo!.tipo}: ${resposta.body}`);
      assert.equal(resposta.json().codigo, "ARQUIVO_INVALIDO");
    }
    assert.equal(gravacoes, antes);
  });

  it("duração: curta demais, acima de 10 minutos e incoerente com o tamanho são recusadas", async () => {
    const antes = gravacoes;
    for (const envio of [
      { duracaoMs: 200 },
      { duracaoMs: 11 * 60_000, arquivo: { conteudo: webmFalso(3_000_000), tipo: "audio/webm" } },
      { duracaoMs: 1000, arquivo: { conteudo: webmFalso(5_000_000), tipo: "audio/webm" } },
      { duracaoMs: 4000, arquivo: { conteudo: mp4Falso({ duracaoMs: 11 * 60_000, bytes: 3_000_000 }), tipo: "audio/mp4" } },
    ] satisfies Envio[]) {
      const resposta = await enviar(ana, conversaAB, envio);
      assert.equal(resposta.statusCode, 400, resposta.body);
      assert.equal(resposta.json().codigo, "ARQUIVO_INVALIDO");
    }
    assert.equal(gravacoes, antes);
  });

  it("tamanho: o limite do áudio (10 MB) é o desta rota — passa do das imagens e é recusado acima dele", async () => {
    assert.ok(TAMANHO_MAXIMO_AUDIO_BYTES > TAMANHO_MAXIMO_IMAGEM_BYTES);
    const grande = await enviarOk(ana, conversaAB, { arquivo: { conteudo: webmFalso(TAMANHO_MAXIMO_IMAGEM_BYTES + 500_000), tipo: "audio/webm" }, duracaoMs: 9 * 60_000 });
    assert.equal(grande.anexo?.tipo, "audio");
    const antes = gravacoes;
    const resposta = await enviar(ana, conversaAB, { arquivo: { conteudo: webmFalso(TAMANHO_MAXIMO_AUDIO_BYTES + 1024), tipo: "audio/webm" }, duracaoMs: 9 * 60_000 });
    assert.equal(resposta.statusCode, 413, resposta.body);
    assert.equal(resposta.json().codigo, "ARQUIVO_INVALIDO");
    assert.equal(gravacoes, antes);
  });
});

describe("envio: idempotência", () => {
  it("retry com o mesmo idCliente devolve a mesma mensagem sem ler nem gravar de novo", async () => {
    const idCliente = randomUUID();
    const primeira = await enviarOk(ana, conversaAB, { idCliente });
    const antes = gravacoes;
    // Arquivo inválido no retry: se fosse lido, daria 400. O 200 prova que nem foi aberto.
    const retry = await enviar(ana, conversaAB, { idCliente, arquivo: { conteudo: Buffer.from("x"), tipo: "audio/webm" } });
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().id, primeira.id);
    assert.equal(gravacoes, antes);
    assert.equal((await ctx.banco.select({ id: mensagens.id }).from(mensagens).where(eq(mensagens.idCliente, idCliente))).length, 1);
  });

  it("mesmo idCliente com outra resposta, em outra conversa ou já usado por texto/imagem: 409", async () => {
    const idCliente = randomUUID();
    const alvo = await enviarTexto(bruno, conversaAB, "responde isto");
    await enviarOk(ana, conversaAB, { idCliente });
    assert.equal((await enviar(ana, conversaAB, { idCliente, mensagemRespondidaId: alvo.id })).statusCode, 409);
    assert.equal((await enviar(ana, conversaAC, { idCliente })).statusCode, 409);
    const texto = await ctx.api(ana, "POST", `/conversas/${conversaAB}/mensagens`, { idCliente: randomUUID(), conteudo: "oi" });
    const idDoTexto = (await ctx.banco.select({ idCliente: mensagens.idCliente }).from(mensagens).where(eq(mensagens.id, texto.json().id)))[0]!.idCliente;
    const reuso = await enviar(ana, conversaAB, { idCliente: idDoTexto });
    assert.equal(reuso.statusCode, 409, reuso.body);
    assert.equal(reuso.json().codigo, "ID_CLIENTE_REUTILIZADO");
  });

  it("duas tentativas simultâneas: uma mensagem, um anexo, e o arquivo perdedor é removido", async () => {
    const idCliente = randomUUID();
    const removidasAntes = removidas.length;
    atrasoGravacaoMs = 150;
    const [a, b] = await Promise.all([enviar(ana, conversaAB, { idCliente }), enviar(ana, conversaAB, { idCliente })]);
    atrasoGravacaoMs = 0;
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 201]);
    assert.equal(a.json().id, b.json().id);
    const linhas = await ctx.banco.select({ id: mensagens.id }).from(mensagens).where(eq(mensagens.idCliente, idCliente));
    assert.equal(linhas.length, 1);
    const anexo = await anexoDe(linhas[0]!.id);
    assert.ok(anexo && guardados.has(anexo.chave), "o arquivo da vencedora existe");
    assert.equal(removidas.length, removidasAntes + 1, "o da perdedora foi removido");
  });

  it("falha ao gravar no bucket: nenhuma mensagem é criada", async () => {
    const idCliente = randomUUID();
    falharProximaGravacao = true;
    const resposta = await enviar(ana, conversaAB, { idCliente });
    assert.equal(resposta.statusCode, 500);
    assert.equal((await ctx.banco.select({ id: mensagens.id }).from(mensagens).where(eq(mensagens.idCliente, idCliente))).length, 0);
  });
});

describe("histórico, realtime, prévias e lista", () => {
  it("mensagem:nova leva tipo audio e anexo com duração, sem URL e sem chave; a notificação diz só \"Áudio\"", async () => {
    const socketB = await ctx.conectar(bruno);
    const novas = coletar<EventoMensagemNova>(socketB, EVENTO_MENSAGEM_NOVA);
    const avisos = coletar<EventoNotificacaoNovaMensagem>(socketB, EVENTO_NOTIFICACAO_NOVA_MENSAGEM);
    const mensagem = await enviarOk(ana, conversaAB);
    await aguardarAte(() => novas.some((evento) => evento.mensagem.id === mensagem.id) && avisos.some((aviso) => aviso.mensagemId === mensagem.id));

    const evento = novas.find((item) => item.mensagem.id === mensagem.id)!;
    assert.equal(evento.mensagem.tipo, "audio");
    assert.deepEqual(evento.mensagem.anexo, mensagem.anexo);
    const chave = (await anexoDe(mensagem.id))!.chave;
    const bruto = JSON.stringify(evento);
    assert.ok(!bruto.includes(chave) && !bruto.includes("http") && !bruto.includes("Signature") && !bruto.includes("webm"));
    assert.equal(avisos.find((item) => item.mensagemId === mensagem.id)!.previaConteudo, PREVIA_AUDIO);
  });

  it("histórico e lista de conversas trazem o áudio só com metadados", async () => {
    const mensagem = await enviarOk(ana, conversaAB);
    const chave = (await anexoDe(mensagem.id))!.chave;
    const historico = await ctx.api(bruno, "GET", `/conversas/${conversaAB}/mensagens?limite=100`);
    const lida = paginaMensagensSchema.parse(historico.json()).mensagens.find((item) => item.id === mensagem.id)!;
    assert.deepEqual([lida.tipo, lida.conteudo, lida.anexo], ["audio", "", mensagem.anexo]);
    assert.ok(!historico.body.includes(chave) && !historico.body.includes("audio-conversa/"));

    const lista = await ctx.api(bruno, "GET", "/conversas");
    const item = paginaConversasSchema.parse(lista.json()).conversas.find((conversa) => conversa.id === conversaAB)!;
    assert.deepEqual([item.ultimaMensagem?.id, item.ultimaMensagem?.tipo, item.ultimaMensagem?.conteudo], [mensagem.id, "audio", ""]);
    assert.ok(item.naoLidas >= 1, "áudio recebido conta como não lida");
    assert.ok(!lista.body.includes("audio-conversa/"));
  });

  it("resposta a áudio: prévia \"Áudio\"; áudio também responde a outra mensagem", async () => {
    const audio = await enviarOk(ana, conversaAB);
    const resposta = await enviarTexto(bruno, conversaAB, "ouvi!", audio.id);
    assert.deepEqual([resposta.mensagemRespondida?.tipo, resposta.mensagemRespondida?.previaConteudo, resposta.mensagemRespondida?.conteudoTruncado], ["audio", PREVIA_AUDIO, false]);

    const audioEmResposta = await enviarOk(bruno, conversaAB, { mensagemRespondidaId: resposta.id });
    assert.deepEqual([audioEmResposta.mensagemRespondida?.id, audioEmResposta.mensagemRespondida?.previaConteudo], [resposta.id, "ouvi!"]);
    const deOutraConversa = await enviarTexto(ana, conversaAC, "outra conversa");
    const recusada = await enviar(ana, conversaAB, { mensagemRespondidaId: deOutraConversa.id });
    assert.equal(recusada.statusCode, 404);
    assert.equal(recusada.json().codigo, "MENSAGEM_RESPONDIDA_NAO_ENCONTRADA");
  });

  it("áudio não é editável", async () => {
    const audio = await enviarOk(ana, conversaAB);
    const edicao = await ctx.api(ana, "PATCH", `/conversas/${conversaAB}/mensagens/${audio.id}`, { conteudo: "virou texto" });
    assert.equal(edicao.statusCode, 409, edicao.body);
    assert.equal(edicao.json().codigo, "MENSAGEM_NAO_EDITAVEL");
  });
});

describe("URLs assinadas", () => {
  it("participante recebe URL e expiraEm (~20 min); não participante, 404", async () => {
    const mensagem = await enviarOk(ana, conversaAB);
    const antes = Date.now();
    const resposta = await urls(bruno, conversaAB, [mensagem.id]);
    assert.equal(resposta.statusCode, 200, resposta.body);
    const [item] = urlsAudiosSchema.parse(resposta.json()).audios;
    assert.equal(item?.mensagemId, mensagem.id);
    assert.ok(item!.url.includes((await anexoDe(mensagem.id))!.chave) && item!.url.includes("X-Amz-Signature"));
    const validade = new Date(item!.expiraEm).getTime() - antes;
    assert.ok(validade > 19 * 60_000 && validade <= 21 * 60_000);
    assert.equal((await urls(carla, conversaAB, [mensagem.id])).statusCode, 404);
  });

  it("cada rota entrega só o SEU tipo: áudio não sai em /imagens/urls; texto, inexistente e de outra conversa não vazam", async () => {
    const audio = await enviarOk(ana, conversaAB);
    const texto = await enviarTexto(ana, conversaAB, "texto");
    const deOutra = await enviarOk(ana, conversaAC);
    assert.deepEqual(await idsComUrl(bruno, conversaAB, [audio.id, texto.id, deOutra.id, randomUUID()]), [audio.id]);
    const comoImagem = await ctx.api(bruno, "POST", `/conversas/${conversaAB}/imagens/urls`, { mensagemIds: [audio.id] });
    assert.deepEqual(urlsImagensSchema.parse(comoImagem.json()).imagens, []);
  });

  it("apagar para MIM: quem apagou não recebe URL; o outro continua recebendo e o arquivo fica", async () => {
    const mensagem = await enviarOk(ana, conversaAB);
    const chave = (await anexoDe(mensagem.id))!.chave;
    assert.equal((await ctx.api(bruno, "DELETE", `/conversas/${conversaAB}/mensagens/${mensagem.id}?escopo=mim`)).statusCode, 200);
    assert.deepEqual(await idsComUrl(bruno, conversaAB, [mensagem.id]), []);
    assert.deepEqual(await idsComUrl(ana, conversaAB, [mensagem.id]), [mensagem.id]);
    assert.ok(guardados.has(chave) && !(await anexoDe(mensagem.id))!.removidoEm);
  });
});

describe("apagar para todos", () => {
  it("tombstone + removido_em na mesma transação; arquivo apagado depois; sem anexo e sem URL", async () => {
    const mensagem = await enviarOk(ana, conversaAB);
    const chave = (await anexoDe(mensagem.id))!.chave;
    const exclusao = await ctx.api(ana, "DELETE", `/conversas/${conversaAB}/mensagens/${mensagem.id}?escopo=todos`);
    assert.equal(exclusao.statusCode, 200, exclusao.body);
    const tombstone = mensagemSchema.parse(exclusao.json());
    assert.deepEqual([tombstone.tipo, tombstone.conteudo, tombstone.anexo], ["audio", "", null]);
    const anexo = await anexoDe(mensagem.id);
    assert.ok(anexo?.removidoEm && anexo.chave === chave, "linha e chave ficam para auditoria");
    assert.ok(removidas.includes(chave) && !guardados.has(chave), "arquivo apagado do bucket");
    assert.deepEqual(await idsComUrl(bruno, conversaAB, [mensagem.id]), []);
    assert.equal((await ctx.api(bruno, "DELETE", `/conversas/${conversaAB}/mensagens/${mensagem.id}?escopo=todos`)).statusCode, 403, "só o autor apaga para todos");
  });
});

describe("limite de envios e bloqueio", () => {
  it("limite por conta, próprio do áudio, é aplicado antes de ler e gravar", async () => {
    const [linha] = await ctx.banco.select({ usuarioId: identidades.usuarioId }).from(identidades).where(eq(identidades.id, carla.identidadeId));
    await ctx.banco.execute(sql`
      insert into rate_limits (id, key, count, last_request)
      values (${randomUUID()}, ${`jaa:envio-audio-conversa:${linha!.usuarioId}`}, ${LIMITE_ENVIO_AUDIO_CONVERSA.maximo}, ${Date.now()})
    `);
    const antes = gravacoes;
    const resposta = await enviar(carla, conversaAC, { arquivo: { conteudo: Buffer.from("x"), tipo: "audio/webm" } });
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
