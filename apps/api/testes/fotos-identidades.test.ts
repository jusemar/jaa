import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { ContextoConta, ConversaDireta, ListaContatos, ListaIdentidadesOperaveis, PaginaConversas, RespostaBusca } from "@jaa/contratos";
import sharp from "sharp";
import type { ArmazenamentoDeArquivos } from "../src/lib/armazenamento/armazenamento-arquivos.js";
import { criarArmazenamentoR2 } from "../src/lib/armazenamento/armazenamento-r2.js";
import { criarAmbienteIntegracao, como, type Pessoa } from "./apoio/integracao.js";

/*
 * FOTO DA IDENTIDADE FORA DO PERFIL: lista de conversas, conversa aberta, contatos, busca e "Agindo
 * como". A foto sai como URL pronta SÓ quando a privacidade do dono permite (mesma regra do perfil
 * público); caso contrário `null`. A chave do arquivo nunca chega ao cliente.
 *
 * Armazenamento FAKE: a URL pública é montada a partir da chave com uma base conhecida.
 */

const BASE_PUBLICA = "https://arquivos.teste.invalid";
const armazenamentoFake: ArmazenamentoDeArquivos = {
  nome: "teste",
  async salvar({ chave }) {
    return { chave };
  },
  async remover() {},
  urlPublica: (chave) => `${BASE_PUBLICA}/${chave}`,
};

