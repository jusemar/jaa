import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntregaConcluida } from "@jaa/contratos";
import { OPCOES_DE_PERIODO, PERIODO_INICIAL, consultaDoHistorico, formatarConclusao, juntarPaginas, periodoValido } from "./historico-entregas";

const entrega = (id: string, numeroPedido: number): EntregaConcluida => ({ id, numeroPedido, concluidaEm: "2026-10-11T15:00:00.000Z", status: "entregue" });

describe("histórico de entregas (app)", () => {
  it("as opções são as de Pedidos, sem 'Todo o período', e começa em Hoje", () => {
    assert.deepEqual(OPCOES_DE_PERIODO.map((opcao) => opcao.rotulo), ["Hoje", "Esta semana", "Este mês", "Personalizado"]);
    assert.equal(PERIODO_INICIAL.periodo, "hoje");
  });

  it("a consulta leva período, limite e, quando há, cursor e datas", () => {
    assert.equal(consultaDoHistorico({ periodo: "semana" }), "periodo=semana&limite=20");
    assert.equal(consultaDoHistorico({ periodo: "mes" }, "abc"), "periodo=mes&limite=20&antesDe=abc");
    assert.equal(consultaDoHistorico({ periodo: "personalizado", dataInicial: "2026-10-01", dataFinal: "2026-10-11" }), "periodo=personalizado&limite=20&dataInicial=2026-10-01&dataFinal=2026-10-11");
    // Datas esquecidas de outro período não vazam para a consulta.
    assert.equal(consultaDoHistorico({ periodo: "hoje", dataInicial: "2026-10-01", dataFinal: "2026-10-11" }), "periodo=hoje&limite=20");
  });

  it("personalizado só vale com as duas datas e em ordem", () => {
    assert.equal(periodoValido({ periodo: "hoje" }), true);
    assert.equal(periodoValido({ periodo: "personalizado" }), false);
    assert.equal(periodoValido({ periodo: "personalizado", dataInicial: "2026-10-11", dataFinal: "" }), false);
    assert.equal(periodoValido({ periodo: "personalizado", dataInicial: "2026-10-12", dataFinal: "2026-10-11" }), false);
    assert.equal(periodoValido({ periodo: "personalizado", dataInicial: "2026-10-11", dataFinal: "2026-10-11" }), true);
  });

  it("Carregar mais acrescenta no fim e não repete entrega", () => {
    const juntas = juntarPaginas([entrega("a", 3), entrega("b", 2)], [entrega("b", 2), entrega("c", 1)]);
    assert.deepEqual(juntas.map((item) => item.id), ["a", "b", "c"]);
  });

  it("a conclusão aparece com data e hora", () => {
    assert.equal(formatarConclusao("2026-10-11T15:04:00.000Z", "America/Sao_Paulo"), "11/10/2026, 12:04");
  });
});
