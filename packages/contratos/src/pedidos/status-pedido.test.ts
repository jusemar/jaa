import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FLUXO_STATUS_PEDIDO,
  ROTULO_ACAO_AVANCAR,
  ROTULO_STATUS_PEDIDO,
  montarTimelinePedido,
  motivoCancelamentoSchema,
  podeCancelarPedido,
  proximoStatusPedido,
  statusPedidoTerminal,
  type EventoStatusPedido,
  type StatusPedido,
} from "./status-pedido.ts";

const evento = (status: StatusPedido, hora: string, motivo: string | null = null): EventoStatusPedido => ({
  id: `01a0a394-6225-75f2-b809-b26909935${status.length}12`,
  status,
  ocorridoEm: `2026-09-15T${hora}:00.000Z`,
  motivo,
});

describe("máquina de estados do Pedido", () => {
  it("avança um passo por vez, na ordem do fluxo operacional", () => {
    const caminho: StatusPedido[] = [];
    let atual: StatusPedido | null = "recebido";
    while (atual) {
      caminho.push(atual);
      atual = proximoStatusPedido(atual);
    }
    assert.deepEqual(caminho, [...FLUXO_STATUS_PEDIDO]);
  });

  it("entregue e cancelado são terminais: não avançam nem podem ser cancelados", () => {
    for (const terminal of ["entregue", "cancelado"] as const) {
      assert.equal(statusPedidoTerminal(terminal), true);
      assert.equal(proximoStatusPedido(terminal), null);
      assert.equal(ROTULO_ACAO_AVANCAR[terminal], null);
      assert.equal(podeCancelarPedido(terminal), false);
    }
  });

  it("todo estado não terminal pode ser cancelado e tem exatamente uma ação de avanço", () => {
    for (const status of FLUXO_STATUS_PEDIDO.filter((etapa) => etapa !== "entregue")) {
      assert.equal(podeCancelarPedido(status), true, status);
      assert.equal(typeof ROTULO_ACAO_AVANCAR[status], "string", status);
      assert.equal(proximoStatusPedido(status) !== null, true, status);
    }
  });

  it("todo status tem rótulo em português natural", () => {
    assert.equal(ROTULO_STATUS_PEDIDO.recebido, "Pedido recebido");
    assert.equal(ROTULO_STATUS_PEDIDO.em_preparacao, "Em preparação");
    assert.equal(ROTULO_STATUS_PEDIDO.cancelado, "Pedido cancelado");
  });

  it("motivo do cancelamento é texto curto obrigatório", () => {
    assert.equal(motivoCancelamentoSchema.safeParse("Produto indisponível").success, true);
    assert.equal(motivoCancelamentoSchema.safeParse("  ").success, false);
    assert.equal(motivoCancelamentoSchema.safeParse("x".repeat(201)).success, false);
  });
});

describe("timeline do pedido", () => {
  it("separa concluídas, atual e futuras — e não inventa horário para o que não aconteceu", () => {
    const timeline = montarTimelinePedido("em_preparacao", [evento("recebido", "12:00"), evento("confirmado", "12:05"), evento("em_preparacao", "12:09")]);

    assert.deepEqual(
      timeline.map((etapa) => [etapa.status, etapa.situacao]),
      [
        ["recebido", "concluida"],
        ["confirmado", "concluida"],
        ["em_preparacao", "atual"],
        ["pronto", "futura"],
        ["saiu_para_entrega", "futura"],
        ["em_rota", "futura"],
        ["entregue", "futura"],
      ],
    );
    assert.equal(timeline[1]?.ocorridoEm, "2026-09-15T12:05:00.000Z");
    assert.equal(timeline.every((etapa) => etapa.situacao !== "futura" || etapa.ocorridoEm === null), true);
  });

  it("pedido entregue termina a timeline sem etapas futuras", () => {
    const timeline = montarTimelinePedido("entregue", FLUXO_STATUS_PEDIDO.map((status, indice) => evento(status, `1${indice}:00`)));
    assert.equal(timeline.length, FLUXO_STATUS_PEDIDO.length);
    assert.deepEqual(timeline.at(-1)?.status, "entregue");
    assert.equal(timeline.at(-1)?.situacao, "atual");
  });

  it("pedido cancelado não continua desenhando o fluxo: encerra em cancelado", () => {
    const timeline = montarTimelinePedido("cancelado", [evento("recebido", "12:00"), evento("confirmado", "12:05"), evento("cancelado", "12:20", "Produto indisponível")]);

    assert.deepEqual(
      timeline.map((etapa) => [etapa.status, etapa.situacao]),
      [
        ["recebido", "concluida"],
        ["confirmado", "concluida"],
        ["cancelado", "atual"],
      ],
    );
    assert.equal(timeline.some((etapa) => etapa.situacao === "futura"), false);
  });
});
