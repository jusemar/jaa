import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { IntencaoProfissional, ResultadoBusca } from "@jaa/contratos";
import { filtrosDaPesquisa, organizarResultados, textoSemResultados } from "./pesquisa-jaa.ts";

const id = (n: number) => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;
const item = (n: number, tipo: "pessoal" | "empresarial", nome: string, ehContato = false) =>
  ({ identidade: { identidadeId: id(n), tipo, nomeExibicao: nome, nomeUsuario: nome.toLowerCase().replace(/\s/g, ""), fotoUrl: null }, apelido: null, ehContato }) as ResultadoBusca;
const intencao = (rotulo: string) => ({ servicoId: id(9), especialidadeId: null, opcaoId: null, rotulo, exata: false }) as unknown as IntencaoProfissional;

const resultado = { contatos: [item(1, "pessoal", "Moto Zé", true), item(2, "empresarial", "Moto Peças", true)], externos: [item(3, "empresarial", "Motoboy Express"), item(4, "pessoal", "Motoca Silva")] };
const intencoes = [intencao("Mototáxi"), intencao("Entregador · Moto")];
const nomes = (itens: ResultadoBusca[]) => itens.map((entrada) => entrada.identidade.nomeExibicao);

describe("pesquisar no Jaaa: resultados por tipo e filtros", () => {
  it("TUDO: Profissionais, Empresas e Pessoas — contatos primeiro dentro de cada grupo", () => {
    const tudo = organizarResultados(resultado, intencoes, "tudo");
    assert.deepEqual(tudo.profissionais.map((entrada) => entrada.rotulo), ["Mototáxi", "Entregador · Moto"]);
    assert.deepEqual(nomes(tudo.empresas), ["Moto Peças", "Motoboy Express"]);
    assert.deepEqual(nomes(tudo.pessoas), ["Moto Zé", "Motoca Silva"]);
    assert.equal(tudo.vazio, false);
  });

  it("cada filtro mostra só o seu grupo, sem consultar de novo", () => {
    const pessoas = organizarResultados(resultado, intencoes, "pessoas");
    assert.deepEqual([pessoas.profissionais.length, pessoas.empresas.length, pessoas.pessoas.length], [0, 0, 2]);
    const profissionais = organizarResultados(resultado, intencoes, "profissionais");
    assert.deepEqual([profissionais.profissionais.length, profissionais.empresas.length, profissionais.pessoas.length], [2, 0, 0]);
    const empresas = organizarResultados(resultado, intencoes, "empresas");
    assert.deepEqual([empresas.profissionais.length, empresas.empresas.length, empresas.pessoas.length], [0, 2, 0]);
  });

  it("vazio por filtro diz ONDE não achou; sem resultado nenhum, mensagem simples", () => {
    assert.equal(organizarResultados({ contatos: [], externos: [] }, intencoes, "empresas").vazio, true);
    assert.equal(organizarResultados(null, [], "tudo").vazio, true);
    assert.equal(textoSemResultados("moto", "empresas"), "Nada encontrado em Empresas para “moto”.");
    assert.equal(textoSemResultados("moto", "tudo"), "Nada encontrado para “moto”.");
  });

  it("'Profissionais' só é oferecido onde a busca de profissionais existe", () => {
    assert.deepEqual(filtrosDaPesquisa(true), ["tudo", "pessoas", "profissionais", "empresas"]);
    assert.deepEqual(filtrosDaPesquisa(false), ["tudo", "pessoas", "empresas"]);
  });

  it("na tela: atividade aparece só pelo nome (sem frase longa) e abre a MESMA busca de profissionais", () => {
    const tela = readFileSync(new URL("../components/pesquisa-jaa.tsx", import.meta.url), "utf8");
    assert.equal(tela.includes("perto de um local"), false);
    assert.equal(tela.includes("Você procura"), false);
    assert.ok(tela.includes("onClick={() => setIntencaoAberta(intencao)}"));
    assert.ok(tela.includes("<BuscaProfissionais intencao={intencaoAberta}"));
    assert.ok(tela.includes("data-filtro-pesquisa={opcao}"));
    // As duas consultas de sempre — nenhuma nova.
    assert.equal((tela.match(/pesquisarNoJaa\(/g) ?? []).length, 1);
    assert.equal((tela.match(/listarIntencoesProfissionais\(/g) ?? []).length, 1);
  });
});
