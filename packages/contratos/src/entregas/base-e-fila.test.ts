import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRECISAO_MAXIMA_ACEITA_METROS,
  RAIO_BASE_MAXIMO_METROS,
  RAIO_BASE_MINIMO_METROS,
  RAIO_BASE_PADRAO_METROS,
  ROTULO_ESTADO_OPERACIONAL,
  baseTemPontoConfirmado,
  enviarLocalizacaoEntradaSchema,
  estadoOperacional,
  participaDaFila,
  rotuloSituacaoEntregador,
  salvarBaseEntradaSchema,
  type SituacaoOperacional,
} from "./base-e-fila.ts";

const uuid = "01a0a394-6225-75f2-b809-b2690993c512";

const base = {
  cep: "30123-000",
  logradouro: "Avenida do Contorno",
  numero: "500",
  bairro: "Savassi",
  cidade: "Belo Horizonte",
  uf: "MG",
};

describe("base operacional da empresa", () => {
  it("guarda o endereço textual e um raio dentro dos limites", () => {
    const salva = salvarBaseEntradaSchema.parse(base);
    assert.equal(salva.cep, "30123000");
    assert.equal(
      salva.raioMetros,
      RAIO_BASE_PADRAO_METROS,
      "raio padrão quando não informado",
    );
    assert.equal(
      salvarBaseEntradaSchema.safeParse({
        ...base,
        raioMetros: RAIO_BASE_MINIMO_METROS,
      }).success,
      true,
    );
    assert.equal(
      salvarBaseEntradaSchema.safeParse({
        ...base,
        raioMetros: RAIO_BASE_MAXIMO_METROS,
      }).success,
      true,
    );
    assert.equal(
      salvarBaseEntradaSchema.safeParse({ ...base, raioMetros: 10 }).success,
      false,
    );
    assert.equal(
      salvarBaseEntradaSchema.safeParse({ ...base, raioMetros: 5000 }).success,
      false,
    );
    // Coordenada não entra pelo formulário: o ponto é confirmado à parte, no mapa.
    assert.equal("latitude" in salva, false);
  });

  it("base sem ponto confirmado não detecta presença", () => {
    assert.equal(baseTemPontoConfirmado(null), false);
    assert.equal(
      baseTemPontoConfirmado({
        latitude: null,
        longitude: null,
        localizacaoConfirmadaEm: null,
      }),
      false,
    );
    assert.equal(
      baseTemPontoConfirmado({
        latitude: -19.9,
        longitude: -43.9,
        localizacaoConfirmadaEm: null,
      }),
      false,
    );
    assert.equal(
      baseTemPontoConfirmado({
        latitude: -19.9,
        longitude: -43.9,
        localizacaoConfirmadaEm: "2026-09-16T12:00:00.000Z",
      }),
      true,
    );
  });
});

describe("leitura de localização", () => {
  const leitura = {
    latitude: -19.919125,
    longitude: -43.938602,
    precisaoMetros: 12,
    medidaEm: "2026-09-16T12:00:00.000Z",
  };

  it("aceita o que o aparelho mediu — e nada além disso", () => {
    const valida = enviarLocalizacaoEntradaSchema.parse({
      ...leitura,
      naBase: true,
      entregadorId: uuid,
    });
    assert.equal("naBase" in valida, false, "o cliente nunca declara presença");
    assert.equal(valida.precisaoMetros, 12);
  });

  it("recusa coordenada fora da faixa, não numérica ou sem horário da medição", () => {
    for (const invalida of [
      { ...leitura, latitude: 91 },
      { ...leitura, longitude: 181 },
      { ...leitura, latitude: "-19.9" },
      { ...leitura, medidaEm: "ontem" },
      { latitude: -19.9, longitude: -43.9 },
    ]) {
      assert.equal(
        enviarLocalizacaoEntradaSchema.safeParse(invalida).success,
        false,
        JSON.stringify(invalida),
      );
    }
  });

  it("precisão é opcional, mas existe um limite do que serve para confirmar presença", () => {
    assert.equal(
      enviarLocalizacaoEntradaSchema.safeParse({
        ...leitura,
        precisaoMetros: null,
      }).success,
      true,
    );
    assert.equal(PRECISAO_MAXIMA_ACEITA_METROS > 0, true);
  });
});

