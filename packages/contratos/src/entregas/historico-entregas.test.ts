import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consultaHistoricoEntregasSchema, entregaConcluidaSchema, periodoHistoricoEntregasSchema, rotuloTotalDeEntregas } from "./historico-entregas.ts";

describe("histórico de entregas (contrato)", () => {
  it("os períodos são os de Pedidos, sem 'todo o período', e o padrão é Hoje", () => {
    assert.deepEqual(periodoHistoricoEntregasSchema.options, ["hoje", "semana", "mes", "personalizado"]);
    assert.deepEqual(consultaHistoricoEntregasSchema.parse({}), { periodo: "hoje", limite: 20 });
    assert.equal(consultaHistoricoEntregasSchema.safeParse({ periodo: "todos" }).success, false);
  });

  it("limite entre 1 e 50; cursor é uuid", () => {
    assert.equal(consultaHistoricoEntregasSchema.parse({ limite: "50" }).limite, 50);
    assert.equal(consultaHistoricoEntregasSchema.safeParse({ limite: "51" }).success, false);
    assert.equal(consultaHistoricoEntregasSchema.safeParse({ limite: "0" }).success, false);
    assert.equal(consultaHistoricoEntregasSchema.safeParse({ antesDe: "abc" }).success, false);
  });

  it("personalizado exige as duas datas, válidas e em ordem — a mesma regra de Pedidos", () => {
    assert.equal(consultaHistoricoEntregasSchema.safeParse({ periodo: "personalizado" }).success, false);
    assert.equal(consultaHistoricoEntregasSchema.safeParse({ periodo: "personalizado", dataInicial: "2026-10-12", dataFinal: "2026-10-11" }).success, false);
    assert.equal(consultaHistoricoEntregasSchema.safeParse({ periodo: "personalizado", dataInicial: "2026-02-30", dataFinal: "2026-03-01" }).success, false);
    assert.equal(consultaHistoricoEntregasSchema.safeParse({ periodo: "personalizado", dataInicial: "2026-10-11", dataFinal: "2026-10-11" }).success, true);
  });

  it("o item só tem número do pedido, conclusão e Entregue — qualquer outro campo é recusado", () => {
    const item = { id: "0199c1a2-0000-7000-8000-000000000001", numeroPedido: 12, concluidaEm: "2026-10-11T15:00:00.000Z", status: "entregue" };
    assert.equal(entregaConcluidaSchema.safeParse(item).success, true);
    assert.equal(entregaConcluidaSchema.safeParse({ ...item, totalCentavos: 3990 }).success, false);
    assert.equal(entregaConcluidaSchema.safeParse({ ...item, status: "cancelado" }).success, false);
  });

  it("rótulo do total", () => {
    assert.equal(rotuloTotalDeEntregas(1), "1 entrega");
    assert.equal(rotuloTotalDeEntregas(12), "12 entregas");
  });
});
