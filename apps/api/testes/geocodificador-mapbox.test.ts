import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { criarGeocodificadorMapbox } from "../src/features/enderecos/lib/geocodificador-mapbox.js";

const endereco = {
  cep: "30880-020",
  logradouro: "Rua Eneida",
  numero: "33",
  bairro: "Glória",
  cidade: "Belo Horizonte",
  uf: "MG",
};

function feature({
  longitude,
  latitude,
  cep,
  numero = "33",
  rua = "Rua Eneida",
  bairro = "Glória",
  cidade = "Belo Horizonte",
  uf = "MG",
  tipo = "address",
  confianca = "exact",
}: {
  longitude: number;
  latitude: number;
  cep?: string;
  numero?: string;
  rua?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  tipo?: string;
  confianca?: string;
}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: {
      feature_type: tipo,
      coordinates: { longitude, latitude, accuracy: "rooftop" },
      match_code: {
        address_number: numero === endereco.numero ? "matched" : "unmatched",
        street: rua === endereco.logradouro ? "matched" : "unmatched",
        postcode: cep?.replace(/\D/g, "") === endereco.cep.replace(/\D/g, "") ? "matched" : cep ? "unmatched" : "not_applicable",
        place: cidade === endereco.cidade ? "matched" : "unmatched",
        region: uf === endereco.uf ? "matched" : "unmatched",
        country: "inferred",
        confidence: confianca,
      },
      context: {
        address: { address_number: numero, street_name: rua, name: `${numero} ${rua}` },
        street: { name: rua },
        ...(cep ? { postcode: { name: cep } } : {}),
        neighborhood: { name: bairro },
        place: { name: cidade },
        region: { name: "Minas Gerais", region_code: uf, region_code_full: `BR-${uf}` },
        country: { name: "Brasil", country_code: "BR" },
      },
    },
  };
}

function resposta(features: unknown[]): Response {
  return new Response(JSON.stringify({ type: "FeatureCollection", features }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("geocodificação Mapbox v6", () => {
  it("usa entrada estruturada server-side e escolhe pelo CEP, não pela primeira posição", async () => {
    let chamada = "";
    const geocodificador = criarGeocodificadorMapbox({
      token: "token-secreto",
      urlBase: "https://mapbox.teste",
      buscar: async (url) => {
        chamada = url;
        return resposta([
          feature({ longitude: -43.97, latitude: -19.91, cep: "30870-020" }),
          feature({ longitude: -43.991, latitude: -19.918, cep: "30880020" }),
        ]);
      },
    });

    assert.deepEqual(await geocodificador.sugerir(endereco), { longitude: -43.991, latitude: -19.918 });
    const url = new URL(chamada);
    assert.equal(url.pathname, "/search/geocode/v6/forward");
    assert.equal(url.searchParams.get("address_number"), "33");
    assert.equal(url.searchParams.get("street"), "Rua Eneida");
    assert.equal(url.searchParams.get("postcode"), "30880-020");
    assert.equal(url.searchParams.get("country"), "br");
    assert.equal(url.searchParams.get("autocomplete"), "false");
    assert.equal(url.searchParams.get("permanent"), "true");
  });

  it("formata o CEP para o match_code da v6 e aceita o endereço real da Rua Sílvio Giuseppe Rosso, 24", async () => {
    let cepEnviado = "";
    const geocodificador = criarGeocodificadorMapbox({
      token: "segredo",
      buscar: async (url) => {
        cepEnviado = new URL(url).searchParams.get("postcode") ?? "";
        return resposta([
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-44.01567, -20.004977] },
            properties: {
              feature_type: "address",
              coordinates: { longitude: -44.01567, latitude: -20.004977, accuracy: "rooftop" },
              match_code: {
                address_number: "matched",
                street: "matched",
                postcode: "matched",
                place: "matched",
                region: "matched",
                locality: "not_applicable",
                country: "matched",
                confidence: "exact",
              },
              context: {
                address: { address_number: "24", street_name: "Rua Silvio Giusepe Rosso", name: "Rua Silvio Giusepe Rosso 24" },
                street: { name: "Rua Silvio Giusepe Rosso" },
                neighborhood: { name: "Novo Santa Cecilia" },
                postcode: { name: "30626-497" },
                locality: { name: "Barreiro" },
                place: { name: "Belo Horizonte" },
                region: { name: "Minas Gerais", region_code: "MG", region_code_full: "BR-MG" },
                country: { name: "Brasil", country_code: "BR" },
              },
            },
          },
        ]);
      },
    });

    const resultado = await geocodificador.sugerir({
      cep: "30626497",
      logradouro: "Rua Sílvio Giuseppe Rosso",
      numero: "24",
      bairro: "Novo Santa Cecília (Barreiro)",
      cidade: "Belo Horizonte",
      uf: "MG",
    });

    assert.equal(cepEnviado, "30626-497");
    assert.deepEqual(resultado, { longitude: -44.01567, latitude: -20.004977 });
  });

  it("prefere rua e número exatos, mas aceita aproximação compatível quando o número não existe", async () => {
    const exato = criarGeocodificadorMapbox({
      token: "segredo",
      buscar: async () =>
        resposta([
          feature({ longitude: -43.95, latitude: -19.95, cep: "30880020", tipo: "street", numero: "", confianca: "medium" }),
          feature({ longitude: -43.991, latitude: -19.918, cep: "30880020" }),
        ]),
    });
    assert.deepEqual(await exato.sugerir(endereco), { longitude: -43.991, latitude: -19.918 });

    const aproximado = criarGeocodificadorMapbox({
      token: "segredo",
      buscar: async () => resposta([feature({ longitude: -43.95, latitude: -19.95, cep: "30880020", tipo: "street", numero: "", confianca: "medium" })]),
    });
    assert.deepEqual(await aproximado.sugerir(endereco), { longitude: -43.95, latitude: -19.95 });
  });

  it("recusa cidade, UF ou CEP conflitantes e falha externa sem inventar coordenada", async () => {
    for (const candidato of [
      feature({ longitude: -43, latitude: -19, cep: "30123000", cidade: "Contagem" }),
      feature({ longitude: -43, latitude: -19, cep: "30123000", uf: "SP" }),
      feature({ longitude: -43, latitude: -19, cep: "30123000" }),
    ]) {
      const geocodificador = criarGeocodificadorMapbox({ token: "segredo", buscar: async () => resposta([candidato]) });
      assert.equal(await geocodificador.sugerir(endereco), null);
    }

    const indisponivel = criarGeocodificadorMapbox({ token: "segredo", buscar: async () => new Response("erro", { status: 503 }) });
    assert.equal(await indisponivel.sugerir(endereco), null);
  });
});