const PREFIXO = `fot${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987667201", "+5531987667202", "+5531987667203"],
  prefixoIp: "198.51.117.",
  armazenamento: armazenamentoFake,
});

let ana: Pessoa; // tem foto
let bruno: Pessoa; // observador, sem foto
let caio: Pessoa; // sem foto
let fotoAna = "";
let identidadeEmpresa = "";
let logoEmpresa = "";
let conversaAnaBruno = "";
let conversaEmpresaBruno = "";

const imagemJpeg = () => sharp({ create: { width: 300, height: 300, channels: 3, background: "#2f6f4f" } }).jpeg().toBuffer();

async function enviarFoto(pessoa: Pessoa): Promise<string> {
  const envio = await ctx.enviarArquivo(pessoa, "/perfil/foto", { nome: "foto.jpg", tipo: "image/jpeg", conteudo: await imagemJpeg() });
  assert.equal(envio.statusCode, 200, envio.body);
  return envio.json().url;
}

async function abrirConversa(pessoa: Pessoa, nomeUsuario: string): Promise<ConversaDireta> {
  const resposta = await ctx.api(pessoa, "POST", "/conversas/diretas", { nomeUsuario });
  assert.ok([200, 201].includes(resposta.statusCode), resposta.body);
  return resposta.json();
}

async function enviarMensagem(pessoa: Pessoa, conversaId: string) {
  const resposta = await ctx.api(pessoa, "POST", `/conversas/${conversaId}/mensagens`, { idCliente: randomUUID(), conteudo: "oi" });
  assert.ok([200, 201].includes(resposta.statusCode), resposta.body);
}

const outraNaLista = async (pessoa: Pessoa, conversaId: string) =>
  ((await ctx.api(pessoa, "GET", "/conversas")).json() as PaginaConversas).conversas.find((item) => item.id === conversaId)?.outraIdentidade;

const participante = (conversa: ConversaDireta, identidadeId: string) => conversa.participantes.find((item) => item.identidadeId === identidadeId);

const definirPrivacidadeDaFoto = async (pessoa: Pessoa, visibilidadeFoto: "todos" | "contatos" | "ninguem") =>
  assert.equal((await ctx.api(pessoa, "PATCH", "/perfil/privacidade", { visibilidadeFoto })).statusCode, 200);

/** Foto de Ana vista por Bruno em TODOS os lugares que exibem avatar — a mesma resposta em cada um. */
async function fotoDeAnaVistaPorBruno() {
  const conversa = await abrirConversa(bruno, `${PREFIXO}_ana`);
  const busca: RespostaBusca = (await ctx.api(bruno, "GET", `/busca?termo=${encodeURIComponent(`@${PREFIXO}_ana`)}`)).json();
  const naBusca = [...busca.contatos, ...busca.externos].find((item) => item.identidade.identidadeId === ana.identidadeId);
  assert.ok(naBusca, "Ana aparece na busca");
  return {
    lista: (await outraNaLista(bruno, conversaAnaBruno))?.fotoUrl,
    conversaAberta: participante(conversa, ana.identidadeId)?.fotoUrl,
    busca: naBusca.identidade.fotoUrl,
    perfilPublico: (await ctx.api(bruno, "GET", `/identidades/${ana.identidadeId}/perfil`)).json().fotoUrl,
  };
}

const em = (valor: string | null) => ({ lista: valor, conversaAberta: valor, busca: valor, perfilPublico: valor });

before(async () => {
  await ctx.iniciar();
  ana = await ctx.criarPessoa(0, `${PREFIXO}_ana`, "Ana Foto");
  bruno = await ctx.criarPessoa(1, `${PREFIXO}_bruno`, "Bruno Sem Foto");
  caio = await ctx.criarPessoa(2, `${PREFIXO}_caio`, "Caio Sem Foto");

  fotoAna = await enviarFoto(ana);

  const empresa = await ctx.api(ana, "POST", "/empresas", { nome: "Padaria Foto", nomeUsuario: `${PREFIXO}_padaria`, slug: `${PREFIXO}-padaria` });
  assert.equal(empresa.statusCode, 201, empresa.body);
  identidadeEmpresa = empresa.json().identidadeId;
  logoEmpresa = await enviarFoto(como(ana, identidadeEmpresa));

  conversaAnaBruno = (await abrirConversa(bruno, `${PREFIXO}_ana`)).id;
  await enviarMensagem(ana, conversaAnaBruno);
  conversaEmpresaBruno = (await abrirConversa(bruno, `${PREFIXO}_padaria`)).id;
  await enviarMensagem(como(ana, identidadeEmpresa), conversaEmpresaBruno);
  await enviarMensagem(caio, (await abrirConversa(caio, `${PREFIXO}_bruno`)).id);
});

after(() => ctx.encerrar());

describe("foto nas conversas", () => {
  it("a URL é montada a partir da CHAVE gravada e da base pública do armazenamento", () => {
    assert.match(fotoAna, new RegExp(`^${BASE_PUBLICA}/avatar/${ana.identidadeId}/[0-9a-f-]{36}\\.webp$`));
    assert.match(logoEmpresa, new RegExp(`^${BASE_PUBLICA}/logo-empresa/${identidadeEmpresa}/[0-9a-f-]{36}\\.webp$`));
  });

  it("lista de conversas e conversa aberta (cabeçalho) trazem a foto do interlocutor", async () => {
    assert.equal((await outraNaLista(bruno, conversaAnaBruno))?.fotoUrl, fotoAna);
    const conversa = await abrirConversa(bruno, `${PREFIXO}_ana`);
    assert.equal(participante(conversa, ana.identidadeId)?.fotoUrl, fotoAna, "dados do cabeçalho ao abrir pelo @usuario");
    assert.equal(participante(conversa, bruno.identidadeId)?.fotoUrl, null, "quem não tem foto vem null (iniciais)");
  });

  it("identidade sem foto vem com fotoUrl null", async () => {
    const lista: PaginaConversas = (await ctx.api(bruno, "GET", "/conversas")).json();
    const doCaio = lista.conversas.find((item) => item.outraIdentidade.identidadeId === caio.identidadeId);
    assert.ok(doCaio);
    assert.equal(doCaio.outraIdentidade.fotoUrl, null);
    // E no sentido contrário: Ana vê Bruno (sem foto) como null.
    assert.equal((await outraNaLista(ana, conversaAnaBruno))?.fotoUrl, null);
  });

  it("conversa com EMPRESA traz a logo; a empresa vê o cliente pela privacidade dele", async () => {
    assert.equal((await outraNaLista(bruno, conversaEmpresaBruno))?.fotoUrl, logoEmpresa);
    assert.equal((await outraNaLista(como(ana, identidadeEmpresa), conversaEmpresaBruno))?.fotoUrl, null, "Bruno não tem foto");
  });
});

describe("privacidade da foto (visibilidadeFoto + exceções) vale em todo lugar", () => {
  it("todos: Bruno vê a foto da Ana em lista, conversa aberta, busca e perfil público", async () => {
    assert.deepEqual(await fotoDeAnaVistaPorBruno(), em(fotoAna));
  });

  it("contatos: quem não está na agenda da DONA recebe null; ao ser salvo por ela, passa a ver", async () => {
    await definirPrivacidadeDaFoto(ana, "contatos");
    assert.deepEqual(await fotoDeAnaVistaPorBruno(), em(null));

    // Bruno salvar Ana NÃO conta: a regra é a agenda de quem é dona da foto.
    assert.equal((await ctx.api(bruno, "POST", "/contatos", { identidadeId: ana.identidadeId })).statusCode, 201);
    assert.deepEqual(await fotoDeAnaVistaPorBruno(), em(null));
    const contatos: ListaContatos = (await ctx.api(bruno, "GET", "/contatos")).json();
    assert.equal(contatos.contatos.find((item) => item.identidade.identidadeId === ana.identidadeId)?.identidade.fotoUrl, null);

    assert.equal((await ctx.api(ana, "POST", "/contatos", { identidadeId: bruno.identidadeId })).statusCode, 201);
    assert.deepEqual(await fotoDeAnaVistaPorBruno(), em(fotoAna));
    const depois: ListaContatos = (await ctx.api(bruno, "GET", "/contatos")).json();
    assert.equal(depois.contatos.find((item) => item.identidade.identidadeId === ana.identidadeId)?.identidade.fotoUrl, fotoAna);
  });

  it("exceção 'bloquear' esconde mesmo de contato; 'ninguém' esconde de todos, exceto exceção 'permitir'", async () => {
    assert.equal((await ctx.api(ana, "PUT", "/perfil/excecoes", { identidadeId: bruno.identidadeId, decisao: "bloquear" })).statusCode, 200);
    assert.deepEqual(await fotoDeAnaVistaPorBruno(), em(null));

    await definirPrivacidadeDaFoto(ana, "ninguem");
    assert.equal((await ctx.api(ana, "PUT", "/perfil/excecoes", { identidadeId: bruno.identidadeId, decisao: "permitir" })).statusCode, 200);
    assert.deepEqual(await fotoDeAnaVistaPorBruno(), em(fotoAna));

    assert.equal((await ctx.api(ana, "DELETE", `/perfil/excecoes/${bruno.identidadeId}`)).statusCode, 200);
    assert.deepEqual(await fotoDeAnaVistaPorBruno(), em(null));
  });

  it("a dona sempre vê a própria foto, qualquer que seja a privacidade", async () => {
    assert.equal((await ctx.api(ana, "GET", "/perfil")).json().fotoUrl, fotoAna);
    const operaveis: ListaIdentidadesOperaveis = (await ctx.api(ana, "GET", "/identidades/operaveis")).json();
    assert.equal(operaveis.identidades.find((item) => item.identidadeId === ana.identidadeId)?.fotoUrl, fotoAna);
    await definirPrivacidadeDaFoto(ana, "todos");
  });
});

describe("Agindo como: identidades operáveis com foto", () => {
  it("lista, verificação e contexto da conta trazem avatar e logo; sem foto = null", async () => {
    const operaveis: ListaIdentidadesOperaveis = (await ctx.api(ana, "GET", "/identidades/operaveis")).json();
    const fotos = Object.fromEntries(operaveis.identidades.map((item) => [item.identidadeId, item.fotoUrl]));
    assert.deepEqual(fotos, { [ana.identidadeId]: fotoAna, [identidadeEmpresa]: logoEmpresa });

    assert.equal((await ctx.api(ana, "GET", `/identidades/operaveis/${identidadeEmpresa}`)).json().fotoUrl, logoEmpresa);

    const contexto: ContextoConta = (await ctx.api(ana, "GET", "/conta/contexto")).json();
    assert.deepEqual(
      Object.fromEntries(contexto.identidadesOperaveis.map((item) => [item.identidadeId, item.fotoUrl])),
      { [ana.identidadeId]: fotoAna, [identidadeEmpresa]: logoEmpresa },
    );
    const doBruno: ContextoConta = (await ctx.api(bruno, "GET", "/conta/contexto")).json();
    assert.equal(doBruno.identidadesOperaveis[0]?.fotoUrl, null);
  });
});

describe("nada do armazenamento vaza para o cliente", () => {
  it("nenhuma resposta carrega a chave como campo nem credencial", async () => {
    const respostas = await Promise.all([
      ctx.api(bruno, "GET", "/conversas"),
      ctx.api(bruno, "GET", "/contatos"),
      ctx.api(bruno, "GET", `/busca?termo=${encodeURIComponent(`@${PREFIXO}_ana`)}`),
      ctx.api(bruno, "POST", "/conversas/diretas", { nomeUsuario: `${PREFIXO}_ana` }),
      ctx.api(ana, "GET", "/identidades/operaveis"),
      ctx.api(ana, "GET", "/conta/contexto"),
    ]);
    for (const resposta of respostas) {
      assert.ok(resposta.statusCode < 300, resposta.body);
      for (const proibido of ["fotoChave", "foto_chave", "chave", "R2_", "secret", "accessKey"]) {
        assert.ok(!resposta.body.includes(proibido), `${proibido} em ${resposta.body.slice(0, 120)}`);
      }
    }
  });

  it("R2: URL pública = R2_URL_PUBLICA + chave codificada; sem base pública, nenhuma URL é inventada", () => {
    const configuracao = { contaId: "conta", bucket: "jaa-publico", accessKeyId: "id-teste", secretAccessKey: "segredo-teste" };
    const comBase = criarArmazenamentoR2({ ...configuracao, urlPublica: "https://pub-exemplo.r2.dev/" });
    assert.equal(comBase.urlPublica("avatar/a/b c.webp"), "https://pub-exemplo.r2.dev/avatar/a/b%20c.webp");
    assert.equal(criarArmazenamentoR2(configuracao).urlPublica("avatar/a/b.webp"), null);
  });
});
