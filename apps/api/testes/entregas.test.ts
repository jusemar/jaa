import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { atribuicoesEntrega } from "@jaa/banco/schema";
import {
  EVENTO_ENTREGA_ATUALIZADA,
  EVENTO_ENTREGADOR_DISPONIBILIDADE,
  EVENTO_VINCULO_ENTREGADOR,
  type Empresa,
  type EntregaAtribuida,
  type EntregaDoPedido,
  type EntregadorDaEmpresa,
  type EventoEntregaAtualizada,
  type EventoEntregadorDisponibilidade,
  type EventoVinculoEntregador,
  type ListaVinculosEntregador,
  type ListaConvitesEntregador,
  type ListaEntregadores,
  type ListaEntregas,
  type Pedido,
  type Produto,
  type StatusPedido,
} from "@jaa/contratos";
import { eq } from "drizzle-orm";
import { aguardarAte, coletar, como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL dos ENTREGADORES: vínculo por empresa, convite/aceite, atribuição, reatribuição com
 * revogação imediata, acesso restrito às próprias entregas e isolamento entre empresas.
 * A = dona da Pizzaria; B = cliente; P = Paulo (entregador); C = Carlos (entregador/terceiro).
 */

const PREFIXO = `ent${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987651901", "+5531987651902", "+5531987651903", "+5531987651904", "+5531987651905"],
  prefixoIp: "198.18.14.",
});

let A: Pessoa;
let B: Pessoa;
let P: Pessoa;
let C: Pessoa;
let R: Pessoa;
let pizzaria: Empresa;
let farmacia: Empresa;
let padaria: Empresa;
let pizza: Produto;
let dipirona: Produto;
let conversaBP = "";
let conversaBF = "";
let enderecoB = "";
let paulo = "";
let carlos = "";

// Disponibilidade é decisão do próprio entregador (e some quando a empresa desativa o vínculo).
const ficarDisponivel = (pessoa: Pessoa, entregadorId: string, disponivel = true) =>
  ctx.api(pessoa, "PATCH", `/entregas/vinculos/${entregadorId}`, { disponivel });

const atribuir = (pessoa: Pessoa, empresa: Empresa, pedidoId: string, corpo: Record<string, unknown>) =>
  ctx.api(pessoa, "POST", `/empresas/${empresa.id}/pedidos/${pedidoId}/entrega`, corpo);
const avancar = (pedidoId: string, statusAtual: StatusPedido, empresa: Empresa = pizzaria) =>
  ctx.api(A, "POST", `/empresas/${empresa.id}/pedidos/${pedidoId}/avancar`, { statusAtual });

async function criarPedido(empresa = pizzaria, produto = pizza, conversaId = conversaBP): Promise<Pedido> {
  const resposta = await ctx.api(B, "POST", "/pedidos", {
    idCliente: randomUUID(),
    empresaIdentidadeId: empresa.identidadeId,
    conversaId,
    enderecoId: enderecoB,
    itens: [{ produtoId: produto.id, quantidade: 2 }],
    pagamento: { forma: "dinheiro", trocoParaCentavos: 10000 },
  });
  assert.equal(resposta.statusCode, 201, resposta.body);
  return resposta.json();
}

// Pedido levado até "pronto" (ponto em que a empresa escolhe quem vai entregar).
async function pedidoPronto(empresa = pizzaria, produto = pizza, conversaId = conversaBP): Promise<Pedido> {
  let pedido = await criarPedido(empresa, produto, conversaId);
  for (const status of ["recebido", "confirmado", "em_preparacao"] as const) {
    const resposta = await avancar(pedido.id, status, empresa);
    assert.equal(resposta.statusCode, 200, resposta.body);
    pedido = resposta.json();
  }
  assert.equal(pedido.status, "pronto");
  return pedido;
}

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Junior Rocha");
  B = await ctx.criarPessoa(1, `${PREFIXO}_b`, "Bruna Cliente");
  P = await ctx.criarPessoa(2, `${PREFIXO}_p`, "Paulo Entregador");
  C = await ctx.criarPessoa(3, `${PREFIXO}_c`, "Carlos Entregador");
  R = await ctx.criarPessoa(4, `${PREFIXO}_r`, "Rita Estranha");
  pizzaria = (await ctx.api(A, "POST", "/empresas", { nome: "Pizzaria BH", nomeUsuario: `${PREFIXO}_pizza`, slug: `${PREFIXO}-pizzaria` })).json();
  farmacia = (await ctx.api(A, "POST", "/empresas", { nome: "Farmácia Central", nomeUsuario: `${PREFIXO}_farma`, slug: `${PREFIXO}-farmacia` })).json();
  pizza = (await ctx.api(A, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza Calabresa", precoCentavos: 3990 })).json();
  padaria = (await ctx.api(A, "POST", "/empresas", { nome: "Padaria Central", nomeUsuario: `${PREFIXO}_pada`, slug: `${PREFIXO}-padaria` })).json();
  dipirona = (await ctx.api(A, "POST", `/empresas/${farmacia.id}/produtos`, { nome: "Dipirona", precoCentavos: 890 })).json();
  conversaBP = await ctx.abrirConversa(B, `${PREFIXO}_pizza`);
  conversaBF = await ctx.abrirConversa(B, `${PREFIXO}_farma`);
  enderecoB = await ctx.criarEnderecoConfirmado(B);
  paulo = await ctx.criarEntregadorAtivo(A, pizzaria.id, P, `${PREFIXO}_p`);
  carlos = await ctx.criarEntregadorAtivo(A, pizzaria.id, C, `${PREFIXO}_c`);
});

after(() => ctx.encerrar());

describe("quadro de entregadores", () => {
  it("convite nasce pendente, a pessoa aceita e o vínculo fica ativo", async () => {
    const convite = await ctx.api(A, "POST", `/empresas/${farmacia.id}/entregadores`, { nomeUsuario: `${PREFIXO}_p` });
    assert.equal(convite.statusCode, 201, convite.body);
    const entregador: EntregadorDaEmpresa = convite.json();
    assert.equal(entregador.status, "convidado");
    assert.equal(entregador.pessoa.nomeExibicao, "Paulo Entregador");
    // Só identidade pública: nada de telefone, conta ou e-mail.
    assert.deepEqual(Object.keys(entregador.pessoa).sort(), ["identidadeId", "nomeExibicao", "nomeUsuario", "tipo"]);
    assert.equal(JSON.stringify(entregador).includes("+55"), false);

    const pendentes: ListaConvitesEntregador = (await ctx.api(P, "GET", "/entregas/convites")).json();
    assert.ok(pendentes.convites.some((pendente) => pendente.id === entregador.id && pendente.empresa.nome === "Farmácia Central"));

    assert.equal((await ctx.api(P, "POST", `/entregas/convites/${entregador.id}`, { resposta: "aceitar" })).statusCode, 200);
    const lista: ListaEntregadores = (await ctx.api(A, "GET", `/empresas/${farmacia.id}/entregadores`)).json();
    assert.equal(lista.entregadores.find((item) => item.id === entregador.id)?.status, "ativo");
    // A mesma pessoa entrega para duas empresas: o vínculo é por empresa.
    const naPizzaria: ListaEntregadores = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/entregadores`)).json();
    assert.ok(naPizzaria.entregadores.some((item) => item.pessoa.nomeUsuario === `${PREFIXO}_p`));
  });

  it("o convite chega em TEMPO REAL para quem foi convidado (sem recarregar a página)", async () => {
    // Regressão real: o convite era gravado e ninguém avisava o destinatário conectado.
    const eventos = coletar<EventoVinculoEntregador>(await ctx.conectar(P), EVENTO_VINCULO_ENTREGADOR);

    const convite = await ctx.api(A, "POST", `/empresas/${padaria.id}/entregadores`, { nomeUsuario: `${PREFIXO}_p` });
    assert.equal(convite.statusCode, 201, convite.body);
    const entregador: EntregadorDaEmpresa = convite.json();

    await aguardarAte(() => eventos.some((evento) => evento.convite?.id === entregador.id));
    const recebido = eventos.find((evento) => evento.convite?.id === entregador.id);
    assert.equal(recebido?.convite?.empresa.nome, "Padaria Central");
    assert.equal(recebido?.vinculo, null, "enquanto é convite pendente ainda não há vínculo");

    // Responder também atualiza na hora: o convite sai da lista e o vínculo entra.
    assert.equal((await ctx.api(P, "POST", `/entregas/convites/${entregador.id}`, { resposta: "aceitar" })).statusCode, 200);
    await aguardarAte(() => eventos.some((evento) => evento.vinculo?.id === entregador.id));
    const aposAceite = eventos.filter((evento) => evento.vinculo?.id === entregador.id).at(-1);
    assert.equal(aposAceite?.convite, null);
    assert.equal(aposAceite?.vinculo?.status, "ativo");
    assert.equal(aposAceite?.vinculo?.disponivel, false, "aceitar o vínculo NÃO deixa a pessoa disponível");
  });

  it("convite só é aceito pela própria pessoa e @usuario inexistente é recusado", async () => {
    const convite = await ctx.api(A, "POST", `/empresas/${pizzaria.id}/entregadores`, { nomeUsuario: `${PREFIXO}_r` });
    assert.equal(convite.statusCode, 201);
    const conviteId: string = convite.json().id;

    assert.equal((await ctx.api(C, "POST", `/entregas/convites/${conviteId}`, { resposta: "aceitar" })).statusCode, 404, "ninguém aceita convite alheio");
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/entregadores`, { nomeUsuario: "ninguem_existe_aqui" })).statusCode, 404);
    // Quem opera a empresa não vira entregador dela.
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/entregadores`, { nomeUsuario: `${PREFIXO}_a` })).statusCode, 409);

    assert.equal((await ctx.api(R, "POST", `/entregas/convites/${conviteId}`, { resposta: "recusar" })).statusCode, 200);
    const lista: ListaEntregadores = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/entregadores`)).json();
    assert.equal(lista.entregadores.find((item) => item.id === conviteId)?.status, "inativo");
  });

  it("entregador não é administrador: nenhuma rota da empresa responde para ele", async () => {
    for (const caminho of [`/empresas/${pizzaria.id}/entregadores`, `/empresas/${pizzaria.id}/produtos`, `/empresas/${pizzaria.id}/pedidos`, `/empresas/${pizzaria.id}`]) {
      assert.equal((await ctx.api(P, "GET", caminho)).statusCode, 404, caminho);
    }
    assert.equal((await ctx.api(P, "POST", `/empresas/${pizzaria.id}/produtos`, { nome: "Pizza pirata", precoCentavos: 100 })).statusCode, 404);
    // Nem agindo como a identidade da empresa.
    assert.equal((await ctx.api(como(P, pizzaria.identidadeId), "GET", "/conversas")).statusCode, 403);
    // E a agenda de endereços do cliente continua privada.
    assert.equal((await ctx.api(P, "GET", "/enderecos")).statusCode, 200, "só a dele, que está vazia");
    assert.deepEqual((await ctx.api(P, "GET", "/enderecos")).json().enderecos, []);
  });
});

describe("atribuição", () => {
  it("só atribui quando o pedido está pronto (ou já em entrega)", async () => {
    const pedido = await criarPedido();
    assert.equal((await atribuir(A, pizzaria, pedido.id, { entregadorId: paulo })).statusCode, 409, "recebido não atribui");

    const confirmado = (await avancar(pedido.id, "recebido")).json();
    assert.equal((await atribuir(A, pizzaria, confirmado.id, { entregadorId: paulo })).statusCode, 409, "confirmado não atribui");
    const emPreparacao = (await avancar(pedido.id, "confirmado")).json();
    assert.equal((await atribuir(A, pizzaria, emPreparacao.id, { entregadorId: paulo })).statusCode, 409, "em preparação não atribui");

    assert.equal((await avancar(pedido.id, "em_preparacao")).statusCode, 200);
    const atribuicao = await atribuir(A, pizzaria, pedido.id, { entregadorId: paulo });
    assert.equal(atribuicao.statusCode, 200, atribuicao.body);
    const entrega: EntregaDoPedido = atribuicao.json();
    assert.equal(entrega.entregadorAtual?.pessoa.nomeExibicao, "Paulo Entregador");
    assert.equal(entrega.historico.length, 1);
  });

  it("sem entregador o pedido não sai para entrega (regra do servidor)", async () => {
    const pedido = await pedidoPronto();
    const semEntregador = await avancar(pedido.id, "pronto");
    assert.equal(semEntregador.statusCode, 409);
    assert.equal(semEntregador.json().codigo, "ENTREGADOR_NAO_ATRIBUIDO");
    assert.equal((await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedido.id}`)).json().status, "pronto");

    assert.equal((await atribuir(A, pizzaria, pedido.id, { entregadorId: paulo })).statusCode, 200);
    assert.equal((await avancar(pedido.id, "pronto")).statusCode, 200, "com entregador, sai para entrega");
  });

  it("entregador inativo e de outra empresa são recusados", async () => {
    const pedido = await pedidoPronto();
    const naFarmacia: ListaEntregadores = (await ctx.api(A, "GET", `/empresas/${farmacia.id}/entregadores`)).json();
    const idNaFarmacia = naFarmacia.entregadores[0]?.id ?? "";

    assert.equal((await atribuir(A, pizzaria, pedido.id, { entregadorId: idNaFarmacia })).statusCode, 404, "vínculo de outra empresa");
    assert.equal((await atribuir(A, pizzaria, pedido.id, { entregadorId: randomUUID() })).statusCode, 404);

    assert.equal((await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/entregadores/${carlos}`, { status: "inativo" })).statusCode, 200);
    const inativo = await atribuir(A, pizzaria, pedido.id, { entregadorId: carlos });
    assert.equal(inativo.statusCode, 409);
    assert.equal(inativo.json().codigo, "ENTREGADOR_INATIVO");
    assert.equal((await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/entregadores/${carlos}`, { status: "ativo" })).statusCode, 200);
    // Reativar o vínculo não devolve a disponibilidade: ela é escolha dele.
    assert.equal((await ficarDisponivel(C, carlos)).statusCode, 200);
  });

  it("atribuição concorrente resolve para UM entregador atual, com histórico coerente", async () => {
    const pedido = await pedidoPronto();

    const [primeira, segunda] = await Promise.all([
      atribuir(A, pizzaria, pedido.id, { entregadorId: paulo, entregadorAtualId: null }),
      atribuir(A, pizzaria, pedido.id, { entregadorId: carlos, entregadorAtualId: null }),
    ]);
    assert.deepEqual([primeira.statusCode, segunda.statusCode].sort(), [200, 409]);

    const atuais = await ctx.banco.select().from(atribuicoesEntrega).where(eq(atribuicoesEntrega.pedidoId, pedido.id));
    assert.equal(atuais.filter((linha) => linha.encerradoEm === null).length, 1, "nunca dois entregadores atuais");
  });
});

