import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { empresas, identidades, pedidos, periodosFuncionamentoEmpresa } from "@jaa/banco/schema";
import { catalogoPublicoSchema, funcionamentoEmpresaSchema, funcionamentoPublicoSchema, produtoPublicoDetalheSchema, type DiaSemana, type ListaGruposOpcoes } from "@jaa/contratos";
import { eq } from "drizzle-orm";
import { consultarCatalogo, consultarProdutoDoCatalogo } from "../src/features/catalogo/casos-de-uso/consultar-catalogo.js";
import { consultarFuncionamentoPublico } from "../src/features/empresas/casos-de-uso/funcionamento.js";
import { criarCanalEventosMensagens } from "../src/features/mensagens/lib/eventos-mensagens.js";
import { criarPedido } from "../src/features/pedidos/casos-de-uso/criar-pedido.js";
import { serializarGruposPublicos } from "../src/features/produtos/lib/serializar-personalizacao.js";
import { definirOpcoesDoDia, definirProgramacaoSemanalDoGrupo } from "../src/features/produtos/repositorios/repositorio-personalizacao.js";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * HORÁRIO DE FUNCIONAMENTO da empresa, de ponta a ponta (banco + API + criação do pedido).
 *
 * Protege: empresa que nunca configurou continua recebendo pedidos; a semana é gravada inteira e só
 * pelo dono; o cardápio (o mesmo da conversa e do link público) diz aberto/fechado pela MESMA regra
 * que recusa o pedido; fechada, nada é criado — nem chamando a API à mão; e a programação semanal das
 * opções continua valendo, independente do horário.
 *
 * O instante é fixado passando-o aos casos de uso (em produção, é o relógio do servidor). Os testes
 * por HTTP usam o relógio de verdade, com semanas que valem em qualquer instante (sempre aberta /
 * sempre fechada).
 */

