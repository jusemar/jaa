import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  anexosMensagem,
  conversas,
  identidades,
  identidadesVisitantes,
  mensagens,
  participantesConversa,
  sessions,
  users,
} from "@jaa/banco/schema";
import { EVENTO_MENSAGEM_NOVA, VISITANTE_INATIVIDADE_MAXIMA_MS, type ContaAtual, type Mensagem, type VisitanteAtual } from "@jaa/contratos";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { obterOuCriarConversaDireta } from "../src/features/conversas/repositorios/repositorio-conversas.js";
import { expirarVisitantes } from "../src/features/visitantes/casos-de-uso/expirar-visitantes.js";
import { situacaoDoVisitante } from "../src/features/visitantes/lib/situacao-visitante.js";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * VISITANTE PELO LINK DO JAA: conversa sem conta, com a MESMA mensageria; vira conta sem perder a
 * conversa; expira em 24 h sem atividade preservando o histórico de quem tem conta.
 * D = dona do link; T = terceira pessoa; E = conta existente (entra depois de conversar como visitante).
 */
const PREFIXO = `vis${randomUUID().slice(0, 4)}`;
const TELEFONES = ["+5531987671001", "+5531987671002", "+5531987671003", "+5531987671004", "+5531987671005", "+5531987671006", "+5531987671007", "+5531987671008"];
const ctx = criarAmbienteIntegracao({ telefones: TELEFONES, prefixoIp: "198.18.110." });

let D: Pessoa;
let T: Pessoa;
let E: Pessoa;
let conversaDT = "";
// Contas anônimas criadas pelos testes: apagadas no fim (o apoio só conhece telefones).
const usuariosVisitantes = new Set<string>();
let ipVisitante = 10;

async function criarVisitante(nomeExibicao?: string): Promise<Pessoa> {
  const ip = `198.18.110.${ipVisitante++}`;
  const semSessao: Pessoa = { cookie: "", identidadeId: "", nomeExibicao: nomeExibicao ?? "Visitante", ip };
  const resposta = await ctx.api(semSessao, "POST", "/visitantes", nomeExibicao ? { nomeExibicao } : {});
  assert.equal(resposta.statusCode, 201, resposta.body);
  const cookie = resposta.cookies.find((c) => c.name === "better-auth.session_token");
  assert.ok(cookie, "a sessão de visitante é o cookie normal do Better Auth");
  const visitante: VisitanteAtual = resposta.json();
  const [dona] = await ctx.banco.select({ usuarioId: identidades.usuarioId }).from(identidades).where(eq(identidades.id, visitante.identidadeId));
  if (dona?.usuarioId) usuariosVisitantes.add(dona.usuarioId);
  return { cookie: `${cookie.name}=${cookie.value}`, identidadeId: visitante.identidadeId, nomeExibicao: visitante.nomeExibicao, ip };
}

// Código por SMS com a sessão de visitante no cookie: é assim que o visitante cria conta ou entra.
async function entrarComCodigo(visitante: Pessoa, telefone: string): Promise<Pessoa> {
  assert.equal((await ctx.api(visitante, "POST", "/api/auth/phone-number/send-otp", { phoneNumber: telefone })).statusCode, 200);
  const codigo = await ctx.obterCodigo(telefone);
  const verificacao = await ctx.api(visitante, "POST", "/api/auth/phone-number/verify", { phoneNumber: telefone, code: codigo });
  assert.equal(verificacao.statusCode, 200, verificacao.body);
  const cookie = verificacao.cookies.find((c) => c.name === "better-auth.session_token");
  assert.ok(cookie);
  return { ...visitante, cookie: `${cookie.name}=${cookie.value}` };
}

const conta = async (pessoa: Pessoa) => ctx.api(pessoa, "GET", "/usuarios/eu");
const conversasDoPar = async (a: string, b: string) => {
  const chave = a < b ? `${a}:${b}` : `${b}:${a}`;
  return ctx.banco.select({ id: conversas.id }).from(conversas).where(eq(conversas.chaveDireta, chave));
};
// Volta o relógio da última atividade (a regra usa o relógio do banco).
const envelhecer = (identidadeId: string, ms: number) =>
  ctx.banco
    .update(identidadesVisitantes)
    .set({ ultimaAtividadeEm: sql`now() - make_interval(secs => ${ms / 1000})` })
    .where(eq(identidadesVisitantes.identidadeId, identidadeId));

