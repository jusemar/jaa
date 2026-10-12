import assert from "node:assert/strict";
import { entregadorNoResumoDoPedido } from "@jaa/contratos";
import { describe, it } from "node:test";
import type { SaidaEntrega } from "@jaa/contratos";
import { adotarSaida, apresentacaoEntregaDoPedido, encontrarSaidaDoPedido, motivoEscolhido, motivoValido, nomeDaRota, OUTRO_MOTIVO, podeAtribuirEntregador, rotuloDeItens, statusVisualEntregaDoPedido } from "./gestao-pedidos";
import { CONSULTA_INICIAL, cursorDaPagina, dataDeHojeNoCampo, dataDoCampo, dataParaCampo, irParaAnterior, irParaProxima, mascararData, paginaAtual, paginaFicouVazia, parametrosDoPeriodo, problemaDoPeriodo, resumoDaPagina, trocarFiltro, trocarPeriodo } from "./paginacao-pedidos";

const saida = (dados: Partial<SaidaEntrega> & { id: string; pedidos: string[] }): SaidaEntrega =>
  ({ status: "preparada", zonaPrincipal: null, zonasCombinadas: [], entregador: null, ...dados, paradas: dados.pedidos.map((pedidoId) => ({ pedidoId })) }) as unknown as SaidaEntrega;

describe("gestão dos pedidos da empresa (app)", () => {
  it("o status da entrega vem do pedido terminal ou da saída em que ele está", () => {
    const rota = saida({ id: "s1", pedidos: ["p1"], status: "em_andamento" });
    assert.equal(statusVisualEntregaDoPedido("cancelado", rota), "cancelada");
    assert.equal(statusVisualEntregaDoPedido("entregue", null), "concluida");
    assert.equal(statusVisualEntregaDoPedido("pronto", rota), "em_andamento");
    assert.equal(statusVisualEntregaDoPedido("pronto", null), null);
    assert.equal(apresentacaoEntregaDoPedido("pronto", rota)?.rotulo, "Em rota");
    assert.equal(apresentacaoEntregaDoPedido("recebido", null), null);
  });

  it("acha a saída do pedido e nomeia a rota pelas zonas (ou Manual)", () => {
    const manual = saida({ id: "s1", pedidos: ["p1", "p2"] });
    const zonas = saida({ id: "s2", pedidos: ["p3"], zonaPrincipal: { id: "z1", nome: "Centro" }, zonasCombinadas: [{ id: "z2", nome: "Savassi" }] } as never);
    assert.equal(encontrarSaidaDoPedido([manual, zonas], "p3")?.id, "s2");
    assert.equal(encontrarSaidaDoPedido([manual, zonas], "p9"), null);
    assert.equal(nomeDaRota(manual), "Manual");
    assert.equal(nomeDaRota(zonas), "Centro + Savassi");
  });

  it("a saída do evento substitui a que já estava ou entra na frente", () => {
    const a = saida({ id: "a", pedidos: ["p1"] });
    const b = saida({ id: "b", pedidos: ["p2"] });
    const aNova = saida({ id: "a", pedidos: ["p1"], status: "em_andamento" });
    assert.deepEqual(adotarSaida([a, b], aNova).map((item) => [item.id, item.status]), [["a", "em_andamento"], ["b", "preparada"]]);
    assert.deepEqual(adotarSaida([b], a).map((item) => item.id), ["a", "b"]);
  });

  it("só atribui entregador com o pedido pronto ou na rua", () => {
    assert.deepEqual((["recebido", "em_preparacao", "pronto", "saiu_para_entrega", "em_rota", "entregue", "cancelado"] as const).map(podeAtribuirEntregador), [false, false, true, true, true, false, false]);
  });

  it("cancelar exige motivo: a sugestão ou o texto de Outro motivo, com 3 caracteres ou mais", () => {
    assert.equal(motivoEscolhido("Produto em falta", "ignorado"), "Produto em falta");
    assert.equal(motivoEscolhido(OUTRO_MOTIVO, "  chuva forte "), "chuva forte");
    assert.equal(motivoValido(motivoEscolhido(OUTRO_MOTIVO, " ab ")), false);
    assert.equal(motivoValido("abc"), true);
  });

  it("conta itens no singular e no plural", () => {
    assert.equal(rotuloDeItens(1), "1 item");
    assert.equal(rotuloDeItens(3), "3 itens");
  });
});

