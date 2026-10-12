import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consultaPedidosEmpresaSchema, contagensPorFiltro, entregadorNoResumoDoPedido, saidaDoPedido } from "./gestao-pedidos.ts";
import { dataLocalDoInstante, dataLocalSchema, inicioDoDia, instanteNoIntervalo, intervaloDoPeriodo, problemaDoPeriodoPersonalizado, somarDias } from "./periodo-pedidos.ts";
import type { SaidaEntrega } from "../entregas/saida.ts";

const SP = "America/Sao_Paulo"; // UTC−3, sem horário de verão.
const iso = (intervalo: { de: Date | null; ate: Date | null }) => [intervalo.de?.toISOString() ?? null, intervalo.ate?.toISOString() ?? null];

describe("período da lista de pedidos", () => {
  it("o dia é o do calendário da EMPRESA, não o do servidor (UTC)", () => {
    // 01:30 UTC de segunda ainda é domingo à noite em São Paulo.
    const agora = new Date("2026-10-12T01:30:00.000Z");
    assert.equal(dataLocalDoInstante(agora, SP), "2026-10-11");
    assert.equal(dataLocalDoInstante(agora, "UTC"), "2026-10-12");
    assert.equal(inicioDoDia("2026-10-11", SP).toISOString(), "2026-10-11T03:00:00.000Z");
  });

  it("Hoje: da meia-noite local à meia-noite seguinte, com o fim de fora", () => {
    const agora = new Date("2026-10-11T15:00:00.000Z");
    const hoje = intervaloDoPeriodo("hoje", { agora, fuso: SP });
    assert.deepEqual(iso(hoje), ["2026-10-11T03:00:00.000Z", "2026-10-12T03:00:00.000Z"]);
    assert.equal(instanteNoIntervalo(new Date("2026-10-11T03:00:00.000Z"), hoje), true); // 00:00 em ponto entra
    assert.equal(instanteNoIntervalo(new Date("2026-10-12T02:59:59.999Z"), hoje), true); // 23:59:59,999 entra
    assert.equal(instanteNoIntervalo(new Date("2026-10-12T03:00:00.000Z"), hoje), false); // meia-noite já é amanhã
    assert.equal(instanteNoIntervalo(new Date("2026-10-11T02:59:59.999Z"), hoje), false); // ontem
  });

  it("Esta semana: de segunda a domingo (domingo pertence à semana que termina nele)", () => {
    // 11/10/2026 é domingo: a semana começou na segunda 05/10.
    assert.deepEqual(iso(intervaloDoPeriodo("semana", { agora: new Date("2026-10-11T15:00:00.000Z"), fuso: SP })), ["2026-10-05T03:00:00.000Z", "2026-10-12T03:00:00.000Z"]);
    // Segunda 12/10 abre a semana seguinte.
    assert.deepEqual(iso(intervaloDoPeriodo("semana", { agora: new Date("2026-10-12T15:00:00.000Z"), fuso: SP })), ["2026-10-12T03:00:00.000Z", "2026-10-19T03:00:00.000Z"]);
  });

  it("Este mês: do dia 1 ao dia 1 seguinte, inclusive na virada do ano", () => {
    assert.deepEqual(iso(intervaloDoPeriodo("mes", { agora: new Date("2026-10-11T15:00:00.000Z"), fuso: SP })), ["2026-10-01T03:00:00.000Z", "2026-11-01T03:00:00.000Z"]);
    assert.deepEqual(iso(intervaloDoPeriodo("mes", { agora: new Date("2026-12-31T15:00:00.000Z"), fuso: SP })), ["2026-12-01T03:00:00.000Z", "2027-01-01T03:00:00.000Z"]);
  });

  it("Personalizado: as duas datas entram inteiras; o mesmo dia nas duas é um dia só", () => {
    const agora = new Date("2026-10-11T15:00:00.000Z");
    assert.deepEqual(iso(intervaloDoPeriodo("personalizado", { agora, fuso: SP, dataInicial: "2026-10-01", dataFinal: "2026-10-03" })), ["2026-10-01T03:00:00.000Z", "2026-10-04T03:00:00.000Z"]);
    assert.deepEqual(iso(intervaloDoPeriodo("personalizado", { agora, fuso: SP, dataInicial: "2026-10-03", dataFinal: "2026-10-03" })), ["2026-10-03T03:00:00.000Z", "2026-10-04T03:00:00.000Z"]);
    assert.throws(() => intervaloDoPeriodo("personalizado", { agora, fuso: SP }));
  });

  it("Todo o período não limita nada", () => {
    const tudo = intervaloDoPeriodo("todos", { agora: new Date(), fuso: SP });
    assert.deepEqual(tudo, { de: null, ate: null });
    assert.equal(instanteNoIntervalo(new Date("2000-01-01T00:00:00.000Z"), tudo), true);
  });

  it("dia com troca de horário continua começando na meia-noite local", () => {
    // Nova York volta 1 h em 01/11/2026: o dia tem 25 horas.
    const de = inicioDoDia("2026-11-01", "America/New_York");
    const ate = inicioDoDia("2026-11-02", "America/New_York");
    assert.equal(de.toISOString(), "2026-11-01T04:00:00.000Z");
    assert.equal(ate.toISOString(), "2026-11-02T05:00:00.000Z");
  });

  it("datas: formato, calendário real e ordem", () => {
    assert.equal(dataLocalSchema.safeParse("2026-10-11").success, true);
    for (const invalida of ["11/10/2026", "2026-13-01", "2026-02-30", "2026-1-1", ""]) assert.equal(dataLocalSchema.safeParse(invalida).success, false, invalida);
    assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
    assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
    assert.equal(problemaDoPeriodoPersonalizado("2026-10-01", "2026-10-03"), null);
    assert.match(problemaDoPeriodoPersonalizado("2026-10-03", "2026-10-01") ?? "", /não pode ser anterior/);
    assert.match(problemaDoPeriodoPersonalizado("2026-10-03", undefined) ?? "", /data inicial e a data final/);
  });
});