describe("estado operacional derivado", () => {
  const ativo = {
    status: "ativo" as const,
    disponivel: true,
    naBase: true,
    aptoParaSaida: true,
  };

  it("vínculo, disponibilidade e presença são coisas diferentes", () => {
    assert.equal(estadoOperacional(ativo), "disponivel_na_base");
    assert.equal(
      estadoOperacional({ ...ativo, naBase: false }),
      "disponivel_fora_base",
    );
    assert.equal(
      estadoOperacional({ ...ativo, disponivel: false }),
      "indisponivel",
    );
    assert.equal(
      estadoOperacional({ ...ativo, status: "inativo" }),
      "indisponivel",
    );
    assert.equal(
      estadoOperacional({ ...ativo, status: "convidado" }),
      "indisponivel",
    );
    // Presente e aceitando, mas com pendência operacional: não entra na fila.
    assert.equal(
      estadoOperacional({ ...ativo, aptoParaSaida: false }),
      "inapto",
    );
    assert.equal(
      estadoOperacional({ ...ativo, emEntrega: true }),
      "em_entrega",
      "saída em andamento prevalece sobre estar disponível na base",
    );
  });

  it("só ativo + aceitando + na base + apto participa da fila", () => {
    assert.equal(participaDaFila(ativo), true);
    for (const variacao of [
      { naBase: false },
      { disponivel: false },
      { aptoParaSaida: false },
      { status: "inativo" as const },
    ]) {
      assert.equal(
        participaDaFila({ ...ativo, ...variacao }),
        false,
        JSON.stringify(variacao),
      );
    }
    assert.equal(participaDaFila({ ...ativo, emEntrega: true }), false);
  });

  it("os rótulos falam de disponibilidade e presença, nunca de localização exata", () => {
    assert.equal(
      ROTULO_ESTADO_OPERACIONAL.disponivel_na_base,
      "Disponível na base",
    );
    assert.equal(
      ROTULO_ESTADO_OPERACIONAL.disponivel_fora_base,
      "Disponível fora da base",
    );
    assert.equal(
      ROTULO_ESTADO_OPERACIONAL.indisponivel,
      "Não aceitando entregas",
    );
    assert.equal(ROTULO_ESTADO_OPERACIONAL.em_entrega, "Em entrega");
  });
});

describe("o que o entregador vê de si", () => {
  const situacao: SituacaoOperacional = {
    entregadorId: uuid,
    empresa: { identidadeId: uuid, nome: "Pizzaria BH" },
    status: "ativo",
    disponivel: true,
    naBase: true,
    aptoParaSaida: true,
    estado: "disponivel_na_base",
    posicaoFila: 2,
    totalNaFila: 3,
    baseConfigurada: true,
  };

  it("mostra a própria posição, sem detalhar quem mais está na fila", () => {
    assert.equal(
      rotuloSituacaoEntregador(situacao),
      "Você é o 2º da fila da base",
    );
    assert.equal(
      rotuloSituacaoEntregador({
        ...situacao,
        posicaoFila: null,
        naBase: false,
        estado: "disponivel_fora_base",
      }),
      "Disponível para chamados, mas fora da fila da base",
    );
    assert.equal(
      rotuloSituacaoEntregador({
        ...situacao,
        posicaoFila: null,
        disponivel: false,
        estado: "indisponivel",
      }),
      "Não aceitando entregas",
    );
    // O contrato não carrega nada dos outros entregadores.
    assert.equal(JSON.stringify(situacao).includes("pessoa"), false);
  });
});
