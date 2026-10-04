/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fotoDoAvatar } from "../../../components/ui/foto-avatar.ts";
import type { ArquivoLocal } from "../../../lib/envio-arquivo.ts";
import {
  LADO_MAXIMO_ENVIO,
  NOME_ENVIO,
  TIPO_ENVIO,
  interpretarResultadoSeletor,
  mensagemDeFalhaFoto,
  opcoesDaFoto,
  reducaoParaEnvio,
  removerFotoDoPerfil,
  trocarFotoDoPerfil,
  type DependenciasTrocaFoto,
  type FalhaApi,
  type ObtencaoFoto,
} from "./foto-perfil.ts";

const IMAGEM = { uri: "file:///cache/ImagePicker/crop.jpeg", largura: 3000, altura: 3000 };

/*
 * Simula a tela: `fotoNaTela` só muda quando `aoConcluir` roda (a tela relê o perfil depois do
 * sucesso). Assim dá para provar que falha mantém a foto anterior.
 */
function cenario(opcoes: { obtida?: ObtencaoFoto; resposta?: { ok: true } | FalhaApi; prepararFalha?: boolean } = {}) {
  const estado = { fotoNaTela: "https://pub-exemplo.r2.dev/avatar/a.webp" as string | null, enviados: [] as ArquivoLocal[], preparadas: 0 };
  const deps: DependenciasTrocaFoto = {
    obter: async () => opcoes.obtida ?? { tipo: "imagem", imagem: IMAGEM },
    preparar: async (imagem) => {
      estado.preparadas += 1;
      if (opcoes.prepararFalha) throw new Error("não decodificou");
      return { uri: imagem.uri.replace("crop.jpeg", "reduzida.jpg"), tamanhoBytes: null };
    },
    enviar: async (arquivo) => {
      estado.enviados.push(arquivo);
      return opcoes.resposta ?? { ok: true };
    },
    aoConcluir: async () => {
      estado.fotoNaTela = "https://pub-exemplo.r2.dev/avatar/b.webp";
    },
  };
  return { estado, deps };
}

describe("trocar a foto do perfil", () => {
  it("sucesso: envia o arquivo PREPARADO (sempre JPEG) e só então a tela mostra a foto nova", async () => {
    const { estado, deps } = cenario();
    assert.deepEqual(await trocarFotoDoPerfil("galeria", deps), { tipo: "concluido", mensagem: "Foto atualizada." });
    assert.deepEqual(estado.enviados, [{ uri: "file:///cache/ImagePicker/reduzida.jpg", nome: NOME_ENVIO, tipo: TIPO_ENVIO }]);
    assert.equal(TIPO_ENVIO, "image/jpeg");
    assert.equal(estado.fotoNaTela, "https://pub-exemplo.r2.dev/avatar/b.webp");
  });

  it("falha da API: mensagem real e a foto ANTERIOR continua na tela", async () => {
    const falha: FalhaApi = { ok: false, status: 429, codigo: "LIMITE_DE_ENVIOS_ATINGIDO", mensagem: "Muitos envios de imagem seguidos. Tente de novo em 7 min." };
    const { estado, deps } = cenario({ resposta: falha });
    assert.deepEqual(await trocarFotoDoPerfil("camera", deps), { tipo: "falha", mensagem: falha.mensagem });
    assert.equal(estado.fotoNaTela, "https://pub-exemplo.r2.dev/avatar/a.webp");
  });

  it("cancelar câmera ou galeria não é erro e não envia nada", async () => {
    const { estado, deps } = cenario({ obtida: { tipo: "cancelado" } });
    assert.deepEqual(await trocarFotoDoPerfil("camera", deps), { tipo: "cancelado" });
    assert.equal(estado.preparadas, 0);
    assert.equal(estado.enviados.length, 0);
  });

  it("permissão de câmera negada: mensagem clara, sem envio, o resto do app segue", async () => {
    const { estado, deps } = cenario({ obtida: { tipo: "permissao-negada" } });
    const resultado = await trocarFotoDoPerfil("camera", deps);
    assert.equal(resultado.tipo, "permissao-negada");
    assert.match(resultado.tipo === "permissao-negada" ? resultado.mensagem : "", /galeria/);
    assert.equal(estado.enviados.length, 0);
  });

  it("formato que o aparelho não consegue ler (ou não é imagem) não segue para a API", async () => {
    for (const opcoes of [{ prepararFalha: true }, { obtida: { tipo: "formato-invalido" } as const }]) {
      const { estado, deps } = cenario(opcoes);
      const resultado = await trocarFotoDoPerfil("galeria", deps);
      assert.equal(resultado.tipo, "falha");
      assert.equal(estado.enviados.length, 0);
      assert.equal(estado.fotoNaTela, "https://pub-exemplo.r2.dev/avatar/a.webp");
    }
  });
});