describe("paginação dos pedidos da empresa (app)", () => {
  it("guarda os cursores para voltar, e outro filtro recomeça da primeira página", () => {
    const segunda = irParaProxima(CONSULTA_INICIAL, "c1");
    assert.equal(paginaAtual(segunda), 2);
    assert.equal(cursorDaPagina(segunda), "c1");
    assert.equal(irParaProxima(segunda, null), segunda);
    assert.deepEqual(irParaAnterior(segunda), CONSULTA_INICIAL);
    assert.equal(irParaAnterior(CONSULTA_INICIAL), CONSULTA_INICIAL);
    assert.deepEqual(trocarFiltro(segunda, "prontos"), { filtro: "prontos", cursores: [], periodo: "todos" });
    assert.equal(trocarFiltro(segunda, "todos"), segunda);
    assert.equal(paginaFicouVazia(segunda, 0), true);
    assert.equal(paginaFicouVazia(CONSULTA_INICIAL, 0), false);
  });

  it("resume a página como a Web", () => {
    assert.equal(resumoDaPagina({ pagina: 1, quantidadeNaPagina: 10, total: 36, temProxima: true }).contagem, "1–10 de 36 pedidos");
    assert.equal(resumoDaPagina({ pagina: 4, quantidadeNaPagina: 6, total: 36, temProxima: false }).totalPaginas, 4);
    assert.equal(resumoDaPagina({ pagina: 1, quantidadeNaPagina: 1, total: 1, temProxima: false }).contagem, "1 pedido");
    // Dez pedidos exatos: a API oferece cursor, mas não há próxima página.
    assert.equal(resumoDaPagina({ pagina: 1, quantidadeNaPagina: 10, total: 10, temProxima: true }).temProxima, false);
  });
});

describe("período e entregador na lista de pedidos (app)", () => {
  it("trocar o período volta à página 1, mantém o status e só o personalizado leva datas", () => {
    const naPagina2 = irParaProxima(trocarFiltro(CONSULTA_INICIAL, "entregues"), "c1");
    const hoje = trocarPeriodo(naPagina2, "hoje");
    assert.deepEqual(hoje, { filtro: "entregues", cursores: [], periodo: "hoje" });
    assert.equal(trocarPeriodo(hoje, "hoje"), hoje);
    assert.deepEqual(parametrosDoPeriodo(hoje), { periodo: "hoje" });
    const datas = { dataInicial: "2026-10-01", dataFinal: "2026-10-03" };
    const personalizado = trocarPeriodo(hoje, "personalizado", datas);
    assert.deepEqual(parametrosDoPeriodo(personalizado), { periodo: "personalizado", ...datas });
    assert.deepEqual(trocarFiltro(personalizado, "cancelados"), { filtro: "cancelados", cursores: [], periodo: "personalizado", ...datas });
    assert.deepEqual(trocarPeriodo(personalizado, "todos"), { filtro: "entregues", cursores: [], periodo: "todos" });
  });

  it("datas digitadas: máscara, conversão para a API e o que ainda não é uma data", () => {
    assert.equal(mascararData("11102026"), "11/10/2026");
    assert.equal(mascararData("1110"), "11/10");
    assert.equal(mascararData("11/10/20269"), "11/10/2026");
    assert.equal(dataDoCampo("11/10/2026"), "2026-10-11");
    for (const incompleta of ["", "11/10", "11/10/20", "31/02/2026", "00/10/2026"]) assert.equal(dataDoCampo(incompleta), "", incompleta);
    assert.equal(dataParaCampo("2026-10-11"), "11/10/2026");
    assert.equal(dataParaCampo(dataDeHojeNoCampo(new Date(2026, 9, 5))), "05/10/2026");
  });

  it("personalizado só vira consulta completo e em ordem", () => {
    assert.match(problemaDoPeriodo({ periodo: "personalizado", dataInicial: dataDoCampo("11/10/2026"), dataFinal: dataDoCampo("10/10") }) ?? "", /data inicial e a data final/);
    assert.match(problemaDoPeriodo({ periodo: "personalizado", dataInicial: "2026-10-11", dataFinal: "2026-10-10" }) ?? "", /anterior/);
    assert.equal(problemaDoPeriodo({ periodo: "personalizado", dataInicial: "2026-10-10", dataFinal: "2026-10-11" }), null);
    assert.equal(problemaDoPeriodo({ periodo: "mes" }), null);
  });

  it("pedido cancelado/entregue: entregador histórico aparece; sem histórico, nada de 'aguardando'", () => {
    const formacao = { ...saida({ id: "s1", pedidos: [], status: "concluida" }), paradas: [{ pedidoId: "p", encerradaEm: "2026-10-11T10:00:00.000Z" }] } as unknown as SaidaEntrega;
    const manual = { ...saida({ id: "s2", pedidos: [], status: "concluida" }), entregador: { nomeExibicao: "Motoboy" }, paradas: [{ pedidoId: "p", encerradaEm: "2026-10-11T11:00:00.000Z" }] } as unknown as SaidaEntrega;
    // Duas rotas: vale a última em que o pedido esteve.
    assert.equal(encontrarSaidaDoPedido([formacao, manual], "p")?.id, "s2");
    assert.deepEqual(entregadorNoResumoDoPedido("cancelado", encontrarSaidaDoPedido([formacao, manual], "p")), { tipo: "atribuido", nome: "Motoboy" });
    assert.equal(entregadorNoResumoDoPedido("cancelado", formacao), null);
    assert.equal(entregadorNoResumoDoPedido("entregue", formacao), null);
    assert.deepEqual(entregadorNoResumoDoPedido("pronto", saida({ id: "s3", pedidos: ["p"], status: "aguardando_entregador" })), { tipo: "aguardando" });
  });
});
