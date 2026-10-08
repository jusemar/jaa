import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { empresas, identidades, membrosEmpresa } from "@jaa/banco/schema";
import { MAXIMO_EMPRESAS_CRIADAS_POR_CONTA, type Empresa, type EntregadorDaEmpresa, type ListaEmpresas } from "@jaa/contratos";
import { count, eq } from "drizzle-orm";
import { inserirEmpresaComProprietario } from "../src/features/empresas/repositorios/repositorio-empresas.js";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * LIMITE DE CRIAÇÃO: cada conta CRIA no máximo uma empresa — regra da API, com o valor REAL do produto
 * (os demais testes de integração rodam sem limite para poder montar várias empresas do mesmo dono).
 * O limite é só de CRIAR: participar de outras empresas por vínculo continua permitido.
 */
const PREFIXO = `lim${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987659901", "+5531987659902", "+5531987659903", "+5531987659904"],
  prefixoIp: "198.18.98.",
  maximoEmpresasCriadasPorConta: MAXIMO_EMPRESAS_CRIADAS_POR_CONTA,
});

let ana: Pessoa;
let bruno: Pessoa;
let caio: Pessoa;
let dora: Pessoa;
let empresaDaAna: Empresa;
let empresaDoBruno: Empresa;

const dados = (sufixo: string) => ({ nome: `Empresa ${sufixo}`, nomeUsuario: `${PREFIXO}_${sufixo}`, slug: `${PREFIXO}-${sufixo}` });
const criar = (pessoa: Pessoa, sufixo: string) => ctx.api(pessoa, "POST", "/empresas", dados(sufixo));

// A conta da pessoa (o vínculo de proprietário é da CONTA, não da identidade).
async function contaDe(pessoa: Pessoa): Promise<string> {
  const [linha] = await ctx.banco.select({ usuarioId: identidades.usuarioId }).from(identidades).where(eq(identidades.id, pessoa.identidadeId));
  assert.ok(linha?.usuarioId);
  return linha.usuarioId;
}

async function empresasCriadasPor(pessoa: Pessoa) {
  const [linha] = await ctx.banco.select({ total: count() }).from(membrosEmpresa).where(eq(membrosEmpresa.usuarioId, await contaDe(pessoa)));
  return linha?.total ?? 0;
}

before(async () => {
  await ctx.iniciar();
  ana = await ctx.criarPessoa(0, `${PREFIXO}_ana`, "Ana Dona");
  bruno = await ctx.criarPessoa(1, `${PREFIXO}_bruno`, "Bruno Dono");
  caio = await ctx.criarPessoa(2, `${PREFIXO}_caio`, "Caio Antigo");
  dora = await ctx.criarPessoa(3, `${PREFIXO}_dora`, "Dora Apressada");
});

after(() => ctx.encerrar());

describe("cada conta cria no máximo uma empresa", () => {
  it("a regra do produto é UMA", () => {
    assert.equal(MAXIMO_EMPRESAS_CRIADAS_POR_CONTA, 1);
  });

  it("a PRIMEIRA empresa é criada normalmente", async () => {
    const resposta = await criar(ana, "a1");
    assert.equal(resposta.statusCode, 201, resposta.body);
    empresaDaAna = resposta.json();
    assert.equal(empresaDaAna.papel, "proprietario");
  });

  it("a SEGUNDA empresa da mesma pessoa é recusada com mensagem clara, e nada é criado", async () => {
    const antes = await empresasCriadasPor(ana);
    const resposta = await criar(ana, "a2");
    assert.equal(resposta.statusCode, 409);
    assert.deepEqual(resposta.json(), { codigo: "LIMITE_DE_EMPRESAS_ATINGIDO", mensagem: "Você já possui uma empresa criada." });
    assert.equal(await empresasCriadasPor(ana), antes);
    const [sobra] = await ctx.banco.select({ total: count() }).from(empresas).where(eq(empresas.slug, `${PREFIXO}-a2`));
    assert.equal(sobra?.total, 0, "nenhuma empresa órfã");
  });

  it("repetir a MESMA criação (retry) devolve a empresa já criada, não 'limite atingido'", async () => {
    const resposta = await criar(ana, "a1");
    assert.equal(resposta.statusCode, 200, resposta.body);
    assert.equal((resposta.json() as Empresa).id, empresaDaAna.id);
  });

  it("o limite é por conta: outra pessoa cria a dela", async () => {
    const resposta = await criar(bruno, "b1");
    assert.equal(resposta.statusCode, 201, resposta.body);
    empresaDoBruno = resposta.json();
  });

  it("duas criações SIMULTÂNEAS da mesma pessoa: só uma passa", async () => {
    const respostas = await Promise.all([criar(dora, "d1"), criar(dora, "d2")]);
    assert.deepEqual(respostas.map((resposta) => resposta.statusCode).sort(), [201, 409]);
    assert.equal(await empresasCriadasPor(dora), 1);
  });
});

describe("o limite é só de CRIAR: vínculos e empresas existentes continuam", () => {
  it("quem já criou a sua empresa ainda pode trabalhar para OUTRA por vínculo (entregador)", async () => {
    const convite = await ctx.api(bruno, "POST", `/empresas/${empresaDoBruno.id}/entregadores`, { nomeUsuario: `${PREFIXO}_ana` });
    assert.equal(convite.statusCode, 201, convite.body);
    const vinculo: EntregadorDaEmpresa = convite.json();
    assert.equal((await ctx.api(ana, "POST", `/entregas/convites/${vinculo.id}`, { resposta: "aceitar" })).statusCode, 200);
    // E continua dona da empresa dela, com acesso normal.
    assert.equal((await ctx.api(ana, "GET", `/empresas/${empresaDaAna.id}`)).statusCode, 200);
    // O vínculo de entregadora não dá acesso administrativo à empresa do outro (regra de sempre).
    assert.equal((await ctx.api(ana, "GET", `/empresas/${empresaDoBruno.id}`)).statusCode, 404);
  });

  it("conta que JÁ tinha duas empresas (anteriores à regra) mantém as duas, intactas e acessíveis", async () => {
    // Estado anterior à regra: gravado direto, sem passar pelo limite.
    const usuarioId = await contaDe(caio);
    const primeira = await inserirEmpresaComProprietario(ctx.banco, { usuarioId, ...dados("c1") });
    const segunda = await inserirEmpresaComProprietario(ctx.banco, { usuarioId, ...dados("c2") });

    const lista: ListaEmpresas = (await ctx.api(caio, "GET", "/empresas")).json();
    assert.deepEqual(lista.empresas.map((empresa) => empresa.id).sort(), [primeira, segunda].sort());
    for (const id of [primeira, segunda]) {
      assert.equal((await ctx.api(caio, "GET", `/empresas/${id}`)).statusCode, 200);
      assert.equal((await ctx.api(caio, "PATCH", `/empresas/${id}`, { nome: `Renomeada ${id.slice(0, 4)}` })).statusCode, 200);
    }
    // Só a criação de MAIS uma é recusada.
    assert.equal((await criar(caio, "c3")).statusCode, 409);
    assert.equal(await empresasCriadasPor(caio), 2);
  });
});
