import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { EnderecoDoCep } from "@jaa/contratos";
import type { ResultadoApi } from "@/lib/api";
import { criarConsultorCep, type SituacaoCep } from "./use-cep.ts";

const ENDERECO: EnderecoDoCep = {
  cep: "30668835",
  logradouro: "Rua Alameda Gabriel Pimenta",
  bairro: "Distrito Industrial do Jatobá (Eliana Silva)",
  cidade: "Belo Horizonte",
  uf: "MG",
  codigoIbge: "3106200",
  encontrado: true,
};
const ok: ResultadoApi<EnderecoDoCep> = { ok: true, status: 200, dados: ENDERECO };
const indisponivel: ResultadoApi<EnderecoDoCep> = { ok: false, status: 503, codigo: "CEP_INDISPONIVEL", mensagem: "x" };
const semConexao: ResultadoApi<EnderecoDoCep> = { ok: false, status: 0, codigo: null, mensagem: "Sem conexão com o servidor." };
const naoEncontrado: ResultadoApi<EnderecoDoCep> = { ok: false, status: 404, codigo: "CEP_NAO_ENCONTRADO", mensagem: "x" };

function montar(respostas: ResultadoApi<EnderecoDoCep>[]) {
  const pedidos: string[] = [];
  const preenchidos: EnderecoDoCep[] = [];
  const situacoes: SituacaoCep[] = [];
  const consultar = criarConsultorCep({
    requisitar: async (digitos) => {
      pedidos.push(digitos);
      return respostas.shift() ?? ok;
    },
    aoPreencher: (endereco) => preenchidos.push(endereco),
    aoMudarSituacao: (situacao) => situacoes.push(situacao),
  });
  return { consultar, pedidos, preenchidos, situacoes };
}

describe("preenchimento por CEP (regra do hook)", () => {
  it("30668835 com ou sem hífen consulta a API só com dígitos e preenche rua, bairro, cidade, UF e IBGE", async () => {
    const cep = montar([ok]);
    await cep.consultar("30668-835");
    assert.deepEqual(cep.pedidos, ["30668835"]);
    assert.deepEqual(cep.preenchidos, [ENDERECO]);
    assert.deepEqual(cep.situacoes, ["consultando", "preenchido"]);
  });

  it("menos de 8 dígitos não consulta", async () => {
    const cep = montar([]);
    await cep.consultar("3066883");
    assert.deepEqual(cep.pedidos, []);
    assert.deepEqual(cep.situacoes, ["ocioso"]);
  });

  it("o mesmo CEP respondido não é consultado de novo (digitar + sair do campo = uma consulta)", async () => {
    const cep = montar([ok]);
    await cep.consultar("30668835");
    await cep.consultar("30668-835");
    assert.equal(cep.pedidos.length, 1);
  });

  it("CEP inexistente: avisa, não preenche nada e não repete a consulta", async () => {
    const cep = montar([naoEncontrado]);
    await cep.consultar("00000000");
    await cep.consultar("00000000");
    assert.deepEqual(cep.preenchidos, []);
    assert.deepEqual(cep.situacoes, ["consultando", "nao-encontrado"]);
    assert.equal(cep.pedidos.length, 1);
  });

  it("indisponível ou sem conexão: o MESMO CEP pode ser consultado de novo, sem F5", async () => {
    for (const falha of [indisponivel, semConexao]) {
      const cep = montar([falha, ok]);
      await cep.consultar("30668835");
      assert.equal(cep.situacoes.at(-1), "indisponivel");
      assert.deepEqual(cep.preenchidos, []);
      await cep.consultar("30668835");
      assert.deepEqual(cep.pedidos, ["30668835", "30668835"]);
      assert.deepEqual(cep.preenchidos, [ENDERECO]);
      assert.equal(cep.situacoes.at(-1), "preenchido");
    }
  });

  it("formulários que usam o CEP reutilizam o MESMO hook (sem implementação duplicada)", () => {
    for (const arquivo of [
      "../components/formulario-endereco.tsx",
      "../../profissional/components/secao-base.tsx",
      "../../entregas/components/painel-operacional.tsx",
    ]) {
      const fonte = readFileSync(new URL(arquivo, import.meta.url), "utf8");
      assert.match(fonte, /useCep\(/, arquivo);
      // Nenhum formulário fala com provedor de CEP: só com a API do Jaa, pelo hook.
      assert.doesNotMatch(fonte, /viacep\.com|brasilapi\.com/i, arquivo);
    }
  });
});
