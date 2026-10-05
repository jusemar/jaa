import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { empresas, escolhasItemPedido, gruposOpcoesProduto, identidades, opcoesProdutoDias } from "@jaa/banco/schema";
import {
  diaOperacionalDaEmpresa,
  validarEscolhas,
  type CatalogoPublico,
  type DiaSemana,
  type GrupoOpcoesPublico,
  type ListaGruposOpcoes,
  type Pedido,
  type ProdutoPublicoDetalhe,
} from "@jaa/contratos";
import { eq, inArray } from "drizzle-orm";
import { consultarCatalogo, consultarProdutoDoCatalogo } from "../src/features/catalogo/casos-de-uso/consultar-catalogo.js";
import { criarCanalEventosMensagens } from "../src/features/mensagens/lib/eventos-mensagens.js";
import { criarPedido } from "../src/features/pedidos/casos-de-uso/criar-pedido.js";
import { serializarGruposPublicos } from "../src/features/produtos/lib/serializar-personalizacao.js";
import { definirOpcoesDoDia, definirProgramacaoSemanalDoGrupo, listarProgramacaoDoGrupo } from "../src/features/produtos/repositorios/repositorio-personalizacao.js";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * PROGRAMAÇÃO SEMANAL das opções — fundação (banco + regra central + dia operacional).
 *
 * O que estes testes protegem:
 *  - opt-in: grupo sem programação continua EXATAMENTE como antes;
 *  - grupo com programação oferece "disponível + programada para o dia", e nada mais;
 *  - o dia é o da EMPRESA (fuso dela), decidido no servidor;
 *  - a mesma regra vale no cardápio e na criação do pedido (opção de outro dia é recusada);
 *  - mínimo/máximo continuam sendo a única regra de quantidade — nenhum nome de grupo é especial;
 *  - pedido já feito (snapshot) não muda quando a programação muda.
 *
 * O dia é fixado passando o INSTANTE aos casos de uso (o mesmo parâmetro que em produção recebe o
 * relógio do servidor). Os testes por HTTP usam o dia de hoje de verdade.
 */