describe("consulta e contagens da lista de pedidos", () => {
  it("o padrão é todo o período, todos os status", () => {
    assert.deepEqual(consultaPedidosEmpresaSchema.parse({}), { filtro: "todos", limite: 20, periodo: "todos" });
  });

  it("personalizado exige as duas datas em ordem; nos outros períodos as datas não são exigidas", () => {
    assert.equal(consultaPedidosEmpresaSchema.safeParse({ periodo: "personalizado" }).success, false);
    assert.equal(consultaPedidosEmpresaSchema.safeParse({ periodo: "personalizado", dataInicial: "2026-10-03", dataFinal: "2026-10-01" }).success, false);
    assert.equal(consultaPedidosEmpresaSchema.safeParse({ periodo: "personalizado", dataInicial: "2026-10-01", dataFinal: "2026-10-03" }).success, true);
    assert.equal(consultaPedidosEmpresaSchema.safeParse({ periodo: "hoje" }).success, true);
    assert.equal(consultaPedidosEmpresaSchema.safeParse({ periodo: "ontem" }).success, false);
  });

  it("as contagens somam os status reais de cada filtro", () => {
    const contagens = contagensPorFiltro({ recebido: 3, confirmado: 1, em_preparacao: 2, pronto: 1, saiu_para_entrega: 2, em_rota: 1, entregue: 5, cancelado: 4 });
    assert.deepEqual(contagens, { todos: 19, recebidos: 4, em_preparacao: 2, prontos: 1, em_entrega: 3, entregues: 5, cancelados: 4 });
    assert.deepEqual(contagensPorFiltro({}), { todos: 0, recebidos: 0, em_preparacao: 0, prontos: 0, em_entrega: 0, entregues: 0, cancelados: 0 });
  });
});

describe("entregador no resumo logístico do pedido", () => {
  const joao = { identidadeId: "i1", tipo: "pessoal", nomeExibicao: "João", nomeUsuario: "joao" } as SaidaEntrega["entregador"];
  const saida = (extra: Partial<SaidaEntrega>, paradas: { pedidoId: string; encerradaEm: string | null }[] = []) => ({ id: "s", status: "preparada", entregador: null, paradas, ...extra }) as SaidaEntrega;

  it("pedido cancelado ou entregue nunca diz 'aguardando atribuição'", () => {
    assert.equal(entregadorNoResumoDoPedido("cancelado", saida({ status: "concluida" })), null);
    assert.equal(entregadorNoResumoDoPedido("entregue", saida({ status: "concluida" })), null);
    // Rota ainda aberta (outros pedidos), mas ESTE pedido já foi cancelado.
    assert.equal(entregadorNoResumoDoPedido("cancelado", saida({ status: "aguardando_entregador" })), null);
  });

  it("entregador que esteve com o pedido continua aparecendo depois de encerrado", () => {
    assert.deepEqual(entregadorNoResumoDoPedido("cancelado", saida({ status: "concluida", entregador: joao })), { tipo: "atribuido", nome: "João" });
    assert.deepEqual(entregadorNoResumoDoPedido("entregue", saida({ status: "concluida", entregador: joao })), { tipo: "atribuido", nome: "João" });
  });

  it("'aguardando' só enquanto o pedido ainda pode receber entregador", () => {
    for (const status of ["pronto", "saiu_para_entrega", "em_rota"] as const) assert.deepEqual(entregadorNoResumoDoPedido(status, saida({ status: "aguardando_entregador" })), { tipo: "aguardando" });
    assert.deepEqual(entregadorNoResumoDoPedido("pronto", saida({ status: "em_formacao" })), { tipo: "aguardando" });
    assert.deepEqual(entregadorNoResumoDoPedido("pronto", saida({ status: "preparada", entregador: joao })), { tipo: "atribuido", nome: "João" });
    assert.equal(entregadorNoResumoDoPedido("pronto", null), null);
  });

  it("pedido que passou por duas rotas: vale a ativa; sem ativa, a de encerramento mais recente", () => {
    const formacao = saida({ id: "formacao" }, [{ pedidoId: "p", encerradaEm: "2026-10-11T10:00:00.000Z" }]);
    const manual = saida({ id: "manual", entregador: joao }, [{ pedidoId: "p", encerradaEm: null }]);
    assert.equal(saidaDoPedido([formacao, manual], "p")?.id, "manual");
    assert.equal(saidaDoPedido([manual, formacao], "p")?.id, "manual");

    const manualEncerrada = saida({ id: "manual", entregador: joao }, [{ pedidoId: "p", encerradaEm: "2026-10-11T11:00:00.000Z" }]);
    assert.equal(saidaDoPedido([formacao, manualEncerrada], "p")?.id, "manual");
    assert.equal(saidaDoPedido([manualEncerrada, formacao], "p")?.id, "manual");
    assert.equal(saidaDoPedido([formacao], "outro"), null);
  });
});