describe("remover a foto do perfil", () => {
  it("sucesso: a tela relê (fotoUrl null → iniciais); falha: a foto atual continua", async () => {
    let releu = 0;
    assert.deepEqual(await removerFotoDoPerfil({ remover: async () => ({ ok: true }), aoConcluir: async () => void (releu += 1) }), { tipo: "concluido", mensagem: "Foto removida." });
    assert.equal(releu, 1);

    const falha = await removerFotoDoPerfil({ remover: async () => ({ ok: false, status: 0, codigo: null, mensagem: "Sem conexão com o servidor." }), aoConcluir: async () => void (releu += 1) });
    assert.equal(falha.tipo, "falha");
    assert.equal(releu, 1, "sem sucesso, nada é relido nem trocado na tela");
  });
});

describe("seletor do sistema", () => {
  it("cancelado ou sem ativo = cancelado; imagem = uri e dimensões", () => {
    assert.deepEqual(interpretarResultadoSeletor({ canceled: true, assets: null }), { tipo: "cancelado" });
    assert.deepEqual(interpretarResultadoSeletor({ canceled: false, assets: [] }), { tipo: "cancelado" });
    assert.deepEqual(interpretarResultadoSeletor({ canceled: false, assets: [{ uri: "file:///a.jpeg", width: 800, height: 600, type: "image" }] }), {
      tipo: "imagem",
      imagem: { uri: "file:///a.jpeg", largura: 800, altura: 600 },
    });
  });

  it("vídeo (ou outro tipo) não é aceito como foto", () => {
    assert.deepEqual(interpretarResultadoSeletor({ canceled: false, assets: [{ uri: "file:///v.mp4", width: 1, height: 1, type: "video" }] }), { tipo: "formato-invalido" });
  });

  it("redução só quando passa de 1024 px, pelo lado maior; nunca amplia", () => {
    assert.equal(reducaoParaEnvio(800, 600), null);
    assert.equal(reducaoParaEnvio(LADO_MAXIMO_ENVIO, LADO_MAXIMO_ENVIO), null);
    assert.deepEqual(reducaoParaEnvio(4000, 3000), { width: 1024 });
    assert.deepEqual(reducaoParaEnvio(3000, 4000), { height: 1024 });
  });

  it("menu: remover só aparece quando há foto", () => {
    assert.deepEqual(opcoesDaFoto(false), ["camera", "galeria"]);
    assert.deepEqual(opcoesDaFoto(true), ["camera", "galeria", "remover"]);
  });
});

describe("mensagens de falha", () => {
  it("rede e sessão têm texto próprio; arquivo, limite e armazenamento usam a mensagem da API", () => {
    assert.match(mensagemDeFalhaFoto({ ok: false, status: 0, codigo: null, mensagem: "x" }), /Sem conexão/);
    assert.match(mensagemDeFalhaFoto({ ok: false, status: 401, codigo: "NAO_AUTENTICADO", mensagem: "x" }), /sessão expirou/);
    assert.equal(mensagemDeFalhaFoto({ ok: false, status: 413, codigo: "ARQUIVO_INVALIDO", mensagem: "A imagem deve ter no máximo 8 MB." }), "A imagem deve ter no máximo 8 MB.");
    assert.equal(mensagemDeFalhaFoto({ ok: false, status: 503, codigo: "ARMAZENAMENTO_INDISPONIVEL", mensagem: "O envio de imagens ainda não está configurado neste ambiente." }), "O envio de imagens ainda não está configurado neste ambiente.");
  });
});

describe("avatar: foto ou iniciais", () => {
  it("foto na identidade → imagem; null ou ausente → iniciais; a prop prevalece", () => {
    assert.equal(fotoDoAvatar({ fotoUrl: "https://pub-exemplo.r2.dev/a.webp" }), "https://pub-exemplo.r2.dev/a.webp");
    assert.equal(fotoDoAvatar({ fotoUrl: null }), null);
    assert.equal(fotoDoAvatar({}), null);
    assert.equal(fotoDoAvatar({ fotoUrl: "https://pub-exemplo.r2.dev/a.webp" }, null), null);
    assert.equal(fotoDoAvatar({ fotoUrl: null }, "https://pub-exemplo.r2.dev/b.webp"), "https://pub-exemplo.r2.dev/b.webp");
  });
});