describe("visitante pelo Link do Jaa", () => {
  before(async () => {
    await ctx.iniciar();
    D = await ctx.criarPessoa(0, `${PREFIXO}_dona`, "Dona do Link");
    T = await ctx.criarPessoa(1, `${PREFIXO}_terc`, "Terceira");
    E = await ctx.criarPessoa(2, `${PREFIXO}_exist`, "Conta Existente");
    conversaDT = await ctx.abrirConversa(D, `${PREFIXO}_terc`);
    await ctx.enviar(D, conversaDT, "conversa privada da dona");
  });

  after(async () => {
    // Conversas que envolvem os visitantes (as das contas de teste o apoio já limpa).
    const ids = [...usuariosVisitantes];
    if (ids.length > 0) {
      const ident = ctx.banco.select({ id: identidades.id }).from(identidades).where(inArray(identidades.usuarioId, ids));
      const conv = ctx.banco.select({ id: participantesConversa.conversaId }).from(participantesConversa).where(inArray(participantesConversa.identidadeId, ident));
      const conversasIds = (await conv).map((linha) => linha.id);
      if (conversasIds.length > 0) {
        await ctx.banco.transaction(async (transacao) => {
          await transacao.delete(anexosMensagem).where(inArray(anexosMensagem.conversaId, conversasIds));
          await transacao.delete(mensagens).where(inArray(mensagens.conversaId, conversasIds));
        });
        await ctx.banco.delete(conversas).where(inArray(conversas.id, conversasIds));
      }
      await ctx.banco.delete(identidades).where(inArray(identidades.usuarioId, ids));
      await ctx.banco.delete(users).where(and(inArray(users.id, ids), eq(users.isAnonymous, true)));
    }
    await ctx.encerrar();
  });

  it("o link resolve sem autenticação", async () => {
    const resposta = await ctx.api(null, "GET", `/publico/identidades/${PREFIXO}_dona`);
    assert.equal(resposta.statusCode, 200, resposta.body);
    assert.equal(resposta.json().nomeUsuario, `${PREFIXO}_dona`);
  });

  it("cria a sessão visitante (cookie do Better Auth) sem cadastro, e repetir não cria outra", async () => {
    const V = await criarVisitante("Maria");
    const eu = await conta(V);
    assert.equal(eu.statusCode, 200, eu.body);
    const dados: ContaAtual = eu.json();
    assert.equal(dados.cadastroCompleto, false);
    assert.equal(dados.identidadePessoal, null);
    assert.equal(dados.visitante?.identidadeId, V.identidadeId);
    assert.equal(dados.visitante?.nomeExibicao, "Maria");
    // Nada técnico vaza: nem token, nem @usuario técnico, nem conta.
    assert.equal(JSON.stringify(dados).includes("visitante_"), false);

    const repetido = await ctx.api(V, "POST", "/visitantes", {});
    assert.equal(repetido.statusCode, 200);
    assert.equal(repetido.json().identidadeId, V.identidadeId);

    // A rota pública do plugin não existe: a sessão anônima só nasce por /visitantes.
    assert.equal((await ctx.api(null, "POST", "/api/auth/sign-in/anonymous", {})).statusCode, 404);
  });

  it("conversa com a dona do link: envia e recebe pela mensageria de sempre, em tempo real", async () => {
    const V = await criarVisitante("João");
    const conversaId = await ctx.abrirConversa(V, `${PREFIXO}_dona`);
    const socketV = await ctx.conectar(V);
    const socketD = await ctx.conectar(D);
    const recebidasV = coletar<{ mensagem: Mensagem }>(socketV, EVENTO_MENSAGEM_NOVA);
    const recebidasD = coletar<{ mensagem: Mensagem }>(socketD, EVENTO_MENSAGEM_NOVA);

    const doVisitante = await ctx.enviar(V, conversaId, "Olá, vi seu link!");
    assert.equal(doVisitante.remetenteIdentidadeId, V.identidadeId);
    await aguardarAte(() => recebidasD.some((evento) => evento.mensagem.id === doVisitante.id));

    // A dona vê a conversa na lista dela, com o nome que o visitante escolheu.
    const listaD = await ctx.lista(D);
    const item = listaD.conversas.find((c) => c.id === conversaId);
    assert.ok(item);
    assert.equal(item.outraIdentidade.nomeExibicao, "João");

    const resposta = await ctx.enviar(D, conversaId, "Oi João!");
    await aguardarAte(() => recebidasV.some((evento) => evento.mensagem.id === resposta.id));
    const historico = await ctx.historico(V, conversaId);
    assert.deepEqual(new Set(historico.mensagens.map((m) => m.id)), new Set([doVisitante.id, resposta.id]));

    // A mesma conversa ao abrir de novo (par canônico).
    assert.equal(await ctx.abrirConversa(V, `${PREFIXO}_dona`), conversaId);
  });

  it("o link não dá acesso às conversas da dona, nem às de outro visitante (ids manipulados = 404)", async () => {
    const V1 = await criarVisitante("V1");
    const V2 = await criarVisitante("V2");
    const conversaV1 = await ctx.abrirConversa(V1, `${PREFIXO}_dona`);
    await ctx.enviar(V1, conversaV1, "segredo do V1");

    for (const [alvo, conversaId] of [
      [V2, conversaV1],
      [V2, conversaDT],
      [V1, conversaDT],
    ] as const) {
      assert.equal((await ctx.api(alvo, "GET", `/conversas/${conversaId}/mensagens`)).statusCode, 404);
      const envio = await ctx.api(alvo, "POST", `/conversas/${conversaId}/mensagens`, { idCliente: randomUUID(), conteudo: "intrusão" });
      assert.equal(envio.statusCode, 404);
      assert.equal((await ctx.api(alvo, "POST", `/conversas/${conversaId}/leitura`, { ateMensagemId: randomUUID() })).statusCode, 404);
    }
    // Lista do visitante: só as conversas dele.
    assert.deepEqual((await ctx.lista(V2)).conversas.map((c) => c.id), []);
    // Agir como outra identidade (a da dona) é recusado, nunca rebaixado em silêncio.
    const fingindo = await ctx.api(como(V2, D.identidadeId), "GET", "/conversas");
    assert.equal(fingindo.statusCode, 403);
    assert.equal(fingindo.json().codigo, "IDENTIDADE_NAO_AUTORIZADA");
  });

  it("visitante não é encontrável: @usuario técnico não abre conversa, página pública nem aparece na pesquisa", async () => {
    const V = await criarVisitante("Escondido");
    const [linha] = await ctx.banco.select({ nomeUsuario: identidades.nomeUsuario }).from(identidades).where(eq(identidades.id, V.identidadeId));
    assert.ok(linha);
    // Recusado já na validação do @usuario (prefixo reservado) ou, se passasse, pela busca (404).
    const recusado = (status: number) => status === 400 || status === 404;
    assert.ok(recusado((await ctx.api(D, "POST", "/conversas/diretas", { nomeUsuario: linha.nomeUsuario })).statusCode));
    assert.equal((await ctx.api(null, "GET", `/publico/identidades/${linha.nomeUsuario}`)).statusCode, 404);
    // Outro visitante também não o alcança, e nenhuma conversa nasceu com ele.
    const outro = await criarVisitante();
    assert.ok(recusado((await ctx.api(outro, "POST", "/conversas/diretas", { nomeUsuario: linha.nomeUsuario })).statusCode));
    assert.equal((await ctx.banco.select().from(participantesConversa).where(eq(participantesConversa.identidadeId, V.identidadeId))).length, 0);
    // A pesquisa do Jaa (por nome) não o encontra.
    const pesquisa = await ctx.api(D, "GET", `/busca?termo=${encodeURIComponent("Escondido")}`);
    assert.equal(pesquisa.statusCode, 200, pesquisa.body);
    assert.equal(JSON.stringify(pesquisa.json()).includes(V.identidadeId), false);
    // Ninguém consegue cadastrar o prefixo técnico.
    const cadastro = await ctx.api(D, "POST", "/identidades/pessoal", { nomeExibicao: "X", nomeUsuario: "visitante_abc" });
    assert.equal(cadastro.statusCode, 400);
  });

  it("visitante PESQUISA pessoas (nome/@usuario), inicia a conversa pelo resultado e a vê na lista", async () => {
    const V = await criarVisitante("Pesquisador");
    const porNome = await ctx.api(V, "GET", `/busca?termo=${encodeURIComponent("Terceira")}`);
    assert.equal(porNome.statusCode, 200, porNome.body);
    const achados = porNome.json().externos as { identidade: { identidadeId: string; nomeUsuario: string } }[];
    const terceira = achados.find((item) => item.identidade.identidadeId === T.identidadeId);
    assert.ok(terceira, "a pesquisa do visitante encontra quem tem conta");
    assert.deepEqual(porNome.json().contatos, [], "visitante não tem agenda");
    const porUsuario = await ctx.api(V, "GET", `/busca?termo=${encodeURIComponent(`@${PREFIXO}_dona`)}`);
    assert.ok((porUsuario.json().externos as { identidade: { identidadeId: string } }[]).some((item) => item.identidade.identidadeId === D.identidadeId));
    // Nada de telefone no resultado, e visitante nunca procura POR telefone (sessão descartável = enumeração).
    assert.equal(JSON.stringify(porNome.json()).includes("+55"), false);
    assert.equal((await ctx.api(T, "PATCH", "/perfil/privacidade", { buscavelPorTelefone: true })).statusCode, 200);
    try {
      const porTelefone = await ctx.api(V, "GET", `/busca?termo=${encodeURIComponent(TELEFONES[1] as string)}`);
      assert.equal(porTelefone.statusCode, 200, porTelefone.body);
      assert.equal(JSON.stringify(porTelefone.json()).includes(T.identidadeId), false, "visitante não acha ninguém pelo celular");
      const contaComum = await ctx.api(D, "GET", `/busca?termo=${encodeURIComponent(TELEFONES[1] as string)}`);
      assert.equal(JSON.stringify(contaComum.json()).includes(T.identidadeId), true, "conta comum continua achando quem optou");
    } finally {
      await ctx.api(T, "PATCH", "/perfil/privacidade", { buscavelPorTelefone: false });
    }

    // Tocar no resultado = abrir a conversa direta de sempre; com mensagem, ela entra na lista dele.
    const comDona = await ctx.abrirConversa(V, `${PREFIXO}_dona`);
    const comTerceira = await ctx.abrirConversa(V, terceira.identidade.nomeUsuario);
    assert.notEqual(comDona, comTerceira);
    await ctx.enviar(V, comDona, "oi, dona");
    await ctx.enviar(V, comTerceira, "oi, terceira");
    const lista = (await ctx.lista(V)).conversas.map((conversa) => conversa.id);
    assert.deepEqual(new Set(lista), new Set([comDona, comTerceira]));
    // Alternar entre elas: reabrir devolve a mesma conversa, com o histórico de cada uma.
    assert.equal(await ctx.abrirConversa(V, `${PREFIXO}_dona`), comDona);
    assert.deepEqual((await ctx.historico(V, comTerceira)).mensagens.map((m) => m.conteudo), ["oi, terceira"]);
  });

  it("pedido, empresa, perfil profissional e outros recursos de conta exigem conta (CONTA_NECESSARIA)", async () => {
    const V = await criarVisitante("Curioso");
    const tentativas: [string, "GET" | "POST" | "PATCH" | "PUT" | "DELETE", string, unknown][] = [
      ["pedido", "POST", "/pedidos", { idCliente: randomUUID(), empresaIdentidadeId: D.identidadeId, itens: [], pagamento: { forma: "cartao" } }],
      ["empresa", "POST", "/empresas", { nome: "Loja do Visitante", slug: `${PREFIXO}-loja-vis` }],
      ["perfil profissional", "POST", "/profissional/perfil", {}],
      ["ativar perfil profissional", "POST", "/profissional/perfil/ativar", {}],
      ["endereços", "GET", "/enderecos", undefined],
      ["contatos", "GET", "/contatos", undefined],
      ["salvar contato", "POST", "/contatos", { identidadeId: D.identidadeId }],
      ["foto do perfil", "DELETE", "/perfil/foto", undefined],
      ["privacidade/status", "PATCH", "/perfil/privacidade", { statusEscolhido: "ocupado" }],
      ["meu perfil", "GET", "/perfil", undefined],
      ["minhas empresas", "GET", "/empresas", undefined],
      ["identidades operáveis", "GET", "/identidades/operaveis", undefined],
      ["minhas entregas", "GET", "/entregas/vinculos", undefined],
      ["busca de profissionais", "GET", "/profissionais/intencoes?termo=motoboy", undefined],
      ["editar perfil", "PATCH", "/perfil", { nomeExibicao: "Outro" }],
      ["senha", "GET", "/conta/senha", undefined],
      ["identidade pessoal", "POST", "/identidades/pessoal", { nomeExibicao: "Curioso", nomeUsuario: `${PREFIXO}_cur` }],
    ];
    for (const [nome, metodo, url, corpo] of tentativas) {
      const resposta = await ctx.api(V, metodo, url, corpo);
      assert.equal(resposta.statusCode, 403, `${nome}: ${resposta.body}`);
      assert.equal(resposta.json().codigo, "CONTA_NECESSARIA", nome);
    }
    // Ver o que é público continua livre: perfil (sem cidade de pessoa) e cardápio.
    const perfil = await ctx.api(V, "GET", `/identidades/${D.identidadeId}/perfil`);
    assert.equal(perfil.statusCode, 200, perfil.body);
    assert.equal(perfil.json().cidade, null);
  });

  it("criar conta: a MESMA identidade e a MESMA conversa continuam, sem duplicar e sem expirar", async () => {
    const V = await criarVisitante("Ana");
    const conversaId = await ctx.abrirConversa(V, `${PREFIXO}_dona`);
    const antes = await ctx.enviar(V, conversaId, "mensagem como visitante");
    const daDona = await ctx.enviar(D, conversaId, "resposta da dona");

    const nova = await entrarComCodigo(V, TELEFONES[3] as string);
    // A sessão anônima deixou de existir (não dá para reutilizá-la).
    assert.equal((await conta(V)).statusCode, 401);
    // Conta nova: falta escolher nome e @usuario — e só isso.
    const pendente: ContaAtual = (await conta(nova)).json();
    assert.equal(pendente.cadastroCompleto, false);
    assert.equal(pendente.visitante, undefined);
    assert.equal((await ctx.api(nova, "GET", "/conversas")).json().codigo, "CADASTRO_INCOMPLETO");

    const identidade = await ctx.api(nova, "POST", "/identidades/pessoal", { nomeExibicao: "Ana Souza", nomeUsuario: `${PREFIXO}_ana` });
    assert.equal(identidade.statusCode, 201, identidade.body);
    assert.equal(identidade.json().id, V.identidadeId, "a identidade do visitante virou a identidade pessoal da conta");

    const ana: Pessoa = { ...nova, identidadeId: V.identidadeId };
    const lista = await ctx.lista(ana);
    assert.deepEqual(lista.conversas.map((c) => c.id), [conversaId]);
    const historico = await ctx.historico(ana, conversaId);
    assert.deepEqual(new Set(historico.mensagens.map((m) => m.id)), new Set([antes.id, daDona.id]));
    assert.equal((await conversasDoPar(V.identidadeId, D.identidadeId)).length, 1);

    // Para a dona: a mesma conversa, agora com o nome definitivo, e ela continua conversando.
    const item = (await ctx.lista(D)).conversas.find((c) => c.id === conversaId);
    assert.equal(item?.outraIdentidade.nomeUsuario, `${PREFIXO}_ana`);
    await ctx.enviar(D, conversaId, "bem-vinda!");

    // Expiração cancelada para sempre: a marca de visitante não existe mais.
    assert.equal((await ctx.banco.select().from(identidadesVisitantes).where(eq(identidadesVisitantes.identidadeId, V.identidadeId))).length, 0);
    const [linhaConta] = await ctx.banco.select({ anonima: users.isAnonymous }).from(users).where(eq(users.phoneNumber, TELEFONES[3] as string));
    assert.equal(linhaConta?.anonima, false);

    // As capacidades de conta foram LIBERADAS (antes: CONTA_NECESSARIA): perfil, agenda e empresas.
    for (const url of ["/perfil", "/contatos", "/empresas", "/identidades/operaveis"]) {
      const resposta = await ctx.api(ana, "GET", url);
      assert.equal(resposta.statusCode, 200, `${url}: ${resposta.body}`);
    }
    assert.equal((await ctx.api(ana, "PATCH", "/perfil", { nomeExibicao: "Ana S." })).statusCode, 200);
  });

  it("entrar numa conta EXISTENTE: as mensagens vão para a conversa que ela já tinha, sem duplicar", async () => {
    const conversaED = await ctx.abrirConversa(E, `${PREFIXO}_dona`);
    const antiga = await ctx.enviar(E, conversaED, "conversa antiga da conta");

    const V = await criarVisitante("E sem login");
    const conversaVD = await ctx.abrirConversa(V, `${PREFIXO}_dona`);
    const conversaVT = await ctx.abrirConversa(V, `${PREFIXO}_terc`);
    const msgVD = await ctx.enviar(V, conversaVD, "escrevi sem entrar");
    const respostaVD = await ctx.enviar(D, conversaVD, "respondi o visitante", { mensagemRespondidaId: msgVD.id });
    const msgVT = await ctx.enviar(V, conversaVT, "oi, terceira");

    const entrou = await entrarComCodigo(V, TELEFONES[2] as string);
    const e: Pessoa = { ...entrou, identidadeId: E.identidadeId };

    // Com a dona: UMA conversa só (a que já existia), com o histórico das duas.
    assert.deepEqual((await conversasDoPar(E.identidadeId, D.identidadeId)).map((c) => c.id), [conversaED]);
    const historico = await ctx.historico(e, conversaED);
    assert.deepEqual(new Set(historico.mensagens.map((m) => m.id)), new Set([antiga.id, msgVD.id, respostaVD.id]));
    const movida = historico.mensagens.find((m) => m.id === msgVD.id);
    assert.equal(movida?.remetenteIdentidadeId, E.identidadeId);
    // A resposta à mensagem movida continua apontando para ela.
    assert.equal(historico.mensagens.find((m) => m.id === respostaVD.id)?.mensagemRespondida?.id, msgVD.id);
    assert.equal((await ctx.api(D, "GET", `/conversas/${conversaVD}/mensagens`)).statusCode, 404);

    // Com a terceira (que a conta ainda não conhecia): a conversa passou para a conta.
    assert.deepEqual((await conversasDoPar(E.identidadeId, T.identidadeId)).map((c) => c.id), [conversaVT]);
    assert.equal((await ctx.historico(e, conversaVT)).mensagens[0]?.id, msgVT.id);

    // O visitante deixou de existir (identidade e conta temporária).
    assert.equal((await ctx.banco.select().from(identidades).where(eq(identidades.id, V.identidadeId))).length, 0);
    assert.equal((await conta(V)).statusCode, 401);
  });

  it("entrar com SENHA (outro caminho do Better Auth) também leva a conversa do visitante para a conta", async () => {
    const S = await ctx.criarPessoa(4, `${PREFIXO}_senha`, "Com Senha");
    assert.equal((await ctx.api(S, "POST", "/conta/senha", { senha: "senha-forte-123" })).statusCode, 200);

    const V = await criarVisitante("Sem login ainda");
    const conversaId = await ctx.abrirConversa(V, `${PREFIXO}_dona`);
    const mensagem = await ctx.enviar(V, conversaId, "antes de lembrar a senha");

    const entrada = await ctx.api(V, "POST", "/autenticacao/entrar", { identificador: `@${PREFIXO}_senha`, senha: "senha-forte-123" });
    assert.equal(entrada.statusCode, 200, entrada.body);
    const cookie = entrada.cookies.find((c) => c.name === "better-auth.session_token");
    assert.ok(cookie);
    const s: Pessoa = { ...S, cookie: `${cookie.name}=${cookie.value}` };

    const lista = await ctx.lista(s);
    assert.deepEqual(lista.conversas.map((c) => c.id), [conversaId]);
    assert.equal((await ctx.historico(s, conversaId)).mensagens[0]?.id, mensagem.id);
    assert.equal((await conversasDoPar(S.identidadeId, D.identidadeId)).length, 1);
    // Senha errada com sessão de visitante: nada muda (o visitante continua sendo visitante).
    const V2 = await criarVisitante("Errou");
    const conversaV2 = await ctx.abrirConversa(V2, `${PREFIXO}_dona`);
    await ctx.enviar(V2, conversaV2, "errei a senha");
    assert.equal((await ctx.api(V2, "POST", "/autenticacao/entrar", { identificador: `@${PREFIXO}_senha`, senha: "outra-senha-000" })).statusCode, 401);
    assert.equal((await ctx.historico(V2, conversaV2)).mensagens.length, 1);
    assert.equal((await ctx.lista(s)).conversas.length, 1);
  });

  it("expira após 24 h sem atividade: a sessão vencida não vale e a limpeza preserva o histórico de quem tem conta", async () => {
    const comHistorico = await criarVisitante("Vai expirar");
    const conversaId = await ctx.abrirConversa(comHistorico, `${PREFIXO}_dona`);
    const mensagem = await ctx.enviar(comHistorico, conversaId, "fica no histórico da dona");
    const semHistorico = await criarVisitante("Só olhou");
    const conversaVazia = await ctx.abrirConversa(semHistorico, `${PREFIXO}_terc`);

    for (const v of [comHistorico, semHistorico]) await envelhecer(v.identidadeId, VISITANTE_INATIVIDADE_MAXIMA_MS + 60_000);

    // Antes mesmo da limpeza, a sessão vencida já é recusada (e não renova o prazo).
    assert.equal((await ctx.api(comHistorico, "GET", "/conversas")).statusCode, 401);
    assert.equal((await conta(comHistorico)).statusCode, 401);

    const resultado = await expirarVisitantes(ctx.banco);
    assert.ok(resultado.apagadas >= 1 && resultado.encerradas >= 1);

    // Com histórico: identidade fica só como autora; sessões apagadas; a dona continua vendo tudo.
    const [marca] = await ctx.banco.select().from(identidadesVisitantes).where(eq(identidadesVisitantes.identidadeId, comHistorico.identidadeId));
    assert.ok(marca?.encerradaEm);
    const [dono] = await ctx.banco.select({ usuarioId: identidades.usuarioId }).from(identidades).where(eq(identidades.id, comHistorico.identidadeId));
    assert.equal((await ctx.banco.select().from(sessions).where(eq(sessions.userId, dono?.usuarioId ?? ""))).length, 0);
    assert.ok((await ctx.historico(D, conversaId)).mensagens.some((m) => m.id === mensagem.id));
    assert.ok((await ctx.lista(D)).conversas.some((c) => c.id === conversaId));
    assert.equal((await ctx.api(comHistorico, "GET", "/conversas")).statusCode, 401);

    // Sem histórico: tudo o que era só dele sumiu.
    assert.equal((await ctx.banco.select().from(identidades).where(eq(identidades.id, semHistorico.identidadeId))).length, 0);
    assert.equal((await ctx.banco.select().from(conversas).where(eq(conversas.id, conversaVazia))).length, 0);

    // Visitante vencido não é convertido ao entrar: a conta não herda nada dele.
    const tentativa = await ctx.api(comHistorico, "POST", "/visitantes", {});
    assert.equal(tentativa.statusCode, 201, "sessão vencida não existe mais: vira um visitante NOVO");
    const [dona] = await ctx.banco.select({ usuarioId: identidades.usuarioId }).from(identidades).where(eq(identidades.id, tentativa.json().identidadeId));
    if (dona?.usuarioId) usuariosVisitantes.add(dona.usuarioId);
    assert.notEqual(tentativa.json().identidadeId, comHistorico.identidadeId);
  });

  it("visitante vencido que volta ao link antes da limpeza ganha um visitante NOVO (nada herdado)", async () => {
    const V = await criarVisitante("Voltou tarde");
    const conversaId = await ctx.abrirConversa(V, `${PREFIXO}_dona`);
    await ctx.enviar(V, conversaId, "mensagem antiga");
    await envelhecer(V.identidadeId, VISITANTE_INATIVIDADE_MAXIMA_MS + 60_000);

    const novo = await ctx.api(V, "POST", "/visitantes", {});
    assert.equal(novo.statusCode, 201, novo.body);
    const [dona] = await ctx.banco.select({ usuarioId: identidades.usuarioId }).from(identidades).where(eq(identidades.id, novo.json().identidadeId));
    if (dona?.usuarioId) usuariosVisitantes.add(dona.usuarioId);
    assert.notEqual(novo.json().identidadeId, V.identidadeId);
    const cookie = novo.cookies.find((c) => c.name === "better-auth.session_token");
    assert.ok(cookie);
    const W: Pessoa = { ...V, cookie: `${cookie.name}=${cookie.value}`, identidadeId: novo.json().identidadeId };
    assert.equal((await ctx.api(W, "GET", `/conversas/${conversaId}/mensagens`)).statusCode, 404);
    assert.equal((await ctx.api(V, "GET", "/conversas")).statusCode, 401, "a sessão vencida não volta a valer");
  });

  it("atividade válida renova o prazo", async () => {
    const V = await criarVisitante("Ativo");
    await envelhecer(V.identidadeId, VISITANTE_INATIVIDADE_MAXIMA_MS - 60 * 60_000);
    assert.equal((await ctx.api(V, "GET", "/conversas")).statusCode, 200);
    const [marca] = await ctx.banco.select().from(identidadesVisitantes).where(eq(identidadesVisitantes.identidadeId, V.identidadeId));
    assert.ok(marca && Date.now() - marca.ultimaAtividadeEm.getTime() < 60_000, "o prazo recomeçou");
    await expirarVisitantes(ctx.banco);
    assert.equal((await ctx.api(V, "GET", "/conversas")).statusCode, 200);
  });

  it("até 5 conversas NOVAS; a 6ª exige conta e não é criada; as 5 continuam funcionando", async () => {
    const extras = [
      await ctx.criarPessoa(5, `${PREFIXO}_p5`, "Pessoa 5"),
      await ctx.criarPessoa(6, `${PREFIXO}_p6`, "Pessoa 6"),
      await ctx.criarPessoa(7, `${PREFIXO}_p7`, "Pessoa 7"),
    ];
    const V = await criarVisitante("Muitas conversas");
    const destinos = [`${PREFIXO}_dona`, `${PREFIXO}_terc`, `${PREFIXO}_exist`, `${PREFIXO}_p5`, `${PREFIXO}_p6`];
    const abertas: string[] = [];
    for (const destino of destinos) abertas.push(await ctx.abrirConversa(V, destino));
    assert.equal(new Set(abertas).size, 5);

    const sexta = await ctx.api(V, "POST", "/conversas/diretas", { nomeUsuario: `${PREFIXO}_p7` });
    assert.equal(sexta.statusCode, 429, sexta.body);
    assert.equal(sexta.json().codigo, "LIMITE_DE_CONVERSAS_ATINGIDO");
    assert.equal((await conversasDoPar(V.identidadeId, extras[2]?.identidadeId ?? "")).length, 0, "a 6ª não foi criada");

    // As 5 continuam: reabrir, enviar, receber e ler.
    for (const [indice, destino] of destinos.entries()) assert.equal(await ctx.abrirConversa(V, destino), abertas[indice]);
    const enviada = await ctx.enviar(V, abertas[4] as string, "ainda converso aqui");
    const recebida = await ctx.enviar(extras[1] as Pessoa, abertas[4] as string, "e eu respondo");
    const historico = await ctx.historico(V, abertas[4] as string);
    assert.deepEqual(new Set(historico.mensagens.map((m) => m.id)), new Set([enviada.id, recebida.id]));
    assert.deepEqual((await ctx.lista(V)).conversas.map((c) => c.id), [abertas[4]], "a lista mostra a conversa com mensagens");
  });

  it("teto de conversas novas por visitante (reabrir uma existente nunca é recusado)", async () => {
    const V = await criarVisitante("Spam?");
    const primeira = await obterOuCriarConversaDireta(ctx.banco, V.identidadeId, D.identidadeId, 1);
    assert.ok("conversaId" in primeira);
    assert.deepEqual(await obterOuCriarConversaDireta(ctx.banco, V.identidadeId, T.identidadeId, 1), { limiteAtingido: true });
    const denovo = await obterOuCriarConversaDireta(ctx.banco, V.identidadeId, D.identidadeId, 1);
    assert.ok("conversaId" in denovo && denovo.conversaId === primeira.conversaId);
    assert.equal((await ctx.banco.select().from(participantesConversa).where(and(eq(participantesConversa.identidadeId, V.identidadeId), or(eq(participantesConversa.conversaId, primeira.conversaId))))).length, 1);
  });

  it("situação do visitante (regra pura)", () => {
    const agora = new Date("2026-10-15T12:00:00Z");
    const ha = (ms: number) => new Date(agora.getTime() - ms);
    assert.equal(situacaoDoVisitante({ ultimaAtividadeEm: ha(VISITANTE_INATIVIDADE_MAXIMA_MS - 1), convertidaEm: null, encerradaEm: null }, agora), "ativa");
    assert.equal(situacaoDoVisitante({ ultimaAtividadeEm: ha(VISITANTE_INATIVIDADE_MAXIMA_MS + 1), convertidaEm: null, encerradaEm: null }, agora), "expirada");
    assert.equal(situacaoDoVisitante({ ultimaAtividadeEm: ha(VISITANTE_INATIVIDADE_MAXIMA_MS * 3), convertidaEm: agora, encerradaEm: null }, agora), "convertida");
    assert.equal(situacaoDoVisitante({ ultimaAtividadeEm: ha(1), convertidaEm: null, encerradaEm: agora }, agora), "encerrada");
  });
});
