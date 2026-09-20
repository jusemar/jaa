import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAXIMO_PARADAS_POR_SAIDA,
  criarSaidaEntradaSchema,
  paradasAtivas,
  proximaParada,
  reordenarSequenciaEntradaSchema,
  restanteDaFormacaoMs,
  rotuloFila,
  saidaAceitaNovosPedidos,
  saidaEntregaSchema,
  statusSaidaSchema,
  type ParadaSaida,
} from "./saida.ts";

const uuid = (n: number) => `01a0a394-6225-75f2-b809-b26909935${String(n).padStart(3, "0")}`;

const destino = {
  enderecoId: uuid(90),
  cep: "30123000",
  logradouro: "Rua das Flores",
  numero: "150",
  complemento: null,
  bairro: "Centro",
  cidade: "Belo Horizonte",
  uf: "MG" as const,
  pontoReferencia: null,
  latitude: -19.919125,
  longitude: -43.938602,
  localizacaoConfirmadaEm: "2026-09-16T11:55:00.000Z",
};

const parada = (n: number, posicao: number, encerradaEm: string | null = null): ParadaSaida => ({
  id: uuid(n),
  pedidoId: uuid(n + 50),
  numeroPedido: n,
  posicao,
  statusPedido: encerradaEm ? "entregue" : "saiu_para_entrega",
  destino,
  cliente: { identidadeId: uuid(n + 20), tipo: "pessoal", nomeExibicao: `Cliente ${n}`, nomeUsuario: `cliente${n}` },
  totalCentavos: 3990,
  encerradaEm,
  motivoEncerramento: encerradaEm ? "Pedido entregue" : null,
});

const saida = (paradas: ParadaSaida[]) => ({
  id: uuid(1),
  empresa: { identidadeId: uuid(2), nome: "Pizzaria BH", nomeUsuario: "pizzariabh", slug: "pizzaria-bh" },
  entregador: { identidadeId: uuid(3), tipo: "pessoal" as const, nomeExibicao: "Paulo Entregador", nomeUsuario: "paulo" },
  status: "em_andamento" as const,
  versaoSequencia: 2,
  paradas,
  rota: null,
  zonaPrincipal: null,
  zonasCombinadas: [],
  automatica: false,
  criadoEm: "2026-09-16T12:00:00.000Z",
  formacaoIniciadaEm: null,
  prazoFormacaoEm: null,
  fechadaEm: null,
  atribuidaEm: null,
  iniciadaEm: "2026-09-16T12:10:00.000Z",
  concluidaEm: null,
});

describe("saída de entrega", () => {
  it("tem a própria máquina de estados, separada da do pedido", () => {
    assert.deepEqual(statusSaidaSchema.options, ["em_formacao", "aguardando_entregador", "preparada", "em_andamento", "concluida"]);
    assert.equal(statusSaidaSchema.safeParse("entregue").success, false, "status de pedido não é status de saída");
  });

  it("só a saída EM FORMAÇÃO recebe pedido novo (fechada ou iniciada, nunca)", () => {
    assert.equal(saidaAceitaNovosPedidos("em_formacao"), true);
    for (const status of ["aguardando_entregador", "preparada", "em_andamento", "concluida"] as const) {
      assert.equal(saidaAceitaNovosPedidos(status), false, status);
    }
  });

  it("a saída em formação pode estar sem entregador, e o prazo vem do servidor", () => {
    const emFormacao = saidaEntregaSchema.parse({
      ...saida([parada(1, 1)]),
      entregador: null,
      status: "em_formacao",
      formacaoIniciadaEm: "2026-09-16T12:00:00.000Z",
      prazoFormacaoEm: "2026-09-16T12:15:00.000Z",
      iniciadaEm: null,
    });
    assert.equal(emFormacao.entregador, null);
    assert.equal(restanteDaFormacaoMs(emFormacao, new Date("2026-09-16T12:10:00.000Z")), 5 * 60 * 1000);
    assert.ok((restanteDaFormacaoMs(emFormacao, new Date("2026-09-16T12:20:00.000Z")) ?? 0) < 0, "prazo vencido é negativo");
    assert.equal(restanteDaFormacaoMs(saidaEntregaSchema.parse(saida([parada(1, 1)]))), null);
  });

  it("agrupa vários pedidos, com limite operacional", () => {
    const base = { entregadorId: uuid(4), pedidoIds: [uuid(5), uuid(6), uuid(7)] };
    assert.equal(criarSaidaEntradaSchema.safeParse(base).success, true);
    assert.equal(criarSaidaEntradaSchema.safeParse({ ...base, pedidoIds: [] }).success, false);
    assert.equal(criarSaidaEntradaSchema.safeParse({ ...base, pedidoIds: Array.from({ length: MAXIMO_PARADAS_POR_SAIDA + 1 }, (_, i) => uuid(i)) }).success, false);
  });

  it("a parada carrega o destino SNAPSHOT do pedido, com ponto confirmado", () => {
    const valida = saidaEntregaSchema.parse(saida([parada(1, 1)]));
    assert.equal(valida.paradas[0]?.destino.latitude, -19.919125);
    assert.equal(saidaEntregaSchema.safeParse(saida([{ ...parada(1, 1), destino: { ...destino, latitude: null } } as unknown as ParadaSaida])).success, false);
  });

  it("reordenar exige a versão que a tela viu", () => {
    assert.equal(reordenarSequenciaEntradaSchema.safeParse({ versaoSequencia: 2, pedidoIds: [uuid(5), uuid(6)] }).success, true);
    assert.equal(reordenarSequenciaEntradaSchema.safeParse({ pedidoIds: [uuid(5)] }).success, false, "sem versão não salva");
  });
});

describe("sequência ativa", () => {
  it("paradas encerradas saem da sequência e a próxima é a primeira ativa", () => {
    const atual = saida([parada(1, 1, "2026-09-16T12:30:00.000Z"), parada(2, 2), parada(3, 3)]);
    assert.deepEqual(paradasAtivas(atual).map((item) => item.posicao), [2, 3]);
    assert.equal(proximaParada(atual)?.pedidoId, parada(2, 2).pedidoId);
  });

  it("saída sem parada ativa não tem próxima", () => {
    assert.equal(proximaParada(saida([parada(1, 1, "2026-09-16T12:30:00.000Z")])), null);
  });
});

describe("fila do cliente", () => {
  it("traduz a posição derivada, sem citar ninguém", () => {
    assert.equal(rotuloFila({ pedidoId: uuid(9), situacao: "indo_ate_voce", entregasAntes: 0 }), "Indo até você");
    assert.equal(rotuloFila({ pedidoId: uuid(9), situacao: "na_fila", entregasAntes: 3 }), "3 entregas antes da sua");
    assert.equal(rotuloFila({ pedidoId: uuid(9), situacao: "na_fila", entregasAntes: 1 }), "1 entrega antes da sua");
    assert.equal(rotuloFila({ pedidoId: uuid(9), situacao: "aguardando_saida", entregasAntes: 2 }), "Seu pedido está separado para a entrega");
    assert.equal(rotuloFila({ pedidoId: uuid(9), situacao: "sem_saida", entregasAntes: null }), "Ainda não saiu para entrega");
  });

  it("o contrato da fila só tem situação e um número — nada de outros pedidos", () => {
    const fila = { pedidoId: uuid(9), situacao: "na_fila" as const, entregasAntes: 2 };
    assert.deepEqual(Object.keys(fila).sort(), ["entregasAntes", "pedidoId", "situacao"]);
  });
});
