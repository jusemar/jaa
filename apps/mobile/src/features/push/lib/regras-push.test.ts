/// <reference types="node" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANAL_PUSH_MENSAGENS } from "@jaa/contratos";
import { apresentacaoEmPrimeiroPlano, canalAndroidDeMensagens, destinoDoToque, ofertaDeAvisos } from "./regras-push.ts";

const PESSOAL = "0199b000-0000-7000-8000-000000000001";
const EMPRESA = "0199b000-0000-7000-8000-000000000002";
const OUTRA = "0199b000-0000-7000-8000-000000000003";
const ID = "0199b000-0000-7000-8000-000000000004";
const operaveis = [{ identidadeId: PESSOAL }, { identidadeId: EMPRESA }];
const toque = (identidadeId: string) => ({ v: 1, evento: "nova-mensagem", identidadeId, conversaId: ID });

describe("push no app", () => {
  it("primeiro plano: nada de banner, bandeja, som ou selo — o realtime e o som do Jaaa já avisaram", () => {
    assert.deepEqual(apresentacaoEmPrimeiroPlano(), { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false });
  });

  it("toque na identidade já ativa: abre sem trocar", () => {
    assert.deepEqual(destinoDoToque(toque(PESSOAL), operaveis, PESSOAL), { tipo: "abrir", dados: toque(PESSOAL), trocarIdentidade: false });
  });

  it("toque em push da EMPRESA agindo como pessoa: abre trocando para a empresa", () => {
    const destino = destinoDoToque(toque(EMPRESA), operaveis, PESSOAL);
    assert.equal(destino.tipo === "abrir" && destino.trocarIdentidade, true);
  });

  it("identidade que a conta NÃO opera (outra conta no aparelho, vínculo removido) ou payload estranho: ignora", () => {
    assert.deepEqual(destinoDoToque(toque(OUTRA), operaveis, PESSOAL), { tipo: "ignorar" });
    assert.deepEqual(destinoDoToque({ ...toque(PESSOAL), v: 2 }, operaveis, PESSOAL), { tipo: "ignorar" });
    assert.deepEqual(destinoDoToque({ evento: "url", url: "https://exemplo" }, operaveis, PESSOAL), { tipo: "ignorar" });
    assert.deepEqual(destinoDoToque(null, operaveis, PESSOAL), { tipo: "ignorar" });
  });

  it("oferta de permissão: pede enquanto o Android pergunta; depois orienta às configurações; 'Agora não' encerra", () => {
    assert.equal(ofertaDeAvisos({ status: "undetermined", podePerguntar: true }, false), "pedir");
    assert.equal(ofertaDeAvisos({ status: "denied", podePerguntar: true }, false), "pedir");
    assert.equal(ofertaDeAvisos({ status: "denied", podePerguntar: false }, false), "configuracoes");
    assert.equal(ofertaDeAvisos({ status: "granted", podePerguntar: false }, false), "nenhuma");
    assert.equal(ofertaDeAvisos({ status: "undetermined", podePerguntar: true }, true), "nenhuma");
    assert.equal(ofertaDeAvisos(null, false), "nenhuma", "antes de saber a permissão, nada aparece");
  });

  it("canal Android: o mesmo id que o servidor manda, com o som padrão (sem `sound`)", () => {
    const canal = canalAndroidDeMensagens();
    assert.equal(canal.id, CANAL_PUSH_MENSAGENS);
    assert.equal("sound" in canal, false);
  });
});