describe("reatribuição e revogação", () => {
  it("trocar de entregador move o acesso e preserva o histórico", async () => {
    const pedido = await pedidoPronto();
    assert.equal((await atribuir(A, pizzaria, pedido.id, { entregadorId: paulo })).statusCode, 200);
    assert.equal((await ctx.api(P, "GET", `/entregas/${pedido.id}`)).statusCode, 200);

    const troca = await atribuir(A, pizzaria, pedido.id, { entregadorId: carlos, entregadorAtualId: paulo });
    assert.equal(troca.statusCode, 200, troca.body);
    const entrega: EntregaDoPedido = troca.json();

    assert.equal(entrega.entregadorAtual?.pessoa.nomeExibicao, "Carlos Entregador");
    assert.deepEqual(entrega.historico.map((evento) => evento.entregador.nomeExibicao), ["Paulo Entregador", "Carlos Entregador"]);
    assert.ok(entrega.historico[0]?.encerradoEm, "a atribuição de Paulo foi encerrada, não apagada");
    // Acesso segue a atribuição ATUAL: quem perdeu o pedido perde o acesso na hora.
    assert.equal((await ctx.api(P, "GET", `/entregas/${pedido.id}`)).statusCode, 404);
    assert.equal((await ctx.api(C, "GET", `/entregas/${pedido.id}`)).statusCode, 200);
  });

  it("reatribuir funciona também com o pedido já em rota", async () => {
    const pedido = await pedidoPronto();
    assert.equal((await atribuir(A, pizzaria, pedido.id, { entregadorId: paulo })).statusCode, 200);
    assert.equal((await avancar(pedido.id, "pronto")).statusCode, 200);
    assert.equal((await avancar(pedido.id, "saiu_para_entrega")).statusCode, 200);

    const troca = await atribuir(A, pizzaria, pedido.id, { entregadorId: carlos, entregadorAtualId: paulo });
    assert.equal(troca.statusCode, 200, "imprevisto na rua: a troca é possível e auditada");
    assert.equal((await ctx.api(P, "GET", `/entregas/${pedido.id}`)).statusCode, 404);
    assert.equal((await ctx.api(C, "GET", `/entregas/${pedido.id}`)).json().status, "em_rota");
  });

  it("desativar o vínculo revoga as entregas em aberto imediatamente", async () => {
    const pedido = await pedidoPronto();
    assert.equal((await atribuir(A, pizzaria, pedido.id, { entregadorId: carlos })).statusCode, 200);
    assert.equal((await ctx.api(C, "GET", `/entregas/${pedido.id}`)).statusCode, 200);

    assert.equal((await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/entregadores/${carlos}`, { status: "inativo" })).statusCode, 200);
    assert.equal((await ctx.api(C, "GET", `/entregas/${pedido.id}`)).statusCode, 404, "acesso acaba na hora");
    const lista: ListaEntregas = (await ctx.api(C, "GET", "/entregas")).json();
    assert.equal(lista.entregas.some((entrega) => entrega.pedidoId === pedido.id), false);
    // O pedido volta a não ter entregador: não sai para entrega sem alguém levando.
    assert.equal((await avancar(pedido.id, "pronto")).statusCode, 409);
    const historico: EntregaDoPedido = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/entrega`)).json();
    assert.equal(historico.entregadorAtual, null);
    assert.equal(historico.historico.at(-1)?.motivoEncerramento, "Entregador desativado");

    assert.equal((await ctx.api(A, "PATCH", `/empresas/${pizzaria.id}/entregadores/${carlos}`, { status: "ativo" })).statusCode, 200);
    assert.equal((await ficarDisponivel(C, carlos)).statusCode, 200);
  });
});

