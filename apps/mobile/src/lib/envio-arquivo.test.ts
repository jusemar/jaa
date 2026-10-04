/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CABECALHO_IDENTIDADE_ATUANTE } from "@jaa/contratos";
import { CAMPO_ARQUIVO, enviarArquivoMultipart, montarFormularioArquivo, type DependenciasEnvio, type FormularioArquivo } from "./envio-arquivo.ts";

const ARQUIVO = { uri: "file:///data/user/0/jaa/cache/ImageManipulator/a.jpg", nome: "foto-perfil.jpg", tipo: "image/jpeg" };
const URL_FOTO = "https://pub-exemplo.r2.dev/avatar/x/y.webp";

class FormularioFalso implements FormularioArquivo {
  campos: [string, unknown][] = [];
  append(campo: string, valor: unknown) {
    this.campos.push([campo, valor]);
  }
}

function dependencias(resposta: { status: number; corpo: unknown } | "sem-rede") {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const deps: DependenciasEnvio = {
    urlApi: "http://10.0.2.2:3333",
    buscar: (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      if (resposta === "sem-rede") throw new TypeError("Network request failed");
      return new Response(JSON.stringify(resposta.corpo), { status: resposta.status });
    }) as typeof fetch,
    cabecalhos: async () => ({ Cookie: "jaa.session_token=sessao-de-teste", [CABECALHO_IDENTIDADE_ATUANTE]: "empresa-1" }),
    criarFormulario: () => new FormularioFalso(),
  };
  return { deps, chamadas };
}

describe("FormData do envio", () => {
  it("um único campo `arquivo` com uri, nome e tipo no formato do React Native", () => {
    const formulario = montarFormularioArquivo(new FormularioFalso(), ARQUIVO);
    assert.deepEqual(formulario.campos, [[CAMPO_ARQUIVO, { uri: ARQUIVO.uri, name: "foto-perfil.jpg", type: "image/jpeg" }]]);
    assert.equal(CAMPO_ARQUIVO, "arquivo", "mesmo campo que a API lê e a Web envia");
  });
});

describe("enviarArquivoMultipart", () => {
  it("POST na rota, com sessão e identidade atuante, SEM Content-Type manual (o runtime escreve o boundary)", async () => {
    const { deps, chamadas } = dependencias({ status: 200, corpo: { chave: "avatar/x/y.webp", url: URL_FOTO } });
    const resposta = await enviarArquivoMultipart(deps, "/perfil/foto", ARQUIVO);
    assert.deepEqual(resposta, { ok: true, status: 200, dados: { chave: "avatar/x/y.webp", url: URL_FOTO } });

    const [chamada] = chamadas;
    assert.ok(chamada);
    assert.equal(chamada.url, "http://10.0.2.2:3333/perfil/foto");
    assert.equal(chamada.init.method, "POST");
    const cabecalhos = chamada.init.headers as Record<string, string>;
    assert.equal(cabecalhos.Cookie, "jaa.session_token=sessao-de-teste");
    assert.equal(cabecalhos[CABECALHO_IDENTIDADE_ATUANTE], "empresa-1");
    assert.ok(!Object.keys(cabecalhos).some((nome) => nome.toLowerCase() === "content-type"));
    assert.ok(chamada.init.body instanceof FormularioFalso);
  });

  it("erro da API chega com status, código e mensagem reais", async () => {
    const { deps } = dependencias({ status: 413, corpo: { codigo: "ARQUIVO_INVALIDO", mensagem: "A imagem deve ter no máximo 8 MB." } });
    assert.deepEqual(await enviarArquivoMultipart(deps, "/perfil/foto", ARQUIVO), {
      ok: false,
      status: 413,
      codigo: "ARQUIVO_INVALIDO",
      mensagem: "A imagem deve ter no máximo 8 MB.",
    });
  });

  it("sem rede: status 0, sem lançar", async () => {
    const { deps } = dependencias("sem-rede");
    assert.deepEqual(await enviarArquivoMultipart(deps, "/perfil/foto", ARQUIVO), { ok: false, status: 0, codigo: null, mensagem: "Sem conexão com o servidor." });
  });

  it("resposta de sucesso fora do contrato não é aceita como foto salva", async () => {
    const { deps } = dependencias({ status: 200, corpo: { url: "não é url" } });
    assert.equal((await enviarArquivoMultipart(deps, "/perfil/foto", ARQUIVO)).ok, false);
  });
});