const PREFIXO = `sem${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({ telefones: ["+5531987669001", "+5531987669002"], prefixoIp: "198.51.109." });
const FUSO = "America/Sao_Paulo";

/** Um instante (15h UTC = meio-dia em São Paulo) cujo dia, no fuso informado, é o pedido. */
function instanteDoDia(dia: DiaSemana, fuso = FUSO): Date {
  for (let i = 0; i < 7; i++) {
    const instante = new Date(Date.UTC(2026, 9, 5 + i, 15, 0, 0));
    if (diaOperacionalDaEmpresa(instante, fuso) === dia) return instante;
  }
  throw new Error("dia não encontrado");
}
const SEGUNDA = 1, TERCA = 2, QUARTA = 3;

let dona: Pessoa;
let cliente: Pessoa;
let clienteUsuarioId = "";
let empresaId = "";
let identidadeEmpresa = "";
let prato = "";
let suco = "";
let executivo = "";
let conversa = "";
let endereco = "";
const grupo: Record<string, string> = {};
const opcao: Record<string, string> = {};

const rotaGrupos = (produtoId: string) => `/empresas/${empresaId}/produtos/${produtoId}/grupos-opcoes`;

async function criarGrupo(produtoId: string, chave: string, corpo: Record<string, unknown>) {
  const resposta = await ctx.api(dona, "POST", rotaGrupos(produtoId), corpo);
  assert.equal(resposta.statusCode, 201, resposta.body);
  grupo[chave] = (resposta.json() as ListaGruposOpcoes).grupos.at(-1)!.id;
}
async function criarOpcao(produtoId: string, chaveGrupo: string, chave: string, corpo: Record<string, unknown>) {
  const resposta = await ctx.api(dona, "POST", `${rotaGrupos(produtoId)}/${grupo[chaveGrupo]}/opcoes`, corpo);
  assert.equal(resposta.statusCode, 201, resposta.body);
  const doGrupo = (resposta.json() as ListaGruposOpcoes).grupos.find((item) => item.id === grupo[chaveGrupo])!;
  opcao[chave] = doGrupo.opcoes.at(-1)!.id;
}

/** Visão de CLIENTE num instante: `{ "Nome do grupo": ["Opção", …] }` + os grupos para validar escolhas. */
async function cardapioEm(produtoId: string, instante: Date): Promise<{ nomes: Record<string, string[]>; grupos: GrupoOpcoesPublico[] }> {
  const resultado = await consultarProdutoDoCatalogo(ctx.banco, identidadeEmpresa, produtoId, instante);
  assert.equal(resultado.tipo, "produto");
  if (resultado.tipo !== "produto") throw new Error("produto não encontrado");
  const grupos = serializarGruposPublicos(resultado.grupos);
  return { nomes: Object.fromEntries(grupos.map((item) => [item.nome, item.opcoes.map((escolha) => escolha.nome)])), grupos };
}
const programar = (chaveGrupo: string, dia: DiaSemana, chaves: string[]) =>
  definirOpcoesDoDia(ctx.banco, empresaId, grupo[chaveGrupo]!, dia, chaves.map((chave) => opcao[chave]!));
const ligar = (chaveGrupo: string, ligada = true) => definirProgramacaoSemanalDoGrupo(ctx.banco, empresaId, grupo[chaveGrupo]!, ligada);

const pedirEm = (instante: Date, opcaoIds: string[], produtoId = prato) =>
  criarPedido({ banco: ctx.banco, eventosMensagens: criarCanalEventosMensagens(), agora: () => instante }, cliente.identidadeId, clienteUsuarioId, {
    idCliente: randomUUID(),
    empresaIdentidadeId: identidadeEmpresa,
    conversaId: conversa,
    enderecoId: endereco,
    itens: [{ produtoId, quantidade: 1, opcaoIds }],
    pagamento: { forma: "cartao" },
  });

before(async () => {
  await ctx.iniciar();
  dona = await ctx.criarPessoa(0, `${PREFIXO}_dona`, "Dona Semana");
  cliente = await ctx.criarPessoa(1, `${PREFIXO}_cli`, "Cliente Semana");
  const empresa = (await ctx.api(dona, "POST", "/empresas", { nome: "Restaurante Semana", nomeUsuario: `${PREFIXO}_rest`, slug: `${PREFIXO}-rest` })).json();
  empresaId = empresa.id;
  identidadeEmpresa = empresa.identidadeId;
  const produto = async (nome: string, precoCentavos: number) => (await ctx.api(dona, "POST", `/empresas/${empresaId}/produtos`, { nome, precoCentavos })).json().id as string;
  prato = await produto("Monte seu prato", 2490);
  suco = await produto("Suco natural", 900);
  executivo = await produto("Prato executivo", 3200);

  // Nomes de grupo de propósito "comuns": nenhum deles é conhecido pelo Jaa.
  await criarGrupo(prato, "tamanho", { nome: "Tamanho", minimoEscolhas: 1, maximoEscolhas: 1 });
  await criarOpcao(prato, "tamanho", "pequeno", { nome: "Pequeno" });
  await criarOpcao(prato, "tamanho", "grande", { nome: "Grande", precoAdicionalCentavos: 500 });
  await criarGrupo(prato, "guarnicoes", { nome: "Guarnições", minimoEscolhas: 0, maximoEscolhas: 3 });
  await criarOpcao(prato, "guarnicoes", "arroz", { nome: "Arroz" });
  await criarOpcao(prato, "guarnicoes", "feijao", { nome: "Feijão" });
  await criarOpcao(prato, "guarnicoes", "salada", { nome: "Salada" });
  await criarOpcao(prato, "guarnicoes", "macarrao", { nome: "Macarrão", disponibilidade: "indisponivel" });
  await criarGrupo(prato, "carne", { nome: "Tipo de carne", minimoEscolhas: 0, maximoEscolhas: 1 });
  await criarOpcao(prato, "carne", "frango", { nome: "Frango" });
  await criarOpcao(prato, "carne", "boi", { nome: "Boi", precoAdicionalCentavos: 300 });

  await criarGrupo(suco, "adicional", { nome: "Adicional", minimoEscolhas: 0, maximoEscolhas: 1 });
  await criarOpcao(suco, "adicional", "gelo", { nome: "Gelo" });
  await criarGrupo(executivo, "proteina", { nome: "Proteína", minimoEscolhas: 1, maximoEscolhas: 1 });
  await criarOpcao(executivo, "proteina", "peixe", { nome: "Peixe" });

  conversa = await ctx.abrirConversa(cliente, `${PREFIXO}_rest`);
  endereco = await ctx.criarEnderecoConfirmado(cliente);
  const [linha] = await ctx.banco.select({ usuarioId: identidades.usuarioId }).from(identidades).where(eq(identidades.id, cliente.identidadeId));
  clienteUsuarioId = linha!.usuarioId!;
});

after(() => ctx.encerrar());

describe("compatibilidade: grupo SEM programação semanal continua igual", () => {
  const ESPERADO = { Tamanho: ["Pequeno", "Grande"], Guarnições: ["Arroz", "Feijão", "Salada"], "Tipo de carne": ["Frango", "Boi"] };

  it("todo grupo nasce com a programação desligada e a empresa no fuso padrão", async () => {
    const lista: ListaGruposOpcoes = (await ctx.api(dona, "GET", rotaGrupos(prato))).json();
    assert.deepEqual(lista.grupos.map((item) => item.programacaoSemanal), [false, false, false]);
    const [empresa] = await ctx.banco.select({ fuso: empresas.fusoHorario }).from(empresas).where(eq(empresas.id, empresaId));
    assert.equal(empresa?.fuso, "America/Sao_Paulo");
  });

  it("o cardápio é o mesmo em qualquer dia — só a disponibilidade normal decide", async () => {
    for (const dia of [1, 2, 3, 4, 5, 6, 7] as const) assert.deepEqual((await cardapioEm(prato, instanteDoDia(dia))).nomes, ESPERADO, `dia ${dia}`);
    const http: ProdutoPublicoDetalhe = (await ctx.api(null, "GET", `/publico/empresas/${identidadeEmpresa}/catalogo/produtos/${prato}`)).json();
    assert.deepEqual(Object.fromEntries(http.grupos.map((item) => [item.nome, item.opcoes.map((escolha) => escolha.nome)])), ESPERADO);
  });

  it("dias gravados com a programação DESLIGADA não têm efeito nenhum", async () => {
    assert.equal(await programar("guarnicoes", SEGUNDA, ["arroz"]), true);
    assert.deepEqual((await cardapioEm(prato, instanteDoDia(SEGUNDA))).nomes, ESPERADO);
    assert.deepEqual((await cardapioEm(prato, instanteDoDia(TERCA))).nomes, ESPERADO);
  });
});

describe("grupo COM programação semanal: disponível + programada para o dia", () => {
  before(async () => {
    await programar("guarnicoes", SEGUNDA, ["arroz", "feijao", "macarrao"]);
    await programar("guarnicoes", TERCA, ["arroz", "salada"]);
    await programar("carne", SEGUNDA, ["frango", "boi"]);
    await programar("carne", TERCA, ["boi"]);
    await ligar("guarnicoes");
    await ligar("carne");
  });

  it("segunda mostra as opções de segunda; a programada mas INDISPONÍVEL não aparece", async () => {
    const { nomes } = await cardapioEm(prato, instanteDoDia(SEGUNDA));
    assert.deepEqual(nomes, { Tamanho: ["Pequeno", "Grande"], Guarnições: ["Arroz", "Feijão"], "Tipo de carne": ["Frango", "Boi"] });
  });

  it("terça mostra as de terça; a DISPONÍVEL mas não programada para o dia não aparece", async () => {
    const { nomes } = await cardapioEm(prato, instanteDoDia(TERCA));
    assert.deepEqual(nomes, { Tamanho: ["Pequeno", "Grande"], Guarnições: ["Arroz", "Salada"], "Tipo de carne": ["Boi"] });
  });

  it("a MESMA opção vale em vários dias sem ser duplicada", async () => {
    const programacao = await listarProgramacaoDoGrupo(ctx.banco, empresaId, grupo.guarnicoes!);
    assert.equal(programacao.length, 7);
    const diasDoArroz = programacao.filter((dia) => dia.opcaoIds.includes(opcao.arroz!)).map((dia) => dia.diaSemana);
    assert.deepEqual(diasDoArroz, [SEGUNDA, TERCA]);
    const linhas = await ctx.banco.select().from(opcoesProdutoDias).where(eq(opcoesProdutoDias.opcaoId, opcao.arroz!));
    assert.equal(linhas.length, 2, "uma linha por dia, a opção é uma só");
  });

  it("grupo de mínimo 0 pode ficar SEM opções no dia: some do cardápio e o produto continua montável", async () => {
    const { nomes, grupos } = await cardapioEm(prato, instanteDoDia(QUARTA));
    assert.deepEqual(nomes, { Tamanho: ["Pequeno", "Grande"] });
    assert.deepEqual(validarEscolhas(grupos, [opcao.pequeno!]), { valido: true });
    const criado = await pedirEm(instanteDoDia(QUARTA), [opcao.grande!]);
    assert.equal(criado.tipo, "criado");
  });

  it("mínimo 0 / máximo 1 continua sendo 'nenhuma ou uma' — a programação não cria obrigatoriedade", async () => {
    const { grupos } = await cardapioEm(prato, instanteDoDia(SEGUNDA));
    const carne = grupos.find((item) => item.nome === "Tipo de carne")!;
    assert.deepEqual([carne.minimoEscolhas, carne.maximoEscolhas], [0, 1]);
    assert.deepEqual(validarEscolhas(grupos, [opcao.pequeno!]), { valido: true });
    assert.deepEqual(validarEscolhas(grupos, [opcao.pequeno!, opcao.frango!]), { valido: true });
    assert.equal(validarEscolhas(grupos, [opcao.pequeno!, opcao.frango!, opcao.boi!]).valido, false);
  });

  it("grupo sem programação (Tamanho) do MESMO produto não é afetado", async () => {
    for (const dia of [SEGUNDA, TERCA, QUARTA] as const) assert.deepEqual((await cardapioEm(prato, instanteDoDia(dia))).nomes.Tamanho, ["Pequeno", "Grande"]);
  });

  it("desligar a programação devolve o comportamento antigo SEM apagar os dias; religar os retoma", async () => {
    await ligar("carne", false);
    assert.deepEqual((await cardapioEm(prato, instanteDoDia(QUARTA))).nomes["Tipo de carne"], ["Frango", "Boi"]);
    await ligar("carne", true);
    assert.deepEqual((await cardapioEm(prato, instanteDoDia(TERCA))).nomes["Tipo de carne"], ["Boi"]);
  });
});

describe("a lista do cardápio usa a MESMA regra ('tem montagem hoje?')", () => {
  it("produto cujo único grupo é semanal e não tem nada no dia deixa de ser montável naquele dia", async () => {
    await programar("adicional", TERCA, ["gelo"]);
    await ligar("adicional");
    const personalizaveisEm = async (dia: DiaSemana) => {
      const resultado = await consultarCatalogo(ctx.banco, identidadeEmpresa, instanteDoDia(dia));
      if (resultado.tipo !== "catalogo") throw new Error("catálogo não encontrado");
      return resultado.personalizaveis;
    };
    const segunda = await personalizaveisEm(SEGUNDA);
    assert.deepEqual([segunda.has(prato), segunda.has(suco)], [true, false]);
    const terca = await personalizaveisEm(TERCA);
    assert.deepEqual([terca.has(prato), terca.has(suco)], [true, true]);
    // O produto continua no cardápio todos os dias: a programação não esconde produto.
    const lista: CatalogoPublico = (await ctx.api(null, "GET", `/publico/empresas/${identidadeEmpresa}/catalogo`)).json();
    assert.ok(lista.produtos.some((produto) => produto.id === suco));
  });
});

describe("mínimo > 0 que o dia não consegue atender segue a regra genérica já existente", () => {
  it("o grupo é omitido naquele dia (como já acontecia com opções indisponíveis); no dia programado volta, obrigatório", async () => {
    await programar("proteina", TERCA, ["peixe"]);
    await ligar("proteina");
    assert.deepEqual((await cardapioEm(executivo, instanteDoDia(SEGUNDA))).nomes, {});
    const terca = await cardapioEm(executivo, instanteDoDia(TERCA));
    assert.deepEqual(terca.nomes, { Proteína: ["Peixe"] });
    assert.equal(validarEscolhas(terca.grupos, []).valido, false, "na terça a escolha é obrigatória");
    // Mesmo desfecho da regra antiga: a opção ficar indisponível tem exatamente este efeito.
    assert.equal((await pedirEm(instanteDoDia(SEGUNDA), [], executivo)).tipo, "criado");
    assert.equal((await pedirEm(instanteDoDia(TERCA), [], executivo)).tipo, "escolhas-invalidas");
  });
});

describe("o pedido é validado pelo MESMO dia e pela mesma regra", () => {
  it("opção de OUTRO dia enviada à mão é recusada; a do dia é aceita com o preço recalculado", async () => {
    const terca = instanteDoDia(TERCA);
    // Frango é de segunda. Na terça não existe para o pedido, mesmo sendo uma opção real e disponível.
    assert.equal((await pedirEm(terca, [opcao.pequeno!, opcao.frango!])).tipo, "escolhas-invalidas");
    // Feijão (guarnição de segunda) também.
    assert.equal((await pedirEm(terca, [opcao.pequeno!, opcao.feijao!])).tipo, "escolhas-invalidas");

    const criado = await pedirEm(terca, [opcao.grande!, opcao.boi!, opcao.arroz!, opcao.salada!]);
    assert.equal(criado.tipo, "criado");
    if (criado.tipo !== "criado") return;
    assert.equal(criado.pedido.itens[0]!.precoUnitarioCentavos, 2490 + 500 + 300);
  });

  it("carrinho montado na segunda e confirmado na terça é recusado (o servidor não confia no carrinho)", async () => {
    const montadoNaSegunda = [opcao.pequeno!, opcao.frango!, opcao.feijao!];
    assert.equal((await pedirEm(instanteDoDia(SEGUNDA), montadoNaSegunda)).tipo, "criado");
    assert.equal((await pedirEm(instanteDoDia(TERCA), montadoNaSegunda)).tipo, "escolhas-invalidas");
  });

  it("programada para o dia mas INDISPONÍVEL, de outro produto ou inexistente: recusadas como sempre", async () => {
    const segunda = instanteDoDia(SEGUNDA);
    assert.equal((await pedirEm(segunda, [opcao.pequeno!, opcao.macarrao!])).tipo, "escolhas-invalidas");
    assert.equal((await pedirEm(segunda, [opcao.pequeno!, opcao.gelo!])).tipo, "escolhas-invalidas");
    assert.equal((await pedirEm(segunda, [opcao.pequeno!, randomUUID()])).tipo, "escolhas-invalidas");
  });

  it("pela API real (dia de HOJE no servidor): opção só de outro dia → 409; a de hoje → 201", async () => {
    const hoje = diaOperacionalDaEmpresa(new Date(), FUSO);
    const outroDia = ((hoje % 7) + 1) as DiaSemana;
    // Reprograma a carne: frango só hoje, boi só em outro dia.
    for (const dia of [1, 2, 3, 4, 5, 6, 7] as const) await programar("carne", dia, dia === hoje ? ["frango"] : dia === outroDia ? ["boi"] : []);
    const pedir = (opcaoIds: string[]) =>
      ctx.api(cliente, "POST", "/pedidos", { idCliente: randomUUID(), empresaIdentidadeId: identidadeEmpresa, conversaId: conversa, enderecoId: endereco, itens: [{ produtoId: prato, quantidade: 1, opcaoIds }], pagamento: { forma: "cartao" } });

    const recusado = await pedir([opcao.pequeno!, opcao.boi!]);
    assert.equal(recusado.statusCode, 409, recusado.body);
    assert.equal(recusado.json().codigo, "ESCOLHAS_INVALIDAS");

    const aceito = await pedir([opcao.pequeno!, opcao.frango!]);
    assert.equal(aceito.statusCode, 201, aceito.body);
    const detalhe: ProdutoPublicoDetalhe = (await ctx.api(null, "GET", `/publico/empresas/${identidadeEmpresa}/catalogo/produtos/${prato}`)).json();
    assert.deepEqual(detalhe.grupos.find((item) => item.nome === "Tipo de carne")?.opcoes.map((escolha) => escolha.nome), ["Frango"], "o cardápio público mostra o mesmo que o pedido aceita");
  });
});

describe("o dia é o da EMPRESA, no fuso dela", () => {
  it("o mesmo instante é segunda em São Paulo e terça em Tóquio", () => {
    // 02:30 UTC de terça = 23:30 de segunda em São Paulo = 11:30 de terça em Tóquio.
    const instante = new Date("2026-10-06T02:30:00Z");
    assert.equal(diaOperacionalDaEmpresa(instante, "America/Sao_Paulo"), 1);
    assert.equal(diaOperacionalDaEmpresa(instante, "Asia/Tokyo"), 2);
    assert.equal(diaOperacionalDaEmpresa(new Date("2026-10-06T03:00:00Z"), "America/Sao_Paulo"), 2, "meia-noite local vira o dia");
  });

  it("o cardápio segue o fuso gravado na empresa — o relógio de quem olha nunca entra", async () => {
    await programar("guarnicoes", SEGUNDA, ["feijao"]);
    await programar("guarnicoes", TERCA, ["salada"]);
    const instante = new Date("2026-10-06T02:30:00Z");
    assert.deepEqual((await cardapioEm(prato, instante)).nomes.Guarnições, ["Feijão"], "São Paulo: ainda é segunda");

    await ctx.banco.update(empresas).set({ fusoHorario: "Asia/Tokyo" }).where(eq(empresas.id, empresaId));
    assert.deepEqual((await cardapioEm(prato, instante)).nomes.Guarnições, ["Salada"], "Tóquio: já é terça");
    await ctx.banco.update(empresas).set({ fusoHorario: FUSO }).where(eq(empresas.id, empresaId));
  });
});

describe("pedidos já feitos não mudam (snapshot)", () => {
  it("mudar a programação, desligá-la ou apagar a opção não altera o que foi pedido", async () => {
    await programar("carne", TERCA, ["boi"]);
    const criado = await pedirEm(instanteDoDia(TERCA), [opcao.grande!, opcao.boi!]);
    assert.equal(criado.tipo, "criado");
    if (criado.tipo !== "criado") return;
    const pedidoId = criado.pedido.pedido.id;
    const escolhasDoPedido = async () => {
      const pedido: Pedido = (await ctx.api(cliente, "GET", `/pedidos/${pedidoId}`)).json();
      return { total: pedido.totalCentavos, escolhas: pedido.itens[0]!.escolhas.map((escolha) => [escolha.grupoNome, escolha.opcaoNome, escolha.precoAdicionalCentavos]) };
    };
    const antes = await escolhasDoPedido();
    assert.deepEqual(antes.escolhas, [["Tamanho", "Grande", 500], ["Tipo de carne", "Boi", 300]]);

    // Boi sai da terça, depois a opção é apagada (os dias dela somem em cascata).
    await programar("carne", TERCA, []);
    assert.deepEqual(await escolhasDoPedido(), antes);
    const apagada = await ctx.api(dona, "DELETE", `${rotaGrupos(prato)}/${grupo.carne}/opcoes/${opcao.boi}`);
    assert.ok(apagada.statusCode < 300, apagada.body);
    assert.deepEqual(await ctx.banco.select().from(opcoesProdutoDias).where(eq(opcoesProdutoDias.opcaoId, opcao.boi!)), []);
    assert.deepEqual(await escolhasDoPedido(), antes);
    const linhas = await ctx.banco.select({ nome: escolhasItemPedido.opcaoNome, opcaoId: escolhasItemPedido.opcaoId }).from(escolhasItemPedido).where(inArray(escolhasItemPedido.opcaoNome, ["Boi"]));
    assert.ok(linhas.some((linha) => linha.nome === "Boi" && linha.opcaoId === null), "o nome fica no pedido mesmo sem a opção");
  });
});

describe("integridade da programação", () => {
  it("opção de OUTRO grupo não entra na programação de um grupo (tudo ou nada)", async () => {
    const antes = await listarProgramacaoDoGrupo(ctx.banco, empresaId, grupo.guarnicoes!);
    assert.equal(await programar("guarnicoes", QUARTA, ["arroz", "frango"]), false);
    assert.deepEqual(await listarProgramacaoDoGrupo(ctx.banco, empresaId, grupo.guarnicoes!), antes);
  });

  it("o banco recusa dia fora de 1–7 e a mesma opção duas vezes no mesmo dia", async () => {
    const inserir = (diaSemana: number) => ctx.banco.insert(opcoesProdutoDias).values({ empresaId, opcaoId: opcao.arroz!, diaSemana });
    await assert.rejects(inserir(0));
    await assert.rejects(inserir(8));
    await programar("guarnicoes", QUARTA, ["arroz"]);
    await assert.rejects(inserir(QUARTA));
  });

  it("a opção só pode ser programada pela empresa dona dela", async () => {
    const [outra] = await ctx.banco.select({ id: empresas.id }).from(empresas).where(eq(empresas.slug, `${PREFIXO}-rest`));
    assert.equal(outra?.id, empresaId);
    await assert.rejects(ctx.banco.insert(opcoesProdutoDias).values({ empresaId: randomUUID(), opcaoId: opcao.salada!, diaSemana: 5 }), "FK composta empresa + opção");
    const [grupoDoBanco] = await ctx.banco.select({ ativa: gruposOpcoesProduto.programacaoSemanal }).from(gruposOpcoesProduto).where(eq(gruposOpcoesProduto.id, grupo.tamanho!));
    assert.equal(grupoDoBanco?.ativa, false);
  });
});