describe("área do entregador", () => {
  it("lista só as entregas atribuídas a ele agora, com o que precisa para entregar", async () => {
    const meu = await pedidoPronto();
    const doOutro = await pedidoPronto();
    assert.equal((await atribuir(A, pizzaria, meu.id, { entregadorId: paulo })).statusCode, 200);
    assert.equal((await atribuir(A, pizzaria, doOutro.id, { entregadorId: carlos })).statusCode, 200);

    const lista: ListaEntregas = (await ctx.api(P, "GET", "/entregas")).json();
    assert.ok(lista.entregas.some((entrega) => entrega.pedidoId === meu.id));
    assert.equal(lista.entregas.some((entrega) => entrega.pedidoId === doOutro.id), false, "entrega de outro entregador não aparece");

    const entrega: EntregaAtribuida = (await ctx.api(P, "GET", `/entregas/${meu.id}`)).json();
    assert.equal(entrega.empresa.nome, "Pizzaria BH");
    assert.equal(entrega.destino.logradouro, "Rua das Flores");
    assert.equal(entrega.destino.numero, "150");
    // Ponto SNAPSHOT confirmado pelo cliente: o entregador não geocodifica de novo.
    assert.equal(entrega.destino.latitude, -19.919125);
    assert.equal(entrega.cliente.nomeExibicao, "Bruna Cliente");
    assert.equal(entrega.formaPagamentoNaEntrega, "dinheiro");
    assert.equal(entrega.trocoParaCentavos, 10000);
    assert.equal(entrega.itens[0]?.quantidade, 2);

    // Privacidade do cliente: nada de telefone, conta, outros endereços ou preço unitário.
    const bruto = JSON.stringify(entrega);
    assert.equal(bruto.includes("+55"), false);
    assert.equal(bruto.includes("precoUnitarioCentavos"), false);
    assert.equal("enderecos" in entrega, false);
  });

  it("um entregador pode ter várias entregas ativas ao mesmo tempo", async () => {
    const primeiro = await pedidoPronto();
    const segundo = await pedidoPronto();
    for (const pedido of [primeiro, segundo]) assert.equal((await atribuir(A, pizzaria, pedido.id, { entregadorId: paulo })).statusCode, 200);

    const lista: ListaEntregas = (await ctx.api(P, "GET", "/entregas")).json();
    for (const pedido of [primeiro, segundo]) assert.ok(lista.entregas.some((entrega) => entrega.pedidoId === pedido.id), pedido.id);
  });

  it("entregue e cancelado saem da lista ativa, mas o histórico permanece", async () => {
    const entregue = await pedidoPronto();
    assert.equal((await atribuir(A, pizzaria, entregue.id, { entregadorId: paulo })).statusCode, 200);
    for (const status of ["pronto", "saiu_para_entrega", "em_rota"] as const) assert.equal((await avancar(entregue.id, status)).statusCode, 200);

    const cancelado = await pedidoPronto();
    assert.equal((await atribuir(A, pizzaria, cancelado.id, { entregadorId: paulo })).statusCode, 200);
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${cancelado.id}/cancelar`, { statusAtual: "pronto", motivo: "Loja fechou" })).statusCode, 200);

    const lista: ListaEntregas = (await ctx.api(P, "GET", "/entregas")).json();
    for (const pedido of [entregue, cancelado]) assert.equal(lista.entregas.some((entrega) => entrega.pedidoId === pedido.id), false, pedido.id);
    assert.equal((await ctx.api(P, "GET", `/entregas/${cancelado.id}`)).statusCode, 404);

    for (const pedido of [entregue, cancelado]) {
      const historico: EntregaDoPedido = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/entrega`)).json();
      assert.equal(historico.historico.at(-1)?.entregador.nomeExibicao, "Paulo Entregador", "auditoria preservada");
    }
  });

  it("empresas diferentes não se misturam, e estranhos não acessam nada", async () => {
    const naPizzaria = await pedidoPronto();
    assert.equal((await atribuir(A, pizzaria, naPizzaria.id, { entregadorId: paulo })).statusCode, 200);

    // Paulo também entrega para a Farmácia, mas só vê o que está atribuído A ELE lá.
    const naFarmacia = await pedidoPronto(farmacia, dipirona, conversaBF);
    assert.equal((await ctx.api(P, "GET", `/entregas/${naFarmacia.id}`)).statusCode, 404, "pedido de outra empresa sem atribuição");

    // Estranhos (cliente, terceiro e anônimo) não acessam entrega nenhuma.
    for (const pessoa of [B, R]) assert.equal((await ctx.api(pessoa, "GET", `/entregas/${naPizzaria.id}`)).statusCode, 404);
    assert.deepEqual((await ctx.api(R, "GET", "/entregas")).json().entregas, []);
    assert.equal((await ctx.api(null, "GET", "/entregas")).statusCode, 401);
    // Nem manipulando ids de empresa/pedido nas rotas administrativas.
    assert.equal((await atribuir(P, pizzaria, naPizzaria.id, { entregadorId: paulo })).statusCode, 404);
    assert.equal((await atribuir(R, pizzaria, naPizzaria.id, { entregadorId: paulo })).statusCode, 404);
    assert.equal((await ctx.api(A, "GET", `/empresas/${farmacia.id}/pedidos/${naPizzaria.id}/entrega`)).statusCode, 404);
  });
});

