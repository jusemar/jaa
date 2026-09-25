import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { MAXIMO_GRUPOS_POR_PRODUTO, precoUnitarioComEscolhas, validarEscolhas, type CatalogoPublico, type ListaGruposOpcoes, type ProdutoPublicoDetalhe } from "@jaa/contratos";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * PERSONALIZAÇÃO DO PRODUTO — grupos de opções configuráveis pela empresa.
 *
 * O que estes testes protegem:
 *  - a empresa cadastra os grupos (o Jaa não conhece "tamanho" nem "guarnição");
 *  - grupo e opção são ESCOPADOS pela empresa e pelo produto: id de outra empresa é 404;
 *  - o cliente só recebe opções DISPONÍVEIS, e um grupo impossível de cumprir não é oferecido;
 *  - mínimo/máximo e acréscimo saem do banco — a interface não decide nada disso.
 *
 * A criação do PEDIDO com escolhas (recálculo do preço, recusa de mínimo/máximo e snapshot) é
 * verificada em pedidos.test.ts, junto do resto do domínio Pedido.
 */

const PREFIXO = `per${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({ telefones: ["+5531987668001", "+5531987668002"], prefixoIp: "198.51.108." });

let dona: Pessoa;
let estranha: Pessoa;
let restaurante = "";
let mercado = "";
let prato = "";
let refrigerante = "";
let identidadeRestaurante = "";

const rotaGrupos = (empresaId: string, produtoId: string) => `/empresas/${empresaId}/produtos/${produtoId}/grupos-opcoes`;

const criarProduto = async (empresaId: string, nome: string, precoCentavos: number) =>
  (await ctx.api(dona, "POST", `/empresas/${empresaId}/produtos`, { nome, precoCentavos })).json().id as string;

before(async () => {
  await ctx.iniciar();
  dona = await ctx.criarPessoa(0, `${PREFIXO}_dona`, "Dona Personaliza");
  estranha = await ctx.criarPessoa(1, `${PREFIXO}_estranha`, "Estranha");

  const empresaRestaurante = (
    await ctx.api(dona, "POST", "/empresas", { nome: "Restaurante Per", nomeUsuario: `${PREFIXO}_rest`, slug: `${PREFIXO}-restaurante` })
  ).json();
  restaurante = empresaRestaurante.id;
  identidadeRestaurante = empresaRestaurante.identidadeId;
  mercado = (await ctx.api(dona, "POST", "/empresas", { nome: "Mercado Per", nomeUsuario: `${PREFIXO}_merc`, slug: `${PREFIXO}-mercado` })).json().id;

  prato = await criarProduto(restaurante, "Monte seu prato", 2490);
  refrigerante = await criarProduto(restaurante, "Refrigerante lata", 600);
});

after(() => ctx.encerrar());

describe("a EMPRESA cadastra os grupos de opções", () => {
  let tamanho = "";
  let acompanhamentos = "";

  it("cria grupos com mínimo/máximo próprios e devolve a lista completa, na ordem de cadastro", async () => {
    const primeiro = await ctx.api(dona, "POST", rotaGrupos(restaurante, prato), {
      nome: "  Tamanho do prato  ",
      instrucao: "  O tamanho vale para os dois  ",
      minimoEscolhas: 1,
      maximoEscolhas: 1,
    });
    assert.equal(primeiro.statusCode, 201, primeiro.body);
    const lista: ListaGruposOpcoes = primeiro.json();
    assert.equal(lista.grupos.length, 1);
    tamanho = lista.grupos[0]!.id;
    // Texto normalizado no servidor (o banco também exige sem espaço nas pontas).
    assert.equal(lista.grupos[0]!.nome, "Tamanho do prato");
    assert.equal(lista.grupos[0]!.instrucao, "O tamanho vale para os dois");
    assert.equal(lista.grupos[0]!.posicao, 0, "a posição é atribuída sozinha, na ordem de cadastro");

    const segundo = await ctx.api(dona, "POST", rotaGrupos(restaurante, prato), { nome: "Acompanhamentos", minimoEscolhas: 0, maximoEscolhas: 3 });
    assert.equal(segundo.statusCode, 201, segundo.body);
    const grupos: ListaGruposOpcoes = segundo.json();
    acompanhamentos = grupos.grupos[1]!.id;
    assert.deepEqual(
      grupos.grupos.map((grupo) => [grupo.nome, grupo.minimoEscolhas, grupo.maximoEscolhas, grupo.posicao]),
      [
        ["Tamanho do prato", 1, 1, 0],
        ["Acompanhamentos", 0, 3, 1],
      ],
    );
  });

  it("recusa faixa incoerente e limite de grupos", async () => {
    const invertida = await ctx.api(dona, "POST", rotaGrupos(restaurante, prato), { nome: "Impossível", minimoEscolhas: 3, maximoEscolhas: 2 });
    assert.equal(invertida.statusCode, 400, invertida.body);
    assert.equal(invertida.json().codigo, "DADOS_INVALIDOS");

    // Alterar só o mínimo também não pode passar do máximo JÁ gravado.
    const soMinimo = await ctx.api(dona, "PATCH", `${rotaGrupos(restaurante, prato)}/${tamanho}`, { minimoEscolhas: 1 });
    assert.equal(soMinimo.statusCode, 200, soMinimo.body);
    const acimaDoMaximo = await ctx.api(dona, "PATCH", `${rotaGrupos(restaurante, prato)}/${tamanho}`, { minimoEscolhas: 5 });
    assert.equal(acimaDoMaximo.statusCode, 404, "mínimo acima do máximo gravado é recusado");

    const outro = await criarProduto(restaurante, "Produto com muitos grupos", 1000);
    for (let i = 0; i < MAXIMO_GRUPOS_POR_PRODUTO; i++) {
      const resposta = await ctx.api(dona, "POST", rotaGrupos(restaurante, outro), { nome: `Grupo ${i}` });
      assert.equal(resposta.statusCode, 201, resposta.body);
    }
    const excedente = await ctx.api(dona, "POST", rotaGrupos(restaurante, outro), { nome: "Um grupo além" });
    assert.equal(excedente.statusCode, 409, excedente.body);
    assert.equal(excedente.json().codigo, "LIMITE_DE_GRUPOS_ATINGIDO");
  });

  it("opções carregam o ACRÉSCIMO em centavos e podem ficar indisponíveis sem deixar de existir", async () => {
    const pequeno = await ctx.api(dona, "POST", `${rotaGrupos(restaurante, prato)}/${tamanho}/opcoes`, { nome: "Pequeno" });
    assert.equal(pequeno.statusCode, 201, pequeno.body);
    // Sem acréscimo informado = 0 (não muda o preço do produto).
    assert.equal(pequeno.json().grupos[0].opcoes[0].precoAdicionalCentavos, 0);

    await ctx.api(dona, "POST", `${rotaGrupos(restaurante, prato)}/${tamanho}/opcoes`, { nome: "Grande", precoAdicionalCentavos: 500 });
    for (const nome of ["Arroz", "Feijão", "Batata frita"]) {
      const acrescimo = nome === "Batata frita" ? 300 : 0;
      const criada = await ctx.api(dona, "POST", `${rotaGrupos(restaurante, prato)}/${acompanhamentos}/opcoes`, { nome, precoAdicionalCentavos: acrescimo });
      assert.equal(criada.statusCode, 201, criada.body);
    }

    const lista: ListaGruposOpcoes = (await ctx.api(dona, "GET", rotaGrupos(restaurante, prato))).json();
    const batata = lista.grupos[1]!.opcoes.find((opcao) => opcao.nome === "Batata frita")!;
    const desligada = await ctx.api(dona, "PATCH", `${rotaGrupos(restaurante, prato)}/${acompanhamentos}/opcoes/${batata.id}`, { disponibilidade: "indisponivel" });
    assert.equal(desligada.statusCode, 200, desligada.body);
    const apos: ListaGruposOpcoes = desligada.json();
    // Indisponível continua NA ADMINISTRAÇÃO (como o produto), apenas não é oferecida ao cliente.
    assert.equal(apos.grupos[1]!.opcoes.find((opcao) => opcao.id === batata.id)?.disponibilidade, "indisponivel");
  });

  it("fraciona preço? não: acréscimo é inteiro de centavos, e negativo é recusado", async () => {
    for (const valor of [4.5, "500", -100] as const) {
      const resposta = await ctx.api(dona, "POST", `${rotaGrupos(restaurante, prato)}/${tamanho}/opcoes`, { nome: "Inválida", precoAdicionalCentavos: valor });
      assert.equal(resposta.statusCode, 400, `${valor}`);
    }
  });
});

describe("escopo e autorização", () => {
  it("grupo e opção só existem dentro do par (empresa, produto) autorizado", async () => {
    const lista: ListaGruposOpcoes = (await ctx.api(dona, "GET", rotaGrupos(restaurante, prato))).json();
    const grupo = lista.grupos[0]!;
    const opcao = grupo.opcoes[0]!;

    // Mesma conta, empresa ERRADA: o produto não é do mercado.
    assert.equal((await ctx.api(dona, "GET", rotaGrupos(mercado, prato))).statusCode, 404);
    // Produto de outro produto da mesma empresa: o grupo não é dele.
    assert.equal((await ctx.api(dona, "GET", rotaGrupos(restaurante, refrigerante))).json().grupos.length, 0);
    assert.equal((await ctx.api(dona, "PATCH", `${rotaGrupos(restaurante, refrigerante)}/${grupo.id}`, { nome: "Roubado" })).statusCode, 404);
    assert.equal((await ctx.api(dona, "DELETE", `${rotaGrupos(restaurante, refrigerante)}/${grupo.id}/opcoes/${opcao.id}`)).statusCode, 404);
    // Grupo e opção inexistentes.
    assert.equal((await ctx.api(dona, "PATCH", `${rotaGrupos(restaurante, prato)}/${randomUUID()}`, { nome: "x" })).statusCode, 404);
    assert.equal((await ctx.api(dona, "PATCH", `${rotaGrupos(restaurante, prato)}/${grupo.id}/opcoes/${randomUUID()}`, { nome: "x" })).statusCode, 404);
  });

  it("quem não opera a empresa não lê nem altera nada; sem sessão é 401", async () => {
    const lista: ListaGruposOpcoes = (await ctx.api(dona, "GET", rotaGrupos(restaurante, prato))).json();
    const grupo = lista.grupos[0]!;
    for (const [metodo, rota, corpo] of [
      ["GET", rotaGrupos(restaurante, prato), undefined],
      ["POST", rotaGrupos(restaurante, prato), { nome: "Meu grupo" }],
      ["PATCH", `${rotaGrupos(restaurante, prato)}/${grupo.id}`, { nome: "Meu nome" }],
      ["DELETE", `${rotaGrupos(restaurante, prato)}/${grupo.id}`, undefined],
    ] as const) {
      assert.equal((await ctx.api(estranha, metodo, rota, corpo)).statusCode, 404, `${metodo} ${rota}`);
      assert.equal((await ctx.api(null, metodo, rota, corpo)).statusCode, 401, `${metodo} ${rota} sem sessão`);
    }
    // Nada foi alterado pelas tentativas acima.
    assert.equal((await ctx.api(dona, "GET", rotaGrupos(restaurante, prato))).json().grupos.length, 2);
  });
});

describe("o CLIENTE recebe só o que pode montar", () => {
  it("o catálogo sinaliza quais produtos têm montagem, sem carregar os grupos de todos", async () => {
    const catalogo: CatalogoPublico = (await ctx.api(null, "GET", `/publico/empresas/${identidadeRestaurante}/catalogo`)).json();
    const porNome = new Map(catalogo.produtos.map((produto) => [produto.nome, produto]));
    assert.equal(porNome.get("Monte seu prato")?.personalizavel, true);
    assert.equal(porNome.get("Refrigerante lata")?.personalizavel, false);
    // A lista não traz grupos nem opções: o detalhe é que carrega isso.
    assert.ok(!JSON.stringify(catalogo.produtos).includes("opcoes"));
  });

  it("o detalhe traz os grupos com só as opções DISPONÍVEIS, e o acréscimo vem do servidor", async () => {
    const detalhe: ProdutoPublicoDetalhe = (await ctx.api(null, "GET", `/publico/empresas/${identidadeRestaurante}/catalogo/produtos/${prato}`)).json();
    assert.equal(detalhe.grupos.length, 2);
    assert.deepEqual(
      detalhe.grupos.map((grupo) => [grupo.nome, grupo.minimoEscolhas, grupo.maximoEscolhas, grupo.opcoes.map((opcao) => opcao.nome)]),
      [
        ["Tamanho do prato", 1, 1, ["Pequeno", "Grande"]],
        // "Batata frita" está indisponível: sai da montagem, e o máximo cai para o que existe.
        ["Acompanhamentos", 0, 2, ["Arroz", "Feijão"]],
      ],
    );
    // Nenhum campo administrativo escapa para o cliente.
    const corpo = JSON.stringify(detalhe);
    for (const proibido of ["indisponivel", "Batata frita", "posicao", "criadoEm", "empresaId"]) {
      assert.ok(!corpo.includes(proibido), proibido);
    }

    // A MESMA regra pura que a interface usa, aplicada aos grupos que vieram do servidor.
    const grande = detalhe.grupos[0]!.opcoes.find((opcao) => opcao.nome === "Grande")!;
    const arroz = detalhe.grupos[1]!.opcoes.find((opcao) => opcao.nome === "Arroz")!;
    assert.equal(validarEscolhas(detalhe.grupos, []).valido, false, "o tamanho é obrigatório");
    assert.equal(validarEscolhas(detalhe.grupos, [grande.id]).valido, true);
    // 24,90 + 5,00 (Grande) + 0 (Arroz) = 29,90.
    assert.equal(precoUnitarioComEscolhas(detalhe.produto.precoCentavos, detalhe.grupos, [grande.id, arroz.id]), 2990);
  });

  it("grupo sem opção disponível, ou impossível de cumprir, não é oferecido", async () => {
    const semOpcao = await criarProduto(restaurante, "Produto com grupo vazio", 1500);
    await ctx.api(dona, "POST", rotaGrupos(restaurante, semOpcao), { nome: "Grupo sem opção", minimoEscolhas: 0, maximoEscolhas: 2 });
    const impossivel = (await ctx.api(dona, "POST", rotaGrupos(restaurante, semOpcao), { nome: "Exige duas", minimoEscolhas: 2, maximoEscolhas: 2 })).json() as ListaGruposOpcoes;
    const grupoExigente = impossivel.grupos.find((grupo) => grupo.nome === "Exige duas")!;
    // Uma opção só, mas o grupo exige duas: o produto ficaria impossível de montar.
    await ctx.api(dona, "POST", `${rotaGrupos(restaurante, semOpcao)}/${grupoExigente.id}/opcoes`, { nome: "Única" });

    const detalhe: ProdutoPublicoDetalhe = (await ctx.api(null, "GET", `/publico/empresas/${identidadeRestaurante}/catalogo/produtos/${semOpcao}`)).json();
    assert.deepEqual(detalhe.grupos, [], "nenhum dos dois grupos é apresentado");
    assert.equal(detalhe.produto.personalizavel, false, "sem grupo apresentável, o produto é comum");
  });

  it("apagar o grupo tira a montagem do cardápio, sem apagar o produto", async () => {
    const lista: ListaGruposOpcoes = (await ctx.api(dona, "GET", rotaGrupos(restaurante, prato))).json();
    const acompanhamentos = lista.grupos.find((grupo) => grupo.nome === "Acompanhamentos")!;
    const apagado = await ctx.api(dona, "DELETE", `${rotaGrupos(restaurante, prato)}/${acompanhamentos.id}`);
    assert.equal(apagado.statusCode, 200, apagado.body);
    assert.deepEqual((apagado.json() as ListaGruposOpcoes).grupos.map((grupo) => grupo.nome), ["Tamanho do prato"]);

    const detalhe: ProdutoPublicoDetalhe = (await ctx.api(null, "GET", `/publico/empresas/${identidadeRestaurante}/catalogo/produtos/${prato}`)).json();
    assert.deepEqual(detalhe.grupos.map((grupo) => grupo.nome), ["Tamanho do prato"]);
    assert.equal(detalhe.produto.nome, "Monte seu prato", "o produto continua existindo");
  });
});
