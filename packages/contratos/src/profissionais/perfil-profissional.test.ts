import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  editarAreaAtuacaoEntradaSchema,
  LIMITES_PERFIL_PROFISSIONAL,
  areaAtuacaoEntradaSchema,
  distanciaPublicaMetros,
  profissionalEncontradoSchema,
  salvarBaseProfissionalEntradaSchema,
  servicoDoPerfilEntradaSchema,
} from "./perfil-profissional.ts";

const ID = "0199aaaa-0000-7000-8000-000000000001";
const QUADRADO = [
  { latitude: -19.93, longitude: -43.95 },
  { latitude: -19.93, longitude: -43.93 },
  { latitude: -19.91, longitude: -43.93 },
  { latitude: -19.91, longitude: -43.95 },
];

describe("limites da primeira versão", () => {
  it("3 serviços, 5 áreas e raio de 50 km, num lugar só", () => {
    assert.deepEqual(
      { servicos: LIMITES_PERFIL_PROFISSIONAL.maximoServicos, areas: LIMITES_PERFIL_PROFISSIONAL.maximoAreas, raio: LIMITES_PERFIL_PROFISSIONAL.raioMaximoMetros },
      { servicos: 3, areas: 5, raio: 50_000 },
    );
  });
});

describe("área de atuação", () => {
  it("raio de 1 m a 50 km em metros inteiros", () => {
    assert.equal(areaAtuacaoEntradaSchema.safeParse({ modalidade: "raio", raioMetros: 50_000 }).success, true);
    assert.equal(areaAtuacaoEntradaSchema.safeParse({ modalidade: "raio", raioMetros: 50_001 }).success, false);
    assert.equal(areaAtuacaoEntradaSchema.safeParse({ modalidade: "raio", raioMetros: 0 }).success, false);
    assert.equal(areaAtuacaoEntradaSchema.safeParse({ modalidade: "raio", raioMetros: -5 }).success, false);
    assert.equal(areaAtuacaoEntradaSchema.safeParse({ modalidade: "raio", raioMetros: 1500.5 }).success, false);
  });

  it("vazio em servicoPerfilIds = vale para todos os serviços; repetidos são recusados", () => {
    const geral = areaAtuacaoEntradaSchema.parse({ modalidade: "raio", raioMetros: 5000 });
    assert.deepEqual(geral.servicoPerfilIds, []);
    assert.equal(areaAtuacaoEntradaSchema.safeParse({ modalidade: "raio", raioMetros: 5000, servicoPerfilIds: [ID, ID] }).success, false);
  });

  it("polígono que se cruza é recusado; polígono simples é aceito", () => {
    assert.equal(areaAtuacaoEntradaSchema.safeParse({ modalidade: "poligono", poligonos: [QUADRADO] }).success, true);
    const laco = [QUADRADO[0], QUADRADO[2], QUADRADO[1], QUADRADO[3]];
    assert.equal(areaAtuacaoEntradaSchema.safeParse({ modalidade: "poligono", poligonos: [laco] }).success, false);
    assert.equal(areaAtuacaoEntradaSchema.safeParse({ modalidade: "poligono", poligonos: [] }).success, false);
  });

  it("editar o desenho usa as MESMAS validações da criação", () => {
    assert.equal(editarAreaAtuacaoEntradaSchema.safeParse({ poligonos: [QUADRADO] }).success, true);
    const laco = [QUADRADO[0], QUADRADO[2], QUADRADO[1], QUADRADO[3]];
    assert.equal(editarAreaAtuacaoEntradaSchema.safeParse({ poligonos: [laco] }).success, false);
    assert.equal(editarAreaAtuacaoEntradaSchema.safeParse({ poligonos: [] }).success, false);
    assert.equal(editarAreaAtuacaoEntradaSchema.safeParse({}).success, false);
  });

  it("município só pelo código IBGE de 7 dígitos, nunca pelo nome", () => {
    assert.equal(areaAtuacaoEntradaSchema.safeParse({ modalidade: "municipio", codigoIbge: "3106200" }).success, true);
    assert.equal(areaAtuacaoEntradaSchema.safeParse({ modalidade: "municipio", codigoIbge: "Belo Horizonte" }).success, false);
  });

  it("uma área tem UMA modalidade: campos de outra modalidade não entram", () => {
    const area = areaAtuacaoEntradaSchema.parse({ modalidade: "raio", raioMetros: 3000, codigoIbge: "3106200" });
    assert.equal("codigoIbge" in area, false);
  });
});

describe("serviço do perfil", () => {
  it("especialidades/opções repetidas são recusadas", () => {
    assert.equal(servicoDoPerfilEntradaSchema.safeParse({ servicoId: ID, especialidadeIds: [ID, ID] }).success, false);
    assert.deepEqual(servicoDoPerfilEntradaSchema.parse({ servicoId: ID }), { servicoId: ID, especialidadeIds: [], opcaoIds: [] });
  });
});

describe("base profissional", () => {
  it("reaproveita o endereço do cliente (sem apelido) e aceita o código IBGE do CEP", () => {
    const base = salvarBaseProfissionalEntradaSchema.parse({
      cep: "32010-000",
      logradouro: "Rua A",
      numero: "10",
      bairro: "Centro",
      cidade: "Contagem",
      uf: "MG",
      codigoIbge: "3118601",
    });
    assert.equal(base.cep, "32010000");
    assert.equal(base.codigoIbge, "3118601");
    assert.equal(salvarBaseProfissionalEntradaSchema.safeParse({ ...base, codigoIbge: "31186" }).success, false);
  });
});

describe("privacidade do resultado público", () => {
  const publico = {
    identidadeId: ID,
    nomeExibicao: "Maria",
    nomeUsuario: "maria",
    servico: { id: ID, nome: "Entrega" },
    especialidades: [],
    regiao: { cidade: "Contagem", uf: "MG" },
    distanciaAproximadaMetros: 2500,
    atendeNoHorario: true,
  };

  it("aceita só os campos públicos", () => {
    assert.equal(profissionalEncontradoSchema.safeParse(publico).success, true);
  });

  it("recusa coordenada, endereço ou base, mesmo por engano", () => {
    for (const vazamento of [{ latitude: -19.9 }, { longitude: -43.9 }, { logradouro: "Rua A" }, { base: {} }, { cep: "32010000" }]) {
      assert.equal(profissionalEncontradoSchema.safeParse({ ...publico, ...vazamento }).success, false);
    }
    assert.equal(profissionalEncontradoSchema.safeParse({ ...publico, regiao: { ...publico.regiao, bairro: "Eldorado" } }).success, false);
  });

  it("distância pública é arredondada para cima e nunca revela a posição exata", () => {
    assert.equal(distanciaPublicaMetros(0), 1000);
    assert.equal(distanciaPublicaMetros(730), 1000);
    assert.equal(distanciaPublicaMetros(2_301), 2_500);
    assert.equal(distanciaPublicaMetros(9_999), 10_000);
    assert.equal(distanciaPublicaMetros(12_345), 13_000);
    assert.throws(() => distanciaPublicaMetros(-1), RangeError);
  });
});