describe("disponibilidade operacional", () => {
  it("vínculo aceito começa INDISPONÍVEL: ninguém recebe entrega sem escolher", async () => {
    const convite = await ctx.api(A, "POST", `/empresas/${farmacia.id}/entregadores`, { nomeUsuario: `${PREFIXO}_c` });
    assert.equal(convite.statusCode, 201);
    const vinculo: string = convite.json().id;
    assert.equal((await ctx.api(C, "POST", `/entregas/convites/${vinculo}`, { resposta: "aceitar" })).statusCode, 200);

    const lista: ListaEntregadores = (await ctx.api(A, "GET", `/empresas/${farmacia.id}/entregadores`)).json();
    const registro = lista.entregadores.find((item) => item.id === vinculo);
    assert.equal(registro?.status, "ativo", "o vínculo profissional existe");
    assert.equal(registro?.disponivel, false, "mas ele ainda não está aceitando entregas");

    assert.equal((await ficarDisponivel(C, vinculo)).statusCode, 200);
    const depois: ListaEntregadores = (await ctx.api(A, "GET", `/empresas/${farmacia.id}/entregadores`)).json();
    assert.equal(depois.entregadores.find((item) => item.id === vinculo)?.disponivel, true);
    // Volta a ficar indisponível quando quiser.
    assert.equal((await ficarDisponivel(C, vinculo, false)).statusCode, 200);
    assert.equal((await ctx.api(C, "GET", "/entregas/vinculos")).json().vinculos.find((item: { id: string }) => item.id === vinculo).disponivel, false);
  });

  it("a disponibilidade é por empresa e pode valer em várias ao mesmo tempo", async () => {
    const naFarmacia = await ctx.criarEntregadorAtivo(A, farmacia.id, P, `${PREFIXO}_p`, false);
    assert.equal((await ficarDisponivel(P, paulo)).statusCode, 200, "disponível na Pizzaria");

    const vinculos: ListaVinculosEntregador = (await ctx.api(P, "GET", "/entregas/vinculos")).json();
    assert.equal(vinculos.vinculos.find((item) => item.id === paulo)?.disponivel, true);
    assert.equal(vinculos.vinculos.find((item) => item.id === naFarmacia)?.disponivel, false, "cada empresa tem a sua");

    // Pode ficar disponível nas duas ao mesmo tempo: o Jaa não escolhe por ele.
    assert.equal((await ficarDisponivel(P, naFarmacia)).statusCode, 200);
    const asDuas: ListaVinculosEntregador = (await ctx.api(P, "GET", "/entregas/vinculos")).json();
    assert.equal(asDuas.vinculos.filter((item) => item.disponivel).length >= 2, true);

    // E uma empresa não enxerga a disponibilidade dele na outra.
    const naPizzaria: ListaEntregadores = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/entregadores`)).json();
    assert.equal(naPizzaria.entregadores.some((item) => item.id === naFarmacia), false, "vínculo da Farmácia não aparece na Pizzaria");
    assert.equal((await ficarDisponivel(P, naFarmacia, false)).statusCode, 200);
  });

  it("só o próprio entregador muda a própria disponibilidade", async () => {
    // A empresa não tem rota para isso; nem o dono, nem outro entregador, nem um estranho.
    for (const pessoa of [A, C, R, B]) {
      assert.equal((await ficarDisponivel(pessoa, paulo)).statusCode, 404, "ninguém altera a disponibilidade de outro");
    }
    assert.equal((await ficarDisponivel(P, randomUUID())).statusCode, 404, "vínculo inexistente");
    assert.equal((await ctx.api(null, "PATCH", `/entregas/vinculos/${paulo}`, { disponivel: true })).statusCode, 401);
    // Paulo continua com a disponibilidade que ELE escolheu.
    const vinculos: ListaVinculosEntregador = (await ctx.api(P, "GET", "/entregas/vinculos")).json();
    assert.equal(vinculos.vinculos.find((item) => item.id === paulo)?.disponivel, true);
  });

  it("convite pendente e vínculo inativo não ficam disponíveis", async () => {
    const convite = await ctx.api(A, "POST", `/empresas/${farmacia.id}/entregadores`, { nomeUsuario: `${PREFIXO}_r` });
    const pendente: string = convite.json().id;
    assert.equal((await ficarDisponivel(R, pendente)).statusCode, 404, "convite pendente não escolhe disponibilidade");

    assert.equal((await ctx.api(R, "POST", `/entregas/convites/${pendente}`, { resposta: "aceitar" })).statusCode, 200);
    assert.equal((await ficarDisponivel(R, pendente)).statusCode, 200);
    // Desativar o vínculo derruba a disponibilidade e impede escolher de novo.
    assert.equal((await ctx.api(A, "PATCH", `/empresas/${farmacia.id}/entregadores/${pendente}`, { status: "inativo" })).statusCode, 200);
    const lista: ListaEntregadores = (await ctx.api(A, "GET", `/empresas/${farmacia.id}/entregadores`)).json();
    assert.equal(lista.entregadores.find((item) => item.id === pendente)?.disponivel, false);
    assert.equal((await ficarDisponivel(R, pendente)).statusCode, 404);
  });

  it("indisponível não recebe NOVA atribuição nem reatribuição, mas mantém o que já é dele", async () => {
    const jaAtribuido = await pedidoPronto();
    assert.equal((await atribuir(A, pizzaria, jaAtribuido.id, { entregadorId: paulo })).statusCode, 200);

    // Paulo decide parar de aceitar novas entregas da Pizzaria.
    assert.equal((await ficarDisponivel(P, paulo, false)).statusCode, 200);

    // O pedido que já era dele continua dele: nada é cancelado, devolvido nem escondido.
    assert.equal((await ctx.api(P, "GET", `/entregas/${jaAtribuido.id}`)).statusCode, 200);
    const minhas: ListaEntregas = (await ctx.api(P, "GET", "/entregas")).json();
    assert.ok(minhas.entregas.some((entrega) => entrega.pedidoId === jaAtribuido.id));
    assert.equal((await avancar(jaAtribuido.id, "pronto")).statusCode, 200, "a entrega dele segue normalmente");

    // Mas não recebe nada novo.
    const novo = await pedidoPronto();
    const recusa = await atribuir(A, pizzaria, novo.id, { entregadorId: paulo });
    assert.equal(recusa.statusCode, 409);
    assert.equal(recusa.json().codigo, "ENTREGADOR_INDISPONIVEL");
    assert.equal((await ctx.api(P, "GET", `/entregas/${novo.id}`)).statusCode, 404);

    // Nem por reatribuição: Carlos (disponível) fica com ele, e Paulo indisponível não pode receber de volta.
    assert.equal((await atribuir(A, pizzaria, novo.id, { entregadorId: carlos })).statusCode, 200);
    assert.equal((await atribuir(A, pizzaria, novo.id, { entregadorId: paulo, entregadorAtualId: carlos })).statusCode, 409);
    const entrega: EntregaDoPedido = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${novo.id}/entrega`)).json();
    assert.equal(entrega.entregadorAtual?.id, carlos, "a falha não tirou o entregador atual");

    assert.equal((await ficarDisponivel(P, paulo)).statusCode, 200);
  });

  it("tela velha do gestor não burla: vale o estado ATUAL no momento da operação", async () => {
    const pedido = await pedidoPronto();
    // O gestor carregou a lista com Carlos disponível…
    const listaAntiga: ListaEntregadores = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/entregadores`)).json();
    assert.equal(listaAntiga.entregadores.find((item) => item.id === carlos)?.disponivel, true);

    // …mas Carlos ficou indisponível antes de o gestor confirmar.
    assert.equal((await ficarDisponivel(C, carlos, false)).statusCode, 200);
    assert.equal((await atribuir(A, pizzaria, pedido.id, { entregadorId: carlos })).statusCode, 409);
    const entrega: EntregaDoPedido = (await ctx.api(A, "GET", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/entrega`)).json();
    assert.equal(entrega.entregadorAtual, null, "nada foi atribuído");

    assert.equal((await ficarDisponivel(C, carlos)).statusCode, 200);
  });

  it("a empresa do vínculo recebe a mudança em tempo real; outra empresa não", async () => {
    const naFarmacia = await ctx.criarEntregadorAtivo(A, farmacia.id, P, `${PREFIXO}_p`, false);
    const [socketPizzaria, socketFarmacia] = await Promise.all([ctx.conectar(como(A, pizzaria.identidadeId)), ctx.conectar(como(A, farmacia.identidadeId))]);
    const naPizzaria = coletar<EventoEntregadorDisponibilidade>(socketPizzaria, EVENTO_ENTREGADOR_DISPONIBILIDADE);
    const daFarmacia = coletar<EventoEntregadorDisponibilidade>(socketFarmacia, EVENTO_ENTREGADOR_DISPONIBILIDADE);

    assert.equal((await ficarDisponivel(P, naFarmacia)).statusCode, 200);
    await aguardarAte(() => daFarmacia.length === 1);
    assert.equal(daFarmacia[0]?.entregador.disponivel, true);
    assert.equal(daFarmacia[0]?.entregador.pessoa.nomeExibicao, "Paulo Entregador");
    assert.equal(naPizzaria.length, 0, "a Pizzaria não descobre a disponibilidade dele na Farmácia");

    assert.equal((await ficarDisponivel(P, paulo, false)).statusCode, 200);
    await aguardarAte(() => naPizzaria.length === 1);
    assert.equal(naPizzaria[0]?.entregador.disponivel, false);
    assert.equal(daFarmacia.length, 1, "e a Farmácia não é avisada do que aconteceu na Pizzaria");

    assert.equal((await ficarDisponivel(P, paulo)).statusCode, 200);
    assert.equal((await ficarDisponivel(P, naFarmacia, false)).statusCode, 200);
  });
});

