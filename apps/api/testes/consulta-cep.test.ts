import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { criarConsultaViaCep } from "../src/features/enderecos/lib/consulta-cep.js";

/*
 * ViaCEP com `fetch` FALSO: nenhum teste do Jaa chama a internet.
 * CEP preenche formulário — nunca confirma ponto geográfico.
 */

const resposta = (corpo: unknown, ok = true, status = 200) => ({ ok, status, json: async () => corpo }) as unknown as Response;

const comResposta = (devolver: (url: string) => Response | Promise<Response>, urls: string[] = []) =>
  criarConsultaViaCep({
    buscar: async (url) => {
      urls.push(url);
      return devolver(url);
    },
  });

describe("consulta de CEP (ViaCEP)", () => {
  it("preenche logradouro, bairro, cidade e UF", async () => {
    const urls: string[] = [];
    const consulta = comResposta(
      () => resposta({ cep: "30130-010", logradouro: "Avenida Afonso Pena", bairro: "Centro", localidade: "Belo Horizonte", uf: "MG" }),
      urls,
    );

    const resultado = await consulta.consultar("30130-010");
    assert.equal(resultado.tipo, "encontrado");
    if (resultado.tipo !== "encontrado") return;
    assert.deepEqual(resultado.endereco, {
      cep: "30130010",
      logradouro: "Avenida Afonso Pena",
      bairro: "Centro",
      cidade: "Belo Horizonte",
      uf: "MG",
    });
    assert.equal(urls[0], "https://viacep.com.br/ws/30130010/json/", "o CEP vai normalizado, só com dígitos");
    // CEP não traz (nem confirma) coordenada: isso continua sendo a confirmação no mapa.
    assert.equal(JSON.stringify(resultado).includes("latitude"), false);
  });

  it("resposta incompleta (CEP geral de cidade) devolve o que existe, sem inventar o resto", async () => {
    const consulta = comResposta(() => resposta({ cep: "30000-000", logradouro: "", bairro: "", localidade: "Belo Horizonte", uf: "MG" }));
    const resultado = await consulta.consultar("30000000");
    assert.equal(resultado.tipo, "encontrado");
    if (resultado.tipo !== "encontrado") return;
    assert.equal(resultado.endereco.logradouro, null);
    assert.equal(resultado.endereco.bairro, null);
    assert.equal(resultado.endereco.cidade, "Belo Horizonte");
  });

  it("CEP inexistente é 'não encontrado' (o ViaCEP responde 200 com erro)", async () => {
    const consulta = comResposta(() => resposta({ erro: "true" }));
    assert.equal((await consulta.consultar("99999999")).tipo, "nao-encontrado");

    const comBooleano = comResposta(() => resposta({ erro: true }));
    assert.equal((await comBooleano.consultar("99999999")).tipo, "nao-encontrado");
  });

  it("CEP com formato inválido nem chega ao provedor", async () => {
    const urls: string[] = [];
    const consulta = comResposta(() => resposta({}), urls);
    assert.equal((await consulta.consultar("123")).tipo, "nao-encontrado");
    assert.deepEqual(urls, []);
  });

  it("provedor fora do ar ou resposta inesperada não trava o cadastro", async () => {
    const comErroHttp = comResposta(() => resposta({}, false, 500));
    assert.equal((await comErroHttp.consultar("30130010")).tipo, "indisponivel");

    const comCorpoEstranho = criarConsultaViaCep({
      buscar: async () => ({ ok: true, status: 200, json: async () => "isto não é json de endereço" }) as unknown as Response,
    });
    assert.equal((await comCorpoEstranho.consultar("30130010")).tipo, "indisponivel");

    const semRede = criarConsultaViaCep({
      buscar: async () => {
        throw new Error("sem rede");
      },
    });
    assert.equal((await semRede.consultar("30130010")).tipo, "indisponivel");
  });
});