const PREFIXO = `fun${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({ telefones: ["+5531987669201", "+5531987669202", "+5531987669203"], prefixoIp: "198.51.111." });
// Semana de 05/10/2026 (segunda). São Paulo = UTC−3.
const emSP = (dia: DiaSemana, hora: string) => new Date(`2026-10-${String(4 + dia).padStart(2, "0")}T${hora}:00-03:00`);
const SEGUNDA = 1, TERCA = 2, QUARTA = 3, SABADO = 6, DOMINGO = 7;
const SEMANA = [
  { diaSemana: 1, inicio: "08:00", fim: "14:00" },
  { diaSemana: 1, inicio: "18:00", fim: "23:00" },
  { diaSemana: 2, inicio: "08:00", fim: "23:00" },
  { diaSemana: 6, inicio: "18:00", fim: "02:00" },
];
const SEMPRE_ABERTA = [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({ diaSemana, inicio: "00:00", fim: "24:00" }));

let dona: Pessoa;
let cliente: Pessoa;
let estranha: Pessoa;
let clienteUsuarioId = "";
let empresaId = "";
let identidadeEmpresa = "";
let prato = "";
let grupoGuarnicoes = "";
const opcao: Record<string, string> = {};
let conversa = "";
let endereco = "";

const rota = () => `/empresas/${empresaId}/funcionamento`;
const salvar = (corpo: unknown, quem: Pessoa | null = dona) => ctx.api(quem, "PUT", rota(), corpo);
const corpoDoPedido = (opcaoIds: string[] = [], idCliente = randomUUID()) => ({
  idCliente,
  empresaIdentidadeId: identidadeEmpresa,
  conversaId: conversa,
  enderecoId: endereco,
  itens: [{ produtoId: prato, quantidade: 1, opcaoIds }],
  pagamento: { forma: "cartao" as const },
});
const pedirEm = (instante: Date, opcaoIds: string[] = [], idCliente = randomUUID()) =>
  criarPedido({ banco: ctx.banco, eventosMensagens: criarCanalEventosMensagens(), agora: () => instante }, cliente.identidadeId, clienteUsuarioId, corpoDoPedido(opcaoIds, idCliente));
const totalDePedidos = async () => (await ctx.banco.select({ id: pedidos.id }).from(pedidos).where(eq(pedidos.empresaId, empresaId))).length;
const estadoEm = async (instante: Date) => (await consultarFuncionamentoPublico(ctx.banco, empresaId, instante))!.estado;

before(async () => {
  await ctx.iniciar();
  dona = await ctx.criarPessoa(0, `${PREFIXO}_dona`, "Dona Horário");
  cliente = await ctx.criarPessoa(1, `${PREFIXO}_cli`, "Cliente Horário");
  estranha = await ctx.criarPessoa(2, `${PREFIXO}_est`, "Outra Conta");
  const empresa = (await ctx.api(dona, "POST", "/empresas", { nome: "Cantina Horário", nomeUsuario: `${PREFIXO}_cant`, slug: `${PREFIXO}-cant` })).json();
  empresaId = empresa.id;
  identidadeEmpresa = empresa.identidadeId;
  prato = (await ctx.api(dona, "POST", `/empresas/${empresaId}/produtos`, { nome: "Monte seu prato", precoCentavos: 2490 })).json().id;

  const grupos = `/empresas/${empresaId}/produtos/${prato}/grupos-opcoes`;
  grupoGuarnicoes = ((await ctx.api(dona, "POST", grupos, { nome: "Acompanhamentos", minimoEscolhas: 0, maximoEscolhas: 3 })).json() as ListaGruposOpcoes).grupos[0]!.id;
  for (const nome of ["Arroz", "Feijão", "Salada"]) {
    const lista: ListaGruposOpcoes = (await ctx.api(dona, "POST", `${grupos}/${grupoGuarnicoes}/opcoes`, { nome })).json();
    opcao[nome] = lista.grupos[0]!.opcoes.at(-1)!.id;
  }

  conversa = await ctx.abrirConversa(cliente, `${PREFIXO}_cant`);
  endereco = await ctx.criarEnderecoConfirmado(cliente);
  const [linha] = await ctx.banco.select({ usuarioId: identidades.usuarioId }).from(identidades).where(eq(identidades.id, cliente.identidadeId));
  clienteUsuarioId = linha!.usuarioId!;
});

after(() => ctx.encerrar());

describe("compatibilidade: empresa que nunca configurou horário", () => {
  it("nasce sem controle de horário e sem período nenhum", async () => {
    const [empresa] = await ctx.banco.select({ ativo: empresas.horarioFuncionamentoAtivo }).from(empresas).where(eq(empresas.id, empresaId));
    assert.equal(empresa?.ativo, false);
    const funcionamento = funcionamentoEmpresaSchema.parse((await ctx.api(dona, "GET", rota())).json());
    assert.equal(funcionamento.ativo, false);
    assert.deepEqual(funcionamento.periodos, []);
    assert.equal(funcionamento.fusoHorario, "America/Sao_Paulo");
    assert.deepEqual(funcionamento.estado, { controlado: false, abertoAgora: true, fechaAs: null, proximaAbertura: null, reabreHoje: false, resumo: null, aviso: null });
  });

  it("continua recebendo pedido a qualquer hora, como antes — inclusive de madrugada e no domingo", async () => {
    for (const instante of [emSP(SEGUNDA, "03:00"), emSP(DOMINGO, "23:50")]) assert.equal((await pedirEm(instante)).tipo, "criado");
    const http = await ctx.api(cliente, "POST", "/pedidos", corpoDoPedido());
    assert.equal(http.statusCode, 201, http.body);
  });

  it("o cardápio público informa que não há controle (nada de 'Fechado' inventado)", async () => {
    const catalogo = catalogoPublicoSchema.parse((await ctx.api(null, "GET", `/publico/empresas/${identidadeEmpresa}/catalogo`)).json());
    assert.equal(catalogo.funcionamento.estado.controlado, false);
    assert.equal(catalogo.funcionamento.estado.abertoAgora, true);
    assert.deepEqual(catalogo.funcionamento.semana, []);
  });
});

describe("administração dos horários (rotas do gestor)", () => {
  it("salva a semana inteira — vários períodos no dia, dia fechado e período que passa da meia-noite", async () => {
    const resposta = await salvar({ ativo: true, periodos: SEMANA });
    assert.equal(resposta.statusCode, 200, resposta.body);
    const funcionamento = funcionamentoEmpresaSchema.parse(resposta.json());
    assert.equal(funcionamento.ativo, true);
    assert.deepEqual(funcionamento.periodos, SEMANA);
    assert.deepEqual(funcionamentoEmpresaSchema.parse((await ctx.api(dona, "GET", rota())).json()).periodos, SEMANA, "relido do banco");
  });

  it("editar substitui a semana (nada do que saiu fica para trás) e 00:00 como fechamento vira 24:00", async () => {
    const nova = [{ diaSemana: 3, inicio: "10:00", fim: "00:00" }];
    assert.deepEqual(funcionamentoEmpresaSchema.parse((await salvar({ ativo: true, periodos: nova })).json()).periodos, [{ diaSemana: 3, inicio: "10:00", fim: "24:00" }]);
    assert.equal((await ctx.banco.select().from(periodosFuncionamentoEmpresa).where(eq(periodosFuncionamentoEmpresa.empresaId, empresaId))).length, 1);
    assert.equal((await salvar({ ativo: true, periodos: SEMANA })).statusCode, 200);
  });

  it("recusa sobreposição (inclusive com o dia seguinte), formato inválido e campo ausente — e nada muda", async () => {
    const invalidos = [
      { ativo: true, periodos: [{ diaSemana: 1, inicio: "08:00", fim: "14:00" }, { diaSemana: 1, inicio: "13:00", fim: "18:00" }] },
      { ativo: true, periodos: [{ diaSemana: 6, inicio: "18:00", fim: "02:00" }, { diaSemana: 7, inicio: "01:00", fim: "09:00" }] },
      { ativo: true, periodos: [{ diaSemana: 1, inicio: "8h", fim: "14:00" }] },
      { ativo: true, periodos: [{ diaSemana: 9, inicio: "08:00", fim: "14:00" }] },
      { ativo: true, periodos: [{ diaSemana: 1, inicio: "08:00", fim: "08:00" }] },
      { periodos: SEMANA },
    ];
    for (const corpo of invalidos) {
      const resposta = await salvar(corpo);
      assert.equal(resposta.statusCode, 400, JSON.stringify(corpo));
      assert.equal(resposta.json().codigo, "DADOS_INVALIDOS");
    }
    assert.deepEqual(funcionamentoEmpresaSchema.parse((await ctx.api(dona, "GET", rota())).json()).periodos, SEMANA);
  });

  it("só quem opera a empresa lê ou altera: outra conta, o cliente e visitante recebem 404/401", async () => {
    for (const quem of [estranha, cliente]) {
      assert.equal((await ctx.api(quem, "GET", rota())).statusCode, 404);
      const tentativa = await salvar({ ativo: false, periodos: [] }, quem);
      assert.equal(tentativa.statusCode, 404);
      assert.equal(tentativa.json().codigo, "EMPRESA_NAO_ENCONTRADA");
    }
    assert.equal((await salvar({ ativo: false, periodos: [] }, null)).statusCode, 401);
    assert.equal(funcionamentoEmpresaSchema.parse((await ctx.api(dona, "GET", rota())).json()).ativo, true, "ninguém de fora desligou");
  });

  it("fuso e empresa vêm do servidor: campos a mais no corpo são ignorados", async () => {
    const resposta = await salvar({ ativo: true, periodos: SEMANA, fusoHorario: "Asia/Tokyo", empresaId: randomUUID() });
    assert.equal(resposta.statusCode, 200);
    assert.equal(funcionamentoEmpresaSchema.parse(resposta.json()).fusoHorario, "America/Sao_Paulo");
  });
});

describe("aberta ou fechada: a mesma regra no cardápio e no pedido", () => {
  it("segunda no período: aberta até 14:00, e o pedido é criado", async () => {
    assert.equal((await estadoEm(emSP(SEGUNDA, "10:00"))).resumo, "Aberto agora · até 14:00");
    assert.equal((await pedirEm(emSP(SEGUNDA, "10:00"))).tipo, "criado");
  });

  it("antes de abrir, no intervalo e depois de fechar: recusa, com a próxima abertura na mensagem", async () => {
    const casos: Array<[Date, string]> = [
      [emSP(SEGUNDA, "06:00"), "Esta empresa está fechada agora. Abre hoje às 08:00."],
      [emSP(SEGUNDA, "15:30"), "Esta empresa está fechada agora. Abre novamente hoje às 18:00."],
      [emSP(SEGUNDA, "23:30"), "Esta empresa está fechada agora. Abre amanhã às 08:00."],
      [emSP(QUARTA, "12:00"), "Esta empresa está fechada agora. Abre sábado às 18:00."],
      [emSP(DOMINGO, "12:00"), "Esta empresa está fechada agora. Abre amanhã às 08:00."],
    ];
    const antes = await totalDePedidos();
    for (const [instante, mensagem] of casos) {
      assert.equal((await estadoEm(instante)).aviso, mensagem);
      assert.deepEqual(await pedirEm(instante), { tipo: "empresa-fechada", mensagem });
    }
    assert.equal(await totalDePedidos(), antes, "nenhum pedido foi criado");
  });

  it("período que passa da meia-noite: sábado 23:30 e domingo 01:30 aceitam; domingo 02:00 já não", async () => {
    assert.equal((await pedirEm(emSP(SABADO, "23:30"))).tipo, "criado");
    assert.equal((await estadoEm(emSP(DOMINGO, "01:30"))).resumo, "Aberto agora · até 02:00");
    assert.equal((await pedirEm(emSP(DOMINGO, "01:30"))).tipo, "criado");
    assert.equal((await pedirEm(emSP(DOMINGO, "02:00"))).tipo, "empresa-fechada");
  });

  it("o fuso é o da EMPRESA: o mesmo instante abre em Manaus e fecha em São Paulo", async () => {
    const instante = new Date("2026-10-06T17:30:00Z"); // terça 14:30 em São Paulo, 13:30 em Manaus
    await salvar({ ativo: true, periodos: [{ diaSemana: 2, inicio: "08:00", fim: "14:00" }] });
    assert.equal((await pedirEm(instante)).tipo, "empresa-fechada");
    await ctx.banco.update(empresas).set({ fusoHorario: "America/Manaus" }).where(eq(empresas.id, empresaId));
    assert.equal((await estadoEm(instante)).resumo, "Aberto agora · até 14:00");
    assert.equal((await pedirEm(instante)).tipo, "criado");
    await ctx.banco.update(empresas).set({ fusoHorario: "America/Sao_Paulo" }).where(eq(empresas.id, empresaId));
    await salvar({ ativo: true, periodos: SEMANA });
  });

  it("carrinho montado com a empresa aberta e confirmado depois que fechou: recusado, e o retry do que JÁ virou pedido continua devolvendo o pedido", async () => {
    // O "carrinho" é só o que o cliente manda na confirmação: o que decide é o instante da confirmação.
    const tentativa = randomUUID();
    assert.equal((await pedirEm(emSP(SEGUNDA, "14:05"), [], tentativa)).tipo, "empresa-fechada");
    // A mesma tentativa, quando a empresa reabre, cria o pedido normalmente (nada ficou "queimado").
    const criado = await pedirEm(emSP(SEGUNDA, "18:10"), [], tentativa);
    assert.equal(criado.tipo, "criado");
    // A rede caiu depois do commit e o cliente repete com a empresa já fechada: devolve o MESMO pedido.
    const repetido = await pedirEm(emSP(SEGUNDA, "23:40"), [], tentativa);
    assert.equal(repetido.tipo, "ja-existente");
    if (criado.tipo === "criado" && repetido.tipo === "ja-existente") assert.equal(repetido.pedido.pedido.id, criado.pedido.pedido.id);
  });
});

describe("bloqueio real pela API (chamada manual, sem interface)", () => {
  it("fechada: POST /pedidos responde 409 EMPRESA_FECHADA e nada é gravado", async () => {
    // Controle ligado sem período nenhum = fechada em qualquer instante (vale com o relógio real).
    assert.equal((await salvar({ ativo: true, periodos: [] })).statusCode, 200);
    const antes = await totalDePedidos();
    const resposta = await ctx.api(cliente, "POST", "/pedidos", corpoDoPedido());
    assert.equal(resposta.statusCode, 409, resposta.body);
    assert.equal(resposta.json().codigo, "EMPRESA_FECHADA");
    assert.match(resposta.json().mensagem, /fechada agora/);
    assert.equal(await totalDePedidos(), antes);
  });

  it("fechada: cardápio, produto e a consulta leve dizem FECHADO — e continuam mostrando os produtos", async () => {
    const catalogo = catalogoPublicoSchema.parse((await ctx.api(null, "GET", `/publico/empresas/${identidadeEmpresa}/catalogo`)).json());
    assert.equal(catalogo.produtos.length, 1, "fechada não esconde o cardápio");
    assert.equal(catalogo.funcionamento.estado.abertoAgora, false);
    assert.equal(catalogo.funcionamento.estado.resumo, "Fechado");
    const detalhe = produtoPublicoDetalheSchema.parse((await ctx.api(null, "GET", `/publico/empresas/${identidadeEmpresa}/catalogo/produtos/${prato}`)).json());
    assert.equal(detalhe.funcionamento.estado.abertoAgora, false);
    assert.equal(detalhe.grupos.length, 1);
    const leve = funcionamentoPublicoSchema.parse((await ctx.api(null, "GET", `/publico/empresas/${identidadeEmpresa}/funcionamento`)).json());
    assert.deepEqual(leve, catalogo.funcionamento, "a consulta leve é a MESMA informação do cardápio");
  });

  it("aberta 24 horas: o pedido passa e o cardápio diz 'Aberto agora · 24 horas' com a semana para consulta", async () => {
    assert.equal((await salvar({ ativo: true, periodos: SEMPRE_ABERTA })).statusCode, 200);
    const resposta = await ctx.api(cliente, "POST", "/pedidos", corpoDoPedido());
    assert.equal(resposta.statusCode, 201, resposta.body);
    const { funcionamento } = catalogoPublicoSchema.parse((await ctx.api(cliente, "GET", `/publico/empresas/${identidadeEmpresa}/catalogo`)).json());
    assert.equal(funcionamento.estado.resumo, "Aberto agora · 24 horas");
    assert.equal(funcionamento.semana.length, 7);
  });

  it("desligar o controle volta a aceitar a qualquer hora, sem apagar os períodos", async () => {
    await salvar({ ativo: true, periodos: SEMANA });
    assert.equal((await salvar({ ativo: false, periodos: SEMANA })).statusCode, 200);
    assert.equal((await pedirEm(emSP(QUARTA, "04:00"))).tipo, "criado");
    const funcionamento = funcionamentoEmpresaSchema.parse((await ctx.api(dona, "GET", rota())).json());
    assert.equal(funcionamento.periodos.length, SEMANA.length);
    assert.deepEqual(funcionamentoPublicoSchema.parse((await ctx.api(null, "GET", `/publico/empresas/${identidadeEmpresa}/funcionamento`)).json()).semana, [], "sem controle, o cliente não vê semana");
    await salvar({ ativo: true, periodos: SEMANA });
  });

  it("empresa inexistente: 404 na consulta pública", async () => {
    assert.equal((await ctx.api(null, "GET", `/publico/empresas/${randomUUID()}/funcionamento`)).statusCode, 404);
  });
});

describe("horário da empresa × programação semanal das opções: dois conceitos, funcionando juntos", () => {
  const acompanhamentosEm = async (instante: Date) => {
    const resultado = await consultarProdutoDoCatalogo(ctx.banco, identidadeEmpresa, prato, instante);
    if (resultado.tipo !== "produto") throw new Error("produto não encontrado");
    return { nomes: serializarGruposPublicos(resultado.grupos)[0]?.opcoes.map((item) => item.nome), aberto: resultado.funcionamento.estado.abertoAgora };
  };

  before(async () => {
    await definirProgramacaoSemanalDoGrupo(ctx.banco, empresaId, grupoGuarnicoes, true);
    await definirOpcoesDoDia(ctx.banco, empresaId, grupoGuarnicoes, SEGUNDA, [opcao.Arroz!, opcao.Feijão!]);
    await definirOpcoesDoDia(ctx.banco, empresaId, grupoGuarnicoes, TERCA, [opcao.Arroz!, opcao.Salada!]);
  });

  it("as opções do dia continuam valendo com a empresa aberta OU fechada", async () => {
    assert.deepEqual(await acompanhamentosEm(emSP(TERCA, "15:00")), { nomes: ["Arroz", "Salada"], aberto: true });
    // Terça 23:30: fechada, mas as opções de terça continuam sendo as de terça.
    assert.deepEqual(await acompanhamentosEm(emSP(TERCA, "23:30")), { nomes: ["Arroz", "Salada"], aberto: false });
    assert.deepEqual(await acompanhamentosEm(emSP(SEGUNDA, "15:30")), { nomes: ["Arroz", "Feijão"], aberto: false });
  });

  it("aberta: vale a opção do dia (a de outro dia é recusada como sempre)", async () => {
    assert.equal((await pedirEm(emSP(TERCA, "15:00"), [opcao.Salada!])).tipo, "criado");
    assert.equal((await pedirEm(emSP(TERCA, "15:00"), [opcao.Feijão!])).tipo, "escolhas-invalidas");
  });

  it("fechada: mesmo com opção válida do dia, o pedido não é criado", async () => {
    assert.equal((await pedirEm(emSP(TERCA, "23:30"), [opcao.Salada!])).tipo, "empresa-fechada");
  });

  it("o cardápio completo traz o funcionamento junto, sem mudar o que já existia", async () => {
    const resultado = await consultarCatalogo(ctx.banco, identidadeEmpresa, emSP(SEGUNDA, "10:00"));
    assert.equal(resultado.tipo, "catalogo");
    if (resultado.tipo !== "catalogo") return;
    assert.equal(resultado.funcionamento.hoje, 1);
    assert.equal(resultado.funcionamento.estado.resumo, "Aberto agora · até 14:00");
    assert.equal(resultado.funcionamento.semana.length, SEMANA.length);
    assert.ok(resultado.personalizaveis.has(prato));
  });
});