describe("realtime das entregas", () => {
  it("o entregador recebe a atribuição, as mudanças e a perda do pedido; ninguém mais recebe", async () => {
    const pedido = await pedidoPronto();
    const [socketPaulo, socketCarlos, socketCliente] = await Promise.all([ctx.conectar(P), ctx.conectar(C), ctx.conectar(B)]);
    const dePaulo = coletar<EventoEntregaAtualizada>(socketPaulo, EVENTO_ENTREGA_ATUALIZADA);
    const deCarlos = coletar<EventoEntregaAtualizada>(socketCarlos, EVENTO_ENTREGA_ATUALIZADA);
    const doCliente = coletar<EventoEntregaAtualizada>(socketCliente, EVENTO_ENTREGA_ATUALIZADA);

    assert.equal((await atribuir(A, pizzaria, pedido.id, { entregadorId: paulo })).statusCode, 200);
    await aguardarAte(() => dePaulo.length === 1);
    assert.equal(dePaulo[0]?.entrega?.pedidoId, pedido.id);
    assert.equal(dePaulo[0]?.entrega?.status, "pronto");
    assert.equal(doCliente.length, 0, "cliente não recebe eventos de entrega");

    // Mudança de status atualiza a entrega dele.
    assert.equal((await avancar(pedido.id, "pronto")).statusCode, 200);
    await aguardarAte(() => dePaulo.length === 2);
    assert.equal(dePaulo[1]?.entrega?.status, "saiu_para_entrega");

    // Reatribuição: sai da lista de Paulo e entra na de Carlos.
    assert.equal((await atribuir(A, pizzaria, pedido.id, { entregadorId: carlos, entregadorAtualId: paulo })).statusCode, 200);
    await aguardarAte(() => dePaulo.length === 3 && deCarlos.length === 1);
    assert.equal(dePaulo[2]?.entrega, null, "quem perdeu o pedido é avisado para removê-lo da tela");
    assert.equal(deCarlos[0]?.entrega?.pedidoId, pedido.id);

    // Cancelar encerra a entrega para quem estava com ela.
    assert.equal((await ctx.api(A, "POST", `/empresas/${pizzaria.id}/pedidos/${pedido.id}/cancelar`, { statusAtual: "saiu_para_entrega", motivo: "Cliente desistiu" })).statusCode, 200);
    await aguardarAte(() => deCarlos.length === 2);
    assert.equal(deCarlos[1]?.entrega, null);
    assert.equal(doCliente.length, 0);
  });
});
