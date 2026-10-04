import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { EVENTO_CONVERSA_OBSERVAR, type RespostaObservarConversa } from "@jaa/contratos";
import sharp from "sharp";
import type { Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { criarAmbienteIntegracao, como, type Pessoa } from "./apoio/integracao.js";
import type { ArmazenamentoDeArquivos } from "../src/lib/armazenamento/armazenamento-arquivos.js";
import { LIMITE_ENVIO_FOTO_PERFIL } from "../src/lib/armazenamento/receber-imagem.js";
import { consumirLimiteDeUso } from "../src/lib/limite-de-uso.js";

/*
 * PERFIL, STATUS ESCOLHIDO e PRIVACIDADE.
 *
 * O armazenamento é FAKE (em memória): nenhuma credencial real do Cloudflare é usada, e o teste
 * ainda assim exercita o caminho inteiro — pipeline de imagem, gravação da chave e URL pública.
 */

const TELEFONES = ["+5531987663001", "+5531987663002", "+5531987663003"];

const guardados = new Map<string, { conteudo: Buffer; tipoConteudo: string }>();
// Toda chamada a `salvar`, aceita ou não: prova que pedido recusado nunca chega ao storage.
let gravacoes = 0;
const armazenamentoFake: ArmazenamentoDeArquivos = {
  nome: "teste",
  async salvar({ chave, conteudo, tipoConteudo }) {
    gravacoes += 1;
    guardados.set(chave, { conteudo, tipoConteudo });
    return { chave };
  },
  async remover(chave) {
    guardados.delete(chave);
  },
  urlPublica: (chave) => `https://arquivos.teste.invalid/${chave}`,
};

const ctx = criarAmbienteIntegracao({ telefones: TELEFONES, prefixoIp: "198.51.103.", armazenamento: armazenamentoFake });

let ana: Pessoa;
let bruno: Pessoa;
let carla: Pessoa;
let empresaId = "";
let identidadeEmpresa = "";

const imagemJpeg = (largura = 900) => sharp({ create: { width: largura, height: largura, channels: 3, background: "#2f6f4f" } }).jpeg().toBuffer();

before(async () => {
  await ctx.iniciar();
  ana = await ctx.criarPessoa(0, "ana_perfil", "Ana Perfil");
  bruno = await ctx.criarPessoa(1, "bruno_perfil", "Bruno Perfil");
  carla = await ctx.criarPessoa(2, "carla_perfil", "Carla Perfil");

  const empresa = await ctx.api(ana, "POST", "/empresas", { nome: "Padaria da Ana", nomeUsuario: "padaria_ana", slug: "padaria-ana" });
  assert.equal(empresa.statusCode, 201, empresa.body);
  empresaId = empresa.json().id;
  identidadeEmpresa = empresa.json().identidadeId;
});

after(async () => {
  await ctx.encerrar();
});

describe("perfil da própria identidade", () => {
  it("nasce vazio com privacidade restritiva e aceita edição parcial", async () => {
    const inicial = await ctx.api(ana, "GET", "/perfil");
    assert.equal(inicial.statusCode, 200, inicial.body);
    assert.deepEqual(
      [inicial.json().fotoUrl, inicial.json().fraseStatus, inicial.json().cidade, inicial.json().sobre],
      [null, null, null, null],
      "perfil novo não inventa dado nenhum",
    );
    // Padrões: foto e presença como já era antes desta etapa; o status, que é novo, começa restrito.
    assert.deepEqual(inicial.json().privacidade, {
      buscavelPorTelefone: false,
      visibilidadeFoto: "todos",
      visibilidadeStatus: "contatos",
      visibilidadePresenca: "todos",
    });
    assert.equal(inicial.json().statusEscolhido, "disponivel");

    const editado = await ctx.api(ana, "PATCH", "/perfil", { fraseStatus: "  Respondo   à noite  ", cidade: "Belo Horizonte" });
    assert.equal(editado.statusCode, 200, editado.body);
    assert.equal(editado.json().fraseStatus, "Respondo à noite", "espaços são normalizados");
    assert.equal(editado.json().nomeExibicao, "Ana Perfil", "edição parcial não apaga o resto");

    const limpa = await ctx.api(ana, "PATCH", "/perfil", { fraseStatus: "   " });
    assert.equal(limpa.json().fraseStatus, null, "texto vazio vira null, não string vazia");
  });

  it("agindo como a empresa, 'meu perfil' é o perfil DA EMPRESA", async () => {
    const perfil = await ctx.api(como(ana, identidadeEmpresa), "GET", "/perfil");
    assert.equal(perfil.statusCode, 200, perfil.body);
    assert.equal(perfil.json().identidadeId, identidadeEmpresa);
    assert.equal(perfil.json().tipo, "empresarial");

    const editado = await ctx.api(como(ana, identidadeEmpresa), "PATCH", "/perfil", { sobre: "Pães e doces desde 1998." });
    assert.equal(editado.json().sobre, "Pães e doces desde 1998.");
    // O perfil pessoal da mesma conta continua separado.
    assert.equal((await ctx.api(ana, "GET", "/perfil")).json().sobre, null);
  });

  it("quem não opera a identidade não edita o perfil dela", async () => {
    const tentativa = await ctx.api(como(bruno, identidadeEmpresa), "PATCH", "/perfil", { sobre: "Invadido" });
    assert.equal(tentativa.statusCode, 403);
    assert.equal((await ctx.api(como(ana, identidadeEmpresa), "GET", "/perfil")).json().sobre, "Pães e doces desde 1998.");
  });
});

describe("foto do perfil", () => {
  it("processa a imagem, remove metadados, redimensiona e guarda a CHAVE (não a URL)", async () => {
    const envio = await ctx.enviarArquivo(ana, "/perfil/foto", { nome: "eu.jpg", tipo: "image/jpeg", conteudo: await imagemJpeg(900) });
    assert.equal(envio.statusCode, 200, envio.body);
    const { chave, url } = envio.json();
    assert.match(chave, /^avatar\//);
    assert.equal(url, `https://arquivos.teste.invalid/${chave}`);

    const guardado = guardados.get(chave);
    assert.ok(guardado);
    assert.equal(guardado.tipoConteudo, "image/webp", "sempre reencodada: o arquivo original não vai para o storage");
    const metadados = await sharp(guardado.conteudo).metadata();
    assert.equal(metadados.width, 512, "avatar cabe em 512px");
    assert.equal(metadados.exif, undefined, "EXIF (com geolocalização) não pode sobreviver ao upload");

    assert.equal((await ctx.api(ana, "GET", "/perfil")).json().fotoUrl, url);
  });

  it("trocar a foto apaga a anterior; remover volta para as iniciais", async () => {
    const anterior = (await ctx.api(ana, "GET", "/perfil")).json().fotoUrl as string;
    const nova = await ctx.enviarArquivo(ana, "/perfil/foto", { nome: "eu2.png", tipo: "image/png", conteudo: await imagemJpeg(200) });
    assert.equal(nova.statusCode, 200, nova.body);
    assert.notEqual(nova.json().url, anterior, "a URL muda a cada envio (cache de CDN não mostra a foto velha)");
    assert.equal(guardados.has(anterior.split("/").slice(3).join("/")), false, "a imagem antiga é removida do armazenamento");

    const removida = await ctx.api(ana, "DELETE", "/perfil/foto");
    assert.equal(removida.statusCode, 200);
    assert.equal((await ctx.api(ana, "GET", "/perfil")).json().fotoUrl, null);
  });

  it("recusa arquivo que não é imagem — mesmo se declarar que é", async () => {
    const envio = await ctx.enviarArquivo(ana, "/perfil/foto", { nome: "virus.png", tipo: "image/png", conteudo: Buffer.from("<?php echo 1; ?>") });
    assert.equal(envio.statusCode, 400, envio.body);
    assert.equal(envio.json().codigo, "ARQUIVO_INVALIDO");
  });

  it("a logo da empresa usa a mesma rota e o mesmo pipeline", async () => {
    const envio = await ctx.enviarArquivo(como(ana, identidadeEmpresa), "/perfil/foto", { nome: "logo.jpg", tipo: "image/jpeg", conteudo: await imagemJpeg(700) });
    assert.equal(envio.statusCode, 200, envio.body);
    assert.match(envio.json().chave, new RegExp(`^logo-empresa/${identidadeEmpresa}/`));
    assert.ok((await ctx.api(como(ana, identidadeEmpresa), "GET", "/perfil")).json().fotoUrl);
    // A logo é da EMPRESA: o avatar pessoal da Ana não muda por isso.
    assert.equal((await ctx.api(ana, "GET", "/perfil")).json().fotoUrl, null);
  });

  it("quem não opera a empresa não troca a logo dela, e nada chega ao storage", async () => {
    const antes = gravacoes;
    const envio = await ctx.enviarArquivo(como(bruno, identidadeEmpresa), "/perfil/foto", { nome: "logo.jpg", tipo: "image/jpeg", conteudo: await imagemJpeg(300) });
    assert.equal(envio.statusCode, 403, envio.body);
    assert.equal(envio.json().codigo, "IDENTIDADE_NAO_AUTORIZADA");
    assert.equal((await ctx.api(como(bruno, identidadeEmpresa), "DELETE", "/perfil/foto")).statusCode, 403);
    assert.equal(gravacoes, antes);
    assert.ok((await ctx.api(como(ana, identidadeEmpresa), "GET", "/perfil")).json().fotoUrl, "a logo continua lá");
  });

  it("sem sessão não envia nem remove foto", async () => {
    const antes = gravacoes;
    const anonimo = { ...ana, cookie: "" };
    const envio = await ctx.enviarArquivo(anonimo, "/perfil/foto", { nome: "eu.jpg", tipo: "image/jpeg", conteudo: await imagemJpeg(300) });
    assert.equal(envio.statusCode, 401, envio.body);
    assert.equal((await ctx.api(anonimo, "DELETE", "/perfil/foto")).statusCode, 401);
    assert.equal(gravacoes, antes);
  });

  it("arquivo acima do limite e corpo que não é multipart viram erro claro, sem gravar nada", async () => {
    const antes = gravacoes;
    const grande = await ctx.enviarArquivo(bruno, "/perfil/foto", { nome: "grande.jpg", tipo: "image/jpeg", conteudo: Buffer.alloc(8 * 1024 * 1024 + 1, 1) });
    assert.equal(grande.statusCode, 413, grande.body);
    assert.equal(grande.json().codigo, "ARQUIVO_INVALIDO");

    const json = await ctx.api(bruno, "POST", "/perfil/foto", { arquivo: "não é arquivo" });
    assert.equal(json.statusCode, 400, json.body);
    assert.equal(json.json().codigo, "DADOS_INVALIDOS");
    assert.equal(gravacoes, antes);
  });

  it("limita envios seguidos por conta, antes de processar a imagem", async () => {
    // Envios inválidos também contam: cada um custou leitura e tentativa de decodificação.
    for (let envio = 0; envio < LIMITE_ENVIO_FOTO_PERFIL.maximo; envio += 1) {
      const recusado = await ctx.enviarArquivo(carla, "/perfil/foto", { nome: "x.png", tipo: "image/png", conteudo: Buffer.from("nada") });
      assert.equal(recusado.statusCode, 400, recusado.body);
    }
    const antes = gravacoes;
    const excedido = await ctx.enviarArquivo(carla, "/perfil/foto", { nome: "eu.jpg", tipo: "image/jpeg", conteudo: await imagemJpeg(300) });
    assert.equal(excedido.statusCode, 429, excedido.body);
    assert.equal(excedido.json().codigo, "LIMITE_DE_ENVIOS_ATINGIDO");
    assert.ok(Number(excedido.headers["retry-after"]) > 0);
    assert.equal(gravacoes, antes, "envio acima do limite não chega ao storage");

    // O limite é da CONTA de Carla, não de todo mundo.
    const outro = await ctx.enviarArquivo(bruno, "/perfil/foto", { nome: "eu.jpg", tipo: "image/jpeg", conteudo: await imagemJpeg(300) });
    assert.equal(outro.statusCode, 200, outro.body);
  });
});

describe("limite de uso", () => {
  it("conta numa janela fixa, recusa o excedente e libera quando a janela vence", async () => {
    const chave = `teste:${randomUUID()}`;
    const regra = { janelaSegundos: 60, maximo: 2 };
    const inicio = 1_000_000;
    assert.deepEqual(await consumirLimiteDeUso(ctx.banco, chave, regra, inicio), { permitido: true });
    assert.deepEqual(await consumirLimiteDeUso(ctx.banco, chave, regra, inicio + 1_000), { permitido: true });
    assert.deepEqual(await consumirLimiteDeUso(ctx.banco, chave, regra, inicio + 2_000), { permitido: false, tenteNovamenteEmSegundos: 58 });
    assert.deepEqual(await consumirLimiteDeUso(ctx.banco, chave, regra, inicio + 60_000), { permitido: true }, "janela nova");
  });

  it("requisições simultâneas não passam juntas pela mesma vaga", async () => {
    const chave = `teste:${randomUUID()}`;
    const resultados = await Promise.all(Array.from({ length: 10 }, () => consumirLimiteDeUso(ctx.banco, chave, { janelaSegundos: 60, maximo: 3 })));
    assert.equal(resultados.filter((resultado) => resultado.permitido).length, 3);
  });
});

describe("status escolhido e visibilidade", () => {
  it("status é escolha da pessoa e não se confunde com presença", async () => {
    const salvo = await ctx.api(ana, "PATCH", "/perfil/privacidade", { statusEscolhido: "ocupado" });
    assert.equal(salvo.statusCode, 200, salvo.body);
    assert.equal(salvo.json().statusEscolhido, "ocupado");
    assert.equal(salvo.json().privacidade.visibilidadeStatus, "contatos", "mudar o status não mexe na visibilidade");
  });

  it("'contatos' esconde de quem não é contato e mostra para quem é", async () => {
    await ctx.api(ana, "PATCH", "/perfil", { fraseStatus: "Em reunião" });
    // Bruno ainda não é contato de Ana (a agenda é unilateral e de quem SALVA).
    const semAgenda = await ctx.api(bruno, "GET", `/identidades/${ana.identidadeId}/perfil`);
    assert.equal(semAgenda.statusCode, 200, semAgenda.body);
    assert.deepEqual([semAgenda.json().status, semAgenda.json().fraseStatus], [null, null]);
    assert.equal(semAgenda.json().nomeExibicao, "Ana Perfil", "nome e @usuario são públicos: sem eles não há mensageiro");

    // Quem decide é a agenda de QUEM É VISTO: Ana salva Bruno, então Bruno passa a ver.
    assert.equal((await ctx.api(ana, "POST", "/contatos", { identidadeId: bruno.identidadeId })).statusCode, 201);
    const comAgenda = await ctx.api(bruno, "GET", `/identidades/${ana.identidadeId}/perfil`);
    assert.deepEqual([comAgenda.json().status, comAgenda.json().fraseStatus], ["ocupado", "Em reunião"]);
  });

  it("'ninguem' esconde até de contato; o próprio dono continua vendo tudo", async () => {
    assert.equal((await ctx.api(ana, "PATCH", "/perfil/privacidade", { visibilidadeStatus: "ninguem" })).statusCode, 200);
    assert.equal((await ctx.api(bruno, "GET", `/identidades/${ana.identidadeId}/perfil`)).json().status, null);
    assert.equal((await ctx.api(ana, "GET", "/perfil")).json().statusEscolhido, "ocupado");
    await ctx.api(ana, "PATCH", "/perfil/privacidade", { visibilidadeStatus: "contatos" });
  });

  it("INVISÍVEL não vaza para ninguém, nem para contato", async () => {
    await ctx.api(ana, "PATCH", "/perfil/privacidade", { statusEscolhido: "invisivel" });
    assert.equal((await ctx.api(bruno, "GET", `/identidades/${ana.identidadeId}/perfil`)).json().status, null);
    assert.equal((await ctx.api(ana, "GET", "/perfil")).json().statusEscolhido, "invisivel", "o dono sempre sabe que está invisível");
    await ctx.api(ana, "PATCH", "/perfil/privacidade", { statusEscolhido: "disponivel" });
  });

  it("exceções vencem a regra geral, nos dois sentidos", async () => {
    await ctx.api(ana, "PATCH", "/perfil/privacidade", { visibilidadeStatus: "ninguem" });
    // "Some para o meu chefe" e "aparece só para esta pessoa" são a mesma tabela, decisões opostas.
    assert.equal((await ctx.api(ana, "PUT", "/perfil/excecoes", { identidadeId: carla.identidadeId, decisao: "permitir" })).statusCode, 200);
    assert.equal((await ctx.api(carla, "GET", `/identidades/${ana.identidadeId}/perfil`)).json().status, "disponivel");

    await ctx.api(ana, "PATCH", "/perfil/privacidade", { visibilidadeStatus: "todos" });
    assert.equal((await ctx.api(ana, "PUT", "/perfil/excecoes", { identidadeId: bruno.identidadeId, decisao: "bloquear" })).statusCode, 200);
    assert.equal((await ctx.api(bruno, "GET", `/identidades/${ana.identidadeId}/perfil`)).json().status, null);
    assert.equal((await ctx.api(carla, "GET", `/identidades/${ana.identidadeId}/perfil`)).json().status, "disponivel");

    const lista = await ctx.api(ana, "GET", "/perfil/excecoes");
    assert.deepEqual(
      lista.json().excecoes.map((e: { identidade: { nomeUsuario: string }; decisao: string }) => [e.identidade.nomeUsuario, e.decisao]).sort(),
      [["bruno_perfil", "bloquear"], ["carla_perfil", "permitir"]],
    );

    assert.equal((await ctx.api(ana, "DELETE", `/perfil/excecoes/${bruno.identidadeId}`)).statusCode, 200);
    assert.equal((await ctx.api(bruno, "GET", `/identidades/${ana.identidadeId}/perfil`)).json().status, "disponivel");
  });

  it("perfil de outra identidade nunca traz telefone, e-mail ou preferências", async () => {
    const perfil = (await ctx.api(bruno, "GET", `/identidades/${ana.identidadeId}/perfil`)).json();
    assert.deepEqual(Object.keys(perfil).sort(), ["cidade", "ehContato", "fotoUrl", "fraseStatus", "identidadeId", "nomeExibicao", "nomeUsuario", "sobre", "status", "tipo"]);
    assert.equal(JSON.stringify(perfil).includes(TELEFONES[0] as string), false);
  });

  it("sem sessão não se lê perfil nenhum", async () => {
    assert.equal((await ctx.api(null, "GET", `/identidades/${ana.identidadeId}/perfil`)).statusCode, 401);
    assert.equal((await ctx.api(null, "GET", "/perfil")).statusCode, 401);
  });
});

describe("privacidade da PRESENÇA no realtime", () => {
  const observar = (socket: Socket, conversaId: string): Promise<RespostaObservarConversa> =>
    socket.timeout(2000).emitWithAck(EVENTO_CONVERSA_OBSERVAR, { conversaId });

  let conversa = "";

  before(async () => {
    conversa = await ctx.abrirConversa(carla, "ana_perfil");
    await ctx.enviar(carla, conversa, "oi");
    // O teste anterior deixou Carla como exceção "permitir"; aqui interessa a regra geral.
    await ctx.api(ana, "DELETE", `/perfil/excecoes/${carla.identidadeId}`);
  });

  it("por padrão quem conversa vê a presença — o comportamento que já existia", async () => {
    await ctx.api(ana, "PATCH", "/perfil/privacidade", { visibilidadePresenca: "todos", statusEscolhido: "disponivel" });
    const socket = await ctx.conectar(carla);
    const resposta = await observar(socket, conversa);
    assert.equal(resposta.ok, true);
    assert.ok(resposta.ok && resposta.presencas.some((presenca) => presenca.identidadeId === ana.identidadeId));
  });

  it("'ninguem' some com o indicador — e não mente dizendo 'sem conexão'", async () => {
    await ctx.api(ana, "PATCH", "/perfil/privacidade", { visibilidadePresenca: "ninguem" });
    const socket = await ctx.conectar(carla);
    const resposta = await observar(socket, conversa);
    assert.equal(resposta.ok, true);
    // Ausente da lista = a interface não mostra bolinha nenhuma; afirmar "offline" seria mentira.
    assert.equal(resposta.ok && resposta.presencas.some((presenca) => presenca.identidadeId === ana.identidadeId), false);
  });

  it("INVISÍVEL vale mesmo com a visibilidade aberta", async () => {
    await ctx.api(ana, "PATCH", "/perfil/privacidade", { visibilidadePresenca: "todos", statusEscolhido: "invisivel" });
    const socket = await ctx.conectar(carla);
    const resposta = await observar(socket, conversa);
    assert.equal(resposta.ok && resposta.presencas.some((presenca) => presenca.identidadeId === ana.identidadeId), false);
    await ctx.api(ana, "PATCH", "/perfil/privacidade", { statusEscolhido: "disponivel" });
  });

  it("'contatos' mostra só para quem está na agenda de quem é visto", async () => {
    await ctx.api(ana, "PATCH", "/perfil/privacidade", { visibilidadePresenca: "contatos" });
    const semAgenda = await observar(await ctx.conectar(carla), conversa);
    assert.equal(semAgenda.ok && semAgenda.presencas.some((presenca) => presenca.identidadeId === ana.identidadeId), false);

    assert.equal((await ctx.api(ana, "POST", "/contatos", { identidadeId: carla.identidadeId })).statusCode, 201);
    const comAgenda = await observar(await ctx.conectar(carla), conversa);
    assert.ok(comAgenda.ok && comAgenda.presencas.some((presenca) => presenca.identidadeId === ana.identidadeId));
  });
});

describe("armazenamento não configurado", () => {
  it("é recusa honesta, não 'salvou' falso", async () => {
    // Este teste usa a aplicação real com o armazenamento indisponível montado à parte.
    const { armazenamentoIndisponivel } = await import("../src/lib/armazenamento/armazenamento-arquivos.js");
    assert.equal(armazenamentoIndisponivel.urlPublica("qualquer/chave"), null);
    await assert.rejects(() => armazenamentoIndisponivel.salvar({ chave: "x", conteudo: Buffer.alloc(1), tipoConteudo: "image/webp" }));
  });
});

void empresaId;
