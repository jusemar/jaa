import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  criarConsultaBrasilApi,
  criarConsultaCepComReserva,
  criarConsultaViaCep,
  type ConsultaCep,
  type ResultadoConsultaCep,
} from "../src/features/enderecos/lib/consulta-cep.js";

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
      () => resposta({ cep: "30130-010", logradouro: "Avenida Afonso Pena", bairro: "Centro", localidade: "Belo Horizonte", uf: "MG", ibge: "3106200" }),
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
      codigoIbge: "3106200",
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

describe("consulta de CEP (BrasilAPI, provedor de reserva)", () => {
  it("normaliza para o MESMO formato do ViaCEP, com o código IBGE", async () => {
    const urls: string[] = [];
    const consulta = criarConsultaBrasilApi({
      buscar: async (url) => {
        urls.push(url);
        return resposta({
          cep: "30668835",
          state: "MG",
          city: "Belo Horizonte",
          neighborhood: "Distrito Industrial do Jatobá (Eliana Silva)",
          street: "Rua Alameda Gabriel Pimenta",
          service: "open-cep",
          ibge: { city: "3106200", state: "31" },
        });
      },
    });
    assert.deepEqual(await consulta.consultar("30668-835"), {
      tipo: "encontrado",
      endereco: {
        cep: "30668835",
        logradouro: "Rua Alameda Gabriel Pimenta",
        bairro: "Distrito Industrial do Jatobá (Eliana Silva)",
        cidade: "Belo Horizonte",
        uf: "MG",
        codigoIbge: "3106200",
      },
    });
    assert.equal(urls[0], "https://brasilapi.com.br/api/cep/v1/30668835");
  });

  it("404 é 'não encontrado'; erro HTTP, corpo estranho ou sem rede é 'indisponível'", async () => {
    const com = (devolver: () => Promise<Response>) => criarConsultaBrasilApi({ buscar: devolver });
    assert.equal((await com(async () => resposta({ message: "CEP não encontrado" }, false, 404)).consultar("99999999")).tipo, "nao-encontrado");
    assert.equal((await com(async () => resposta({}, false, 500)).consultar("30130010")).tipo, "indisponivel");
    assert.equal((await com(async () => resposta("texto")).consultar("30130010")).tipo, "indisponivel");
    assert.equal(
      (
        await com(async () => {
          throw new Error("sem rede");
        }).consultar("30130010")
      ).tipo,
      "indisponivel",
    );
  });
});

describe("consulta de CEP com reserva", () => {
  const fixo = (resultado: ResultadoConsultaCep, chamadas: string[], nome: string): ConsultaCep => ({
    consultar: async () => {
      chamadas.push(nome);
      return resultado;
    },
  });
  const encontrado: ResultadoConsultaCep = {
    tipo: "encontrado",
    endereco: { cep: "30668835", logradouro: "Rua A", bairro: "B", cidade: "Belo Horizonte", uf: "MG", codigoIbge: "3106200" },
  };

  it("principal respondeu (encontrado ou não encontrado): a reserva NÃO é consultada", async () => {
    for (const resultado of [encontrado, { tipo: "nao-encontrado" } as const]) {
      const chamadas: string[] = [];
      const consulta = criarConsultaCepComReserva(fixo(resultado, chamadas, "viacep"), fixo(encontrado, chamadas, "brasilapi"));
      assert.deepEqual(await consulta.consultar("30668835"), resultado);
      assert.deepEqual(chamadas, ["viacep"]);
    }
  });

  it("principal INDISPONÍVEL: a reserva responde no mesmo formato", async () => {
    const chamadas: string[] = [];
    const consulta = criarConsultaCepComReserva(fixo({ tipo: "indisponivel" }, chamadas, "viacep"), fixo(encontrado, chamadas, "brasilapi"));
    assert.deepEqual(await consulta.consultar("30668835"), encontrado);
    assert.deepEqual(chamadas, ["viacep", "brasilapi"]);
  });

  it("os dois fora: continua 'indisponível' (o formulário segue no preenchimento manual)", async () => {
    const chamadas: string[] = [];
    const consulta = criarConsultaCepComReserva(fixo({ tipo: "indisponivel" }, chamadas, "viacep"), fixo({ tipo: "indisponivel" }, chamadas, "brasilapi"));
    assert.equal((await consulta.consultar("30668835")).tipo, "indisponivel");
  });

  it("ViaCEP sem conexão (o caso real do ambiente) cai na BrasilAPI de verdade, pelo fetch falso", async () => {
    const urls: string[] = [];
    const buscar = async (url: string) => {
      urls.push(url);
      if (url.includes("viacep")) throw new TypeError("fetch failed");
      return resposta({ cep: "30668835", state: "MG", city: "Belo Horizonte", neighborhood: "Jatobá", street: "Rua Alameda Gabriel Pimenta", ibge: { city: "3106200" } });
    };
    const consulta = criarConsultaCepComReserva(criarConsultaViaCep({ buscar }), criarConsultaBrasilApi({ buscar }));
    const resultado = await consulta.consultar("30668835");
    assert.equal(resultado.tipo, "encontrado");
    assert.equal(urls.length, 2);
  });
});
