import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { perfisProfissionais } from "@jaa/banco/schema";
import {
  baseEmpresaSchema,
  empresaSchema,
  paginaProfissionaisEncontradosSchema,
  respostaBuscaSchema,
  respostaIntencoesProfissionaisSchema,
  respostaPerfilProfissionalSchema,
  sugestaoLocalizacaoSchema,
  TAMANHO_PAGINA_BUSCA_PROFISSIONAIS,
} from "@jaa/contratos";
import { inArray } from "drizzle-orm";
import { como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * BUSCA DE PROFISSIONAIS pela API ("Pesquisar no Jaa" sem @). Catálogo REAL (migration 0035/0036).
 * Geometria em torno de um LOCAL DA PESQUISA fixo: ~0,009° de latitude ≈ 1 km.
 */
const ENTREGADOR = "0199b000-0000-7000-8000-000000000011";
const MOTOTAXI = "0199b000-0000-7000-8000-000000000012";
const MOTO = "0199b000-0000-7000-8000-000000000031";
const CARRO = "0199b000-0000-7000-8000-000000000032";

const LOCAL = { latitude: -19.9191, longitude: -43.9386 };
const aoNorte = (km: number) => ({ latitude: Number((LOCAL.latitude + km * 0.009).toFixed(6)), longitude: LOCAL.longitude });
const SEMANA_INTEIRA = [1, 2, 3, 4, 5, 6, 7].map((diaSemana) => ({ diaSemana, inicio: "00:00", fim: "24:00" }));

const QUANTIDADE_PAGINACAO = TAMANHO_PAGINA_BUSCA_PROFISSIONAIS + 1;
const telefones = Array.from({ length: 8 + QUANTIDADE_PAGINACAO }, (_, indice) => `+55319876930${String(indice).padStart(2, "0")}`);
const ctx = criarAmbienteIntegracao({ telefones, prefixoIp: "198.18.93." });

let pesquisador: Pessoa;
let pertoMoto: Pessoa;
let pertoCarro: Pessoa;
let longeMoto: Pessoa;
let pertoSemCobertura: Pessoa;
let fechado: Pessoa;
let inativo: Pessoa;
const todos: Pessoa[] = [];

async function chamar(pessoa: Pessoa, metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", caminho: string, corpo?: unknown) {
  const resposta = await ctx.api(pessoa, metodo, caminho, corpo);
  return { status: resposta.statusCode, corpo: resposta.json() as unknown };
}

async function exigir(pessoa: Pessoa, metodo: "POST" | "PUT" | "PATCH", caminho: string, corpo?: unknown) {
  const resposta = await chamar(pessoa, metodo, caminho, corpo);
  assert.ok(resposta.status === 200 || resposta.status === 201, `${caminho}: ${JSON.stringify(resposta.corpo)}`);
  return respostaPerfilProfissionalSchema.parse(resposta.corpo).perfil;
}

/** Profissional completo: base confirmada, atividade com veículos, área de raio e (opcional) horários. */
async function profissional(
  pessoa: Pessoa,
  { base, veiculos, raioAreaMetros, servicoId = ENTREGADOR, periodos, ativar = true }: { base: { latitude: number; longitude: number }; veiculos?: string[]; raioAreaMetros: number; servicoId?: string; periodos?: typeof SEMANA_INTEIRA; ativar?: boolean },
) {
  await exigir(pessoa, "POST", "/profissional/perfil");
  await exigir(pessoa, "PUT", "/profissional/perfil/base", { cep: "30130-010", logradouro: "Rua de Teste Privada", numero: "10", bairro: "Centro", cidade: "Belo Horizonte", uf: "MG" });
  await exigir(pessoa, "PUT", "/profissional/perfil/base/ponto", base);
  const perfil = await exigir(pessoa, "POST", "/profissional/perfil/atividades", { servicoId, ...(veiculos ? { opcaoIds: veiculos } : {}) });
  const atividade = perfil?.atividades.find((item) => item.atividadeId === servicoId);
  if (periodos) await exigir(pessoa, "PUT", `/profissional/perfil/atividades/${atividade?.id}/horarios`, { periodos });
  await exigir(pessoa, "POST", "/profissional/perfil/areas", { modalidade: "raio", raioMetros: raioAreaMetros });
  if (ativar) await exigir(pessoa, "POST", "/profissional/perfil/ativar");
}

const busca = (parametros: Record<string, string | number>) => `/profissionais/busca?${new URLSearchParams(Object.entries(parametros).map(([chave, valor]) => [chave, String(valor)]))}`;
const motoboyEm = (extra: Record<string, string | number> = {}) => busca({ servicoId: ENTREGADOR, opcaoId: MOTO, ...LOCAL, raioKm: 10, ...extra });

async function encontrados(pessoa: Pessoa, caminho: string) {
  const resposta = await chamar(pessoa, "GET", caminho);
  assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
  return paginaProfissionaisEncontradosSchema.parse(resposta.corpo);
}

before(async () => {
  await ctx.iniciar();
  pesquisador = await ctx.criarPessoa(0, "bp_pesquisador", "Pesquisador");
  pertoMoto = await ctx.criarPessoa(1, "bp_perto_moto", "Perto Moto");
  pertoCarro = await ctx.criarPessoa(2, "bp_perto_carro", "Perto Carro");
  longeMoto = await ctx.criarPessoa(3, "bp_longe_moto", "Longe Moto");
  pertoSemCobertura = await ctx.criarPessoa(4, "bp_sem_cobertura", "Sem Cobertura");
  fechado = await ctx.criarPessoa(5, "bp_fechado", "Fechado");
  inativo = await ctx.criarPessoa(6, "bp_inativo", "Inativo");
  todos.push(pesquisador, pertoMoto, pertoCarro, longeMoto, pertoSemCobertura, fechado, inativo);

  // Base a 5 km, área de 10 km: a base está no raio da pesquisa E a área cobre o local.
  await profissional(pertoMoto, { base: aoNorte(5), veiculos: [MOTO], raioAreaMetros: 10_000, periodos: SEMANA_INTEIRA });
  await profissional(pertoCarro, { base: aoNorte(4), veiculos: [CARRO], raioAreaMetros: 10_000 });
  // Área enorme cobrindo o local, mas a BASE está a 30 km: fora de uma pesquisa de 10 km.
  await profissional(longeMoto, { base: aoNorte(30), veiculos: [MOTO], raioAreaMetros: 50_000 });
  // Base no raio, mas a área (1 km da base) NÃO cobre o local.
  await profissional(pertoSemCobertura, { base: aoNorte(5), veiculos: [MOTO], raioAreaMetros: 1_000 });
  // Nenhum horário: sempre "Fechado agora" — e mesmo assim aparece.
  await profissional(fechado, { base: aoNorte(6), veiculos: [MOTO], raioAreaMetros: 10_000, periodos: [] });
  await profissional(inativo, { base: aoNorte(3), veiculos: [MOTO], raioAreaMetros: 10_000, ativar: false });
  // O próprio pesquisador também é motoboy perto: nunca encontra a si mesmo.
  await profissional(pesquisador, { base: aoNorte(1), veiculos: [MOTO], raioAreaMetros: 10_000 });
});

after(async () => {
  await ctx.banco.delete(perfisProfissionais).where(inArray(perfisProfissionais.identidadeId, todos.map((pessoa) => pessoa.identidadeId)));
  await ctx.encerrar();
});

describe("intenção: texto → atividade + opção (sem @)", () => {
  for (const termo of ["motoboy", "moto boy", "moto-boy", "entregador de moto"]) {
    it(`"${termo}" → uma intenção exata: Entregador · Moto`, async () => {
      const resposta = respostaIntencoesProfissionaisSchema.parse((await chamar(pesquisador, "GET", `/profissionais/intencoes?termo=${encodeURIComponent(termo)}`)).corpo);
      assert.deepEqual(resposta.intencoes, [{ servicoId: ENTREGADOR, especialidadeId: null, opcaoId: MOTO, rotulo: "Entregador · Moto", exata: true }]);
    });
  }

  it('"moto" é ambíguo: devolve Entregador · Moto E Mototáxi, nenhuma exata', async () => {
    const { intencoes } = respostaIntencoesProfissionaisSchema.parse((await chamar(pesquisador, "GET", "/profissionais/intencoes?termo=moto")).corpo);
    assert.ok(intencoes.some((item) => item.servicoId === ENTREGADOR && item.opcaoId === MOTO));
    assert.ok(intencoes.some((item) => item.servicoId === MOTOTAXI));
    assert.equal(intencoes.some((item) => item.exata), false);
  });

  it("com @ não há intenção profissional; a busca de pessoas continua a mesma e limitada a 5", async () => {
    const { intencoes } = respostaIntencoesProfissionaisSchema.parse((await chamar(pesquisador, "GET", "/profissionais/intencoes?termo=@bp_perto")).corpo);
    assert.deepEqual(intencoes, []);
    const pessoas = respostaBuscaSchema.parse((await chamar(pesquisador, "GET", "/busca?termo=bp_")).corpo);
    assert.equal(pessoas.externos.length, 5);
    const porUsuario = respostaBuscaSchema.parse((await chamar(pesquisador, "GET", `/busca?termo=${encodeURIComponent("@bp_perto_moto")}`)).corpo);
    assert.ok(porUsuario.externos.some((item) => item.identidade.nomeUsuario === "bp_perto_moto"));
  });
});

describe("busca: ponto + raio + área de atuação", () => {
  it("só aparece quem tem MOTO, base dentro do raio E área cobrindo o local; fechado aparece; inativo e o próprio não", async () => {
    const pagina = await encontrados(pesquisador, motoboyEm());
    const usuarios = pagina.itens.map((item) => item.nomeUsuario);
    assert.deepEqual(usuarios, ["bp_perto_moto", "bp_fechado"]);
    assert.equal(pagina.temMais, false);
  });

  it("Atendendo agora × Fechado agora é informação, não filtro", async () => {
    const { itens } = await encontrados(pesquisador, motoboyEm());
    assert.equal(itens.find((item) => item.nomeUsuario === "bp_perto_moto")?.atendeNoHorario, true);
    assert.equal(itens.find((item) => item.nomeUsuario === "bp_fechado")?.atendeNoHorario, false);
  });

  it("aumentar o raio para 50 km inclui a base a 30 km (a área dela cobre o local)", async () => {
    const usuarios = (await encontrados(pesquisador, motoboyEm({ raioKm: 50 }))).itens.map((item) => item.nomeUsuario);
    assert.ok(usuarios.includes("bp_longe_moto"));
    assert.equal(usuarios.includes("bp_sem_cobertura"), false);
    assert.equal(usuarios.includes("bp_perto_carro"), false);
  });

  it("raio fora das opções (máx. 50 km) e intenção incoerente são recusados", async () => {
    assert.equal((await chamar(pesquisador, "GET", motoboyEm({ raioKm: 51 }))).status, 400);
    assert.equal((await chamar(pesquisador, "GET", motoboyEm({ raioKm: 7 }))).status, 400);
    // Opção de OUTRA atividade (Moto do Entregador pedida como Mototáxi): revalidada no servidor.
    assert.equal((await chamar(pesquisador, "GET", busca({ servicoId: MOTOTAXI, opcaoId: MOTO, ...LOCAL, raioKm: 10 }))).status, 404);
    assert.equal((await chamar(pesquisador, "GET", motoboyEm({ pagina: 10 }))).status, 400);
    assert.equal((await chamar(pesquisador, "GET", motoboyEm({ identidadeId: pesquisador.identidadeId }))).status, 400);
  });

  it("resultado só com dados públicos: nada de base, endereço, coordenada ou geometria", async () => {
    const texto = JSON.stringify((await chamar(pesquisador, "GET", motoboyEm({ raioKm: 50 }))).corpo);
    for (const proibido of ["latitude", "longitude", "Rua de Teste Privada", "cep", "ponto", "poligonos", "cobertura", "perfilId", "servicoPerfilId", "distanciaBaseMetros"]) {
      assert.equal(texto.includes(proibido), false, proibido);
    }
  });

  it("pesquisar em outro local não altera a base de ninguém (nada é gravado)", async () => {
    const antes = respostaPerfilProfissionalSchema.parse((await chamar(pesquisador, "GET", "/profissional/perfil")).corpo).perfil?.base;
    await encontrados(pesquisador, motoboyEm({ ...aoNorte(-20), raioKm: 20 }));
    const depois = respostaPerfilProfissionalSchema.parse((await chamar(pesquisador, "GET", "/profissional/perfil")).corpo).perfil?.base;
    assert.deepEqual(depois, antes);
  });

  it("localizar endereço digitado não grava nada (sem geocodificador configurado: sem palpite)", async () => {
    const resposta = await chamar(pesquisador, "POST", "/profissionais/busca/localizar-endereco", { cep: "30130-010", logradouro: "Av. Afonso Pena", numero: "1000", bairro: "Centro", cidade: "Belo Horizonte", uf: "MG" });
    assert.equal(resposta.status, 200);
    assert.deepEqual(sugestaoLocalizacaoSchema.parse(resposta.corpo), { disponivel: false, coordenadas: null });
    assert.equal((await chamar(pesquisador, "POST", "/profissionais/busca/localizar-endereco", { cep: "x" })).status, 400);
  });
});

describe("pesquisando como EMPRESA: o local reaproveitado é a base DELA", () => {
  let dono: Pessoa;
  let empresaId = "";
  let comoEmpresa: Pessoa;

  before(async () => {
    dono = await ctx.criarPessoa(7, "bp_dono_empresa", "Dono Empresa");
    todos.push(dono);
    const criada = await chamar(dono, "POST", "/empresas", { nome: "Pizzaria Busca", nomeUsuario: "bp_pizzaria", slug: "bp-pizzaria" });
    assert.equal(criada.status, 201, JSON.stringify(criada.corpo));
    const empresa = empresaSchema.parse(criada.corpo);
    empresaId = empresa.id;
    comoEmpresa = como(dono, empresa.identidadeId);
    const base = { cep: "30668-635", logradouro: "Avenida Perimetral", numero: "3368", bairro: "Santa Rita", cidade: "Belo Horizonte", uf: "MG" };
    assert.equal((await chamar(dono, "POST", `/empresas/${empresaId}/base`, base)).status, 200);
    assert.equal((await chamar(dono, "POST", `/empresas/${empresaId}/base/localizacao`, LOCAL)).status, 200);
  });

  it("a base confirmada vem da fonte de sempre (Operação da base) só para quem opera a empresa", async () => {
    const base = baseEmpresaSchema.parse((await chamar(dono, "GET", `/empresas/${empresaId}/base`)).corpo);
    assert.deepEqual([base.latitude, base.longitude, base.localizacaoConfirmadaEm !== null], [LOCAL.latitude, LOCAL.longitude, true]);
    // Outra conta (e outra empresa) não descobre a base: indistinguível de inexistente.
    assert.equal((await chamar(pesquisador, "GET", `/empresas/${empresaId}/base`)).status, 404);
  });

  it("a empresa pesquisa em nome dela; pesquisar em OUTRO ponto não altera a base da empresa", async () => {
    const antes = baseEmpresaSchema.parse((await chamar(dono, "GET", `/empresas/${empresaId}/base`)).corpo);
    const daBase = await encontrados(comoEmpresa, motoboyEm());
    assert.ok(daBase.itens.some((item) => item.nomeUsuario === "bp_perto_moto"));
    // "Alterar" ou GPS: o ponto é só parâmetro da consulta.
    await encontrados(comoEmpresa, motoboyEm({ ...aoNorte(-20), raioKm: 20 }));
    const depois = baseEmpresaSchema.parse((await chamar(dono, "GET", `/empresas/${empresaId}/base`)).corpo);
    assert.deepEqual(depois, antes);
  });
});

describe("paginação", () => {
  const extras: Pessoa[] = [];
  before(async () => {
    for (let indice = 0; indice < QUANTIDADE_PAGINACAO; indice += 1) {
      const pessoa = await ctx.criarPessoa(8 + indice, `bp_pag_${indice}`, `Paginação ${indice}`);
      extras.push(pessoa);
      todos.push(pessoa);
      await profissional(pessoa, { base: aoNorte(2), veiculos: [MOTO], raioAreaMetros: 10_000 });
    }
  });

  it(`páginas de ${TAMANHO_PAGINA_BUSCA_PROFISSIONAIS}, sem repetir ninguém, e nunca ilimitada`, async () => {
    const primeira = await encontrados(pesquisador, motoboyEm());
    assert.equal(primeira.itens.length, TAMANHO_PAGINA_BUSCA_PROFISSIONAIS);
    assert.equal(primeira.temMais, true);
    const segunda = await encontrados(pesquisador, motoboyEm({ pagina: 1 }));
    assert.equal(segunda.temMais, false);
    const ids = [...primeira.itens, ...segunda.itens].map((item) => item.identidadeId);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, QUANTIDADE_PAGINACAO + 2);
  });
});
