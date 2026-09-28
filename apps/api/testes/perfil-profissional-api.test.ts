import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { categoriasProfissionais, municipios, perfisProfissionais, servicosProfissionais, termosBuscaServico } from "@jaa/banco/schema";
import { catalogoServicosSchema, respostaPerfilProfissionalSchema, type PerfilProfissionalDoDono } from "@jaa/contratos";
import { inArray, like } from "drizzle-orm";
import { como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";
import { criarCategoriaProfissional, criarServicoProfissional } from "../src/features/profissionais/repositorios/repositorio-taxonomia.js";

/*
 * PERFIL PROFISSIONAL pela API (Bloco 3): o próprio profissional configura tudo por HTTP.
 * Catálogo = o INICIAL semeado pela migration 0035 (IDs fixos). A atividade "teste-perfil-api-extra"
 * é FIXTURE só para provar a recusa da 4ª atividade. BH e Contagem entram como linhas de catálogo
 * (código e nome oficiais, sem geometria): a malha real é testada em `test:malha-oficial`.
 */

const ENTREGADOR = "0199b000-0000-7000-8000-000000000011";
const MOTOTAXI = "0199b000-0000-7000-8000-000000000012";
const CABELEIREIRO = "0199b000-0000-7000-8000-000000000013";
const MOTO = "0199b000-0000-7000-8000-000000000031";
const CARRO = "0199b000-0000-7000-8000-000000000032";
const CORTE_MASCULINO = "0199b000-0000-7000-8000-000000000041";
const ESCOVA = "0199b000-0000-7000-8000-000000000043";
const BELO_HORIZONTE = "3106200";
const CONTAGEM = "3118601";

const ctx = criarAmbienteIntegracao({ telefones: ["+5531987692001", "+5531987692002", "+5531987692003"], prefixoIp: "198.18.92." });
let ana: Pessoa;
let beto: Pessoa;
let caio: Pessoa;
let extraId = "";

async function chamar(pessoa: Pessoa, metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", caminho: string, corpo?: unknown) {
  const resposta = await ctx.api(pessoa, metodo, caminho, corpo);
  return { status: resposta.statusCode, corpo: resposta.json() as Record<string, unknown> };
}

// Mutação bem-sucedida devolve o perfil atualizado (visão do dono).
async function perfilApos(pessoa: Pessoa, metodo: "POST" | "PUT" | "PATCH" | "DELETE", caminho: string, corpo?: unknown, status = 200): Promise<PerfilProfissionalDoDono> {
  const resposta = await chamar(pessoa, metodo, caminho, corpo);
  assert.equal(resposta.status, status, JSON.stringify(resposta.corpo));
  const perfil = respostaPerfilProfissionalSchema.parse(resposta.corpo).perfil;
  assert.ok(perfil);
  return perfil;
}

const atividadeDe = (perfil: PerfilProfissionalDoDono, catalogoId: string) => perfil.atividades.find((atividade) => atividade.atividadeId === catalogoId);
const base = { cep: "30130-010", logradouro: "Avenida Afonso Pena", numero: "1000", bairro: "Centro", cidade: "Belo Horizonte", uf: "MG", codigoIbge: BELO_HORIZONTE };

before(async () => {
  await ctx.iniciar();
  const categoria = await criarCategoriaProfissional(ctx.banco, { slug: "teste-perfil-api", nome: "Fixture perfil API" });
  extraId = (await criarServicoProfissional(ctx.banco, { categoriaId: categoria.id, slug: "teste-perfil-api-extra", nome: "Atividade extra de teste" })).id;
  await ctx.banco
    .insert(municipios)
    .values([
      { codigoIbge: BELO_HORIZONTE, nome: "Belo Horizonte", uf: "MG" },
      { codigoIbge: CONTAGEM, nome: "Contagem", uf: "MG" },
    ])
    .onConflictDoNothing();
  ana = await ctx.criarPessoa(0, "pp_ana", "Ana");
  beto = await ctx.criarPessoa(1, "pp_beto", "Beto");
  caio = await ctx.criarPessoa(2, "pp_caio", "Caio");
});

after(async () => {
  await ctx.banco.delete(perfisProfissionais).where(inArray(perfisProfissionais.identidadeId, [ana, beto, caio].filter(Boolean).map((p) => p.identidadeId)));
  await ctx.banco.delete(termosBuscaServico).where(inArray(termosBuscaServico.servicoId, [extraId]));
  await ctx.banco.delete(servicosProfissionais).where(like(servicosProfissionais.slug, "teste-perfil-api-%"));
  await ctx.banco.delete(categoriasProfissionais).where(like(categoriasProfissionais.slug, "teste-perfil-api%"));
  await ctx.banco.delete(municipios).where(inArray(municipios.codigoIbge, [BELO_HORIZONTE, CONTAGEM]));
  await ctx.encerrar();
});

describe("CORS (o que o navegador exige antes de chamar a API)", () => {
  it("todo método usado pelo cliente da Web passa no preflight — inclusive PUT (base, ponto, horários)", async () => {
    for (const [metodo, caminho] of [
      ["GET", "/profissional/perfil"],
      ["POST", "/profissional/perfil/atividades"],
      ["PUT", "/profissional/perfil/base"],
      ["PATCH", "/profissional/perfil/preferencias"],
      ["DELETE", "/profissional/perfil/areas/0199b000-0000-7000-8000-000000000099"],
    ] as const) {
      const resposta = await ctx.preflight(caminho, metodo);
      assert.equal(resposta.statusCode, 204, `${metodo} ${caminho}`);
      assert.equal(resposta.headers["access-control-allow-origin"], "http://localhost:3000");
      assert.match(String(resposta.headers["access-control-allow-methods"]), new RegExp(`\\b${metodo}\\b`), `${metodo} liberado no CORS`);
    }
  });
});

describe("catálogo", () => {
  it("vem da API e o catálogo inicial tem só Entregador, Mototáxi e Cabeleireiro", async () => {
    const resposta = await chamar(ana, "GET", "/profissional/catalogo");
    assert.equal(resposta.status, 200);
    const servicos = catalogoServicosSchema.parse(resposta.corpo).categorias.flatMap((categoria) => categoria.servicos);
    const reais = servicos.filter((servico) => !servico.slug.startsWith("teste-"));
    assert.deepEqual(reais.map((servico) => servico.slug).sort(), ["cabeleireiro", "entregador", "mototaxi"]);
    const entregador = reais.find((servico) => servico.id === ENTREGADOR);
    assert.deepEqual(entregador?.atributos.map((atributo) => [atributo.slug, atributo.tipoSelecao, atributo.opcoes.map((opcao) => opcao.slug)]), [
      ["veiculo", "multipla", ["moto", "carro", "bicicleta"]],
    ]);
    assert.deepEqual(entregador?.especialidades, []);
    const mototaxi = reais.find((servico) => servico.id === MOTOTAXI);
    assert.deepEqual([mototaxi?.especialidades, mototaxi?.atributos], [[], []]);
    assert.deepEqual(
      reais.find((servico) => servico.id === CABELEIREIRO)?.especialidades.map((especialidade) => especialidade.nome),
      ["Corte masculino", "Corte feminino", "Escova", "Coloração"],
    );
  });

  it("municípios vêm do catálogo LOCAL, por busca (sem acento, início primeiro)", async () => {
    const contagem = await chamar(ana, "GET", "/profissional/municipios?busca=cont");
    assert.deepEqual(contagem.corpo.municipios, [{ codigoIbge: CONTAGEM, nome: "Contagem", uf: "MG" }]);
    const belo = await chamar(ana, "GET", "/profissional/municipios?busca=BELO");
    assert.deepEqual(belo.corpo.municipios, [{ codigoIbge: BELO_HORIZONTE, nome: "Belo Horizonte", uf: "MG" }]);
    assert.equal((await chamar(ana, "GET", "/profissional/municipios?busca=b")).status, 400);
  });
});

describe("ativação e posse", () => {
  it("sem perfil, GET devolve null; 'Ativar perfil' cria o perfil inativo com pendências", async () => {
    assert.deepEqual((await chamar(ana, "GET", "/profissional/perfil")).corpo, { perfil: null });
    const perfil = await perfilApos(ana, "POST", "/profissional/perfil");
    assert.equal(perfil.situacao, "inativo");
    assert.deepEqual(perfil.pendencias, ["base", "atividade", "area"]);
    // Idempotente.
    assert.equal((await perfilApos(ana, "POST", "/profissional/perfil")).id, perfil.id);
  });

  it("agindo como EMPRESA não há perfil profissional (403)", async () => {
    const empresa = await chamar(beto, "POST", "/empresas", { nome: "Empresa PP", nomeUsuario: "pp_empresa", slug: "pp-empresa" });
    assert.equal(empresa.status, 201);
    const resposta = await chamar(como(beto, empresa.corpo.identidadeId as string), "POST", "/profissional/perfil");
    assert.equal(resposta.status, 403);
  });
});

describe("atividades (até 3)", () => {
  it("adiciona Cabeleireiro com especialidades e horário padrão seg–sex 08–18", async () => {
    const perfil = await perfilApos(ana, "POST", "/profissional/perfil/atividades", { servicoId: CABELEIREIRO, especialidadeIds: [CORTE_MASCULINO, ESCOVA] }, 201);
    const cabeleireiro = atividadeDe(perfil, CABELEIREIRO);
    assert.deepEqual(cabeleireiro?.especialidadeIds.sort(), [CORTE_MASCULINO, ESCOVA].sort());
    assert.deepEqual(cabeleireiro?.periodos, [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, inicio: "08:00", fim: "18:00" })));
    assert.equal(cabeleireiro?.permiteAgendamento, false);
  });

  it("a mesma atividade duas vezes é recusada", async () => {
    const resposta = await chamar(ana, "POST", "/profissional/perfil/atividades", { servicoId: CABELEIREIRO });
    assert.deepEqual([resposta.status, resposta.corpo.codigo], [409, "ATIVIDADE_DUPLICADA"]);
  });

  it("adiciona Entregador (veículo Moto + Carro) e Mototáxi; a quarta atividade é recusada", async () => {
    const comEntregador = await perfilApos(ana, "POST", "/profissional/perfil/atividades", { servicoId: ENTREGADOR, opcaoIds: [MOTO, CARRO] }, 201);
    assert.deepEqual(atividadeDe(comEntregador, ENTREGADOR)?.opcaoIds.sort(), [MOTO, CARRO].sort());
    const tres = await perfilApos(ana, "POST", "/profissional/perfil/atividades", { servicoId: MOTOTAXI }, 201);
    assert.equal(tres.atividades.length, 3);
    const quarta = await chamar(ana, "POST", "/profissional/perfil/atividades", { servicoId: extraId });
    assert.deepEqual([quarta.status, quarta.corpo.codigo], [409, "LIMITE_DE_ATIVIDADES_ATINGIDO"]);
  });

  it("especialidade ou opção de OUTRA atividade é recusada", async () => {
    const perfil = await perfilApos(ana, "PATCH", `/profissional/perfil/atividades/${(await atividadeIdDaAna(ENTREGADOR))}`, { opcaoIds: [MOTO] });
    assert.deepEqual(atividadeDe(perfil, ENTREGADOR)?.opcaoIds, [MOTO]);
    const especialidadeErrada = await chamar(ana, "PATCH", `/profissional/perfil/atividades/${await atividadeIdDaAna(ENTREGADOR)}`, { especialidadeIds: [CORTE_MASCULINO] });
    assert.deepEqual([especialidadeErrada.status, especialidadeErrada.corpo.codigo], [400, "ESCOLHAS_INVALIDAS"]);
    const opcaoErrada = await chamar(ana, "PATCH", `/profissional/perfil/atividades/${await atividadeIdDaAna(CABELEIREIRO)}`, { opcaoIds: [MOTO] });
    assert.deepEqual([opcaoErrada.status, opcaoErrada.corpo.codigo], [400, "ESCOLHAS_INVALIDAS"]);
  });
});

async function atividadeIdDaAna(catalogoId: string): Promise<string> {
  const perfil = respostaPerfilProfissionalSchema.parse((await chamar(ana, "GET", "/profissional/perfil")).corpo).perfil;
  const atividade = perfil && atividadeDe(perfil, catalogoId);
  assert.ok(atividade);
  return atividade.id;
}

describe("horários e agendamento por atividade", () => {
  it("horários personalizados (vários períodos no dia) são salvos; sobreposição é recusada", async () => {
    const id = await atividadeIdDaAna(CABELEIREIRO);
    const periodos = [
      { diaSemana: 2, inicio: "09:00", fim: "12:00" },
      { diaSemana: 2, inicio: "13:00", fim: "19:00" },
      { diaSemana: 6, inicio: "08:00", fim: "14:00" },
    ];
    const perfil = await perfilApos(ana, "PUT", `/profissional/perfil/atividades/${id}/horarios`, { periodos });
    assert.deepEqual(atividadeDe(perfil, CABELEIREIRO)?.periodos, periodos);
    const sobreposta = await chamar(ana, "PUT", `/profissional/perfil/atividades/${id}/horarios`, { periodos: [periodos[0], { diaSemana: 2, inicio: "11:00", fim: "15:00" }] });
    assert.deepEqual([sobreposta.status, sobreposta.corpo.codigo, sobreposta.corpo.mensagem], [400, "DADOS_INVALIDOS", "Horários sobrepostos."]);
    // As outras atividades mantêm o padrão.
    assert.equal(atividadeDe(perfil, ENTREGADOR)?.periodos.length, 5);
  });

  it("'Permitir agendamento' é independente por atividade", async () => {
    const perfil = await perfilApos(ana, "PATCH", `/profissional/perfil/atividades/${await atividadeIdDaAna(CABELEIREIRO)}/configuracao`, { permiteAgendamento: true });
    assert.equal(atividadeDe(perfil, CABELEIREIRO)?.permiteAgendamento, true);
    assert.equal(atividadeDe(perfil, ENTREGADOR)?.permiteAgendamento, false);
    assert.equal(atividadeDe(perfil, MOTOTAXI)?.permiteAgendamento, false);
  });
});

describe("base profissional", () => {
  it("salva o endereço (com código IBGE) e só depois confirma o ponto", async () => {
    const semPonto = await perfilApos(ana, "PUT", "/profissional/perfil/base", base);
    assert.deepEqual([semPonto.base?.cidade, semPonto.base?.codigoIbge, semPonto.base?.coordenadas], ["Belo Horizonte", BELO_HORIZONTE, null]);
    assert.ok(semPonto.pendencias.includes("base"));
    const comPonto = await perfilApos(ana, "PUT", "/profissional/perfil/base/ponto", { latitude: -19.9191, longitude: -43.9386 });
    assert.deepEqual(comPonto.base?.coordenadas, { latitude: -19.9191, longitude: -43.9386 });
    assert.equal(comPonto.pendencias.includes("base"), false);
  });

  it("endereço mudou → ponto antigo cai; confirmação ATRASADA (versão velha) é recusada; a versão atual é aceita", async () => {
    await perfilApos(beto, "POST", "/profissional/perfil");
    // Primeira base (versão gravada pelo banco): a confirmação com essa versão precisa funcionar.
    const a = await perfilApos(beto, "PUT", "/profissional/perfil/base", { ...base, cep: "30668-275", logradouro: "Rua Pico do Rola Moca", numero: "150" });
    const versaoA = a.base?.atualizadoEm as string;
    const confirmadaA = await perfilApos(beto, "PUT", "/profissional/perfil/base/ponto", { latitude: -20.002641, longitude: -44.027755, baseAtualizadaEm: versaoA });
    assert.deepEqual(confirmadaA.base?.coordenadas, { latitude: -20.002641, longitude: -44.027755 });

    // Endereço B: o servidor derruba o ponto de A.
    const b = await perfilApos(beto, "PUT", "/profissional/perfil/base", { ...base, cep: "30130-003", logradouro: "Avenida Afonso Pena", numero: "1000" });
    assert.equal(b.base?.coordenadas, null);
    assert.notEqual(b.base?.atualizadoEm, versaoA);

    // A tela antiga ainda com o ponto de A (versão de A): recusado, e nada é gravado.
    const atrasada = await chamar(beto, "PUT", "/profissional/perfil/base/ponto", { latitude: -20.002641, longitude: -44.027755, baseAtualizadaEm: confirmadaA.base?.atualizadoEm });
    assert.deepEqual([atrasada.status, atrasada.corpo.codigo], [409, "BASE_PROFISSIONAL_ALTERADA"]);
    const aindaSemPonto = respostaPerfilProfissionalSchema.parse((await chamar(beto, "GET", "/profissional/perfil")).corpo).perfil;
    assert.deepEqual([aindaSemPonto?.base?.logradouro, aindaSemPonto?.base?.coordenadas], ["Avenida Afonso Pena", null]);

    // Ponto do endereço B, com a versão de B: aceito.
    const confirmadaB = await perfilApos(beto, "PUT", "/profissional/perfil/base/ponto", { latitude: -19.9261, longitude: -43.9391, baseAtualizadaEm: b.base?.atualizadoEm });
    assert.deepEqual([confirmadaB.base?.logradouro, confirmadaB.base?.coordenadas], ["Avenida Afonso Pena", { latitude: -19.9261, longitude: -43.9391 }]);

    // Mudar SÓ o número também derruba o ponto.
    const outroNumero = await perfilApos(beto, "PUT", "/profissional/perfil/base", { ...base, cep: "30130-003", logradouro: "Avenida Afonso Pena", numero: "1200" });
    assert.equal(outroNumero.base?.coordenadas, null);
  });

  it("outra pessoa não altera a base de ninguém: as rotas agem só sobre o PRÓPRIO perfil", async () => {
    assert.equal((await chamar(caio, "PUT", "/profissional/perfil/base/ponto", { latitude: -10, longitude: -40 })).status, 404);
    await perfilApos(caio, "POST", "/profissional/perfil");
    await perfilApos(caio, "PUT", "/profissional/perfil/base", { ...base, numero: "1" });
    await perfilApos(caio, "PUT", "/profissional/perfil/base/ponto", { latitude: -10, longitude: -40 });
    const daAna = respostaPerfilProfissionalSchema.parse((await chamar(ana, "GET", "/profissional/perfil")).corpo).perfil;
    assert.deepEqual([daAna?.base?.numero, daAna?.base?.coordenadas], ["1000", { latitude: -19.9191, longitude: -43.9386 }]);
  });
});

describe("áreas de atuação (até 5 ativas)", () => {
  it("raio de 10 km é aceito; acima de 50 km é recusado", async () => {
    const perfil = await perfilApos(ana, "POST", "/profissional/perfil/areas", { modalidade: "raio", raioMetros: 10_000 }, 201);
    assert.deepEqual(perfil.areas.map((area) => [area.modalidade, area.raioMetros, area.ativa, area.todasAtividades]), [["raio", 10_000, true, true]]);
    const grande = await chamar(ana, "POST", "/profissional/perfil/areas", { modalidade: "raio", raioMetros: 50_001 });
    assert.deepEqual([grande.status, grande.corpo.codigo], [400, "DADOS_INVALIDOS"]);
  });

  it("município do catálogo local é aceito; inexistente é recusado", async () => {
    const perfil = await perfilApos(ana, "POST", "/profissional/perfil/areas", { modalidade: "municipio", codigoIbge: BELO_HORIZONTE }, 201);
    assert.deepEqual(perfil.areas.find((area) => area.modalidade === "municipio")?.municipio, { codigoIbge: BELO_HORIZONTE, nome: "Belo Horizonte", uf: "MG" });
    const inexistente = await chamar(ana, "POST", "/profissional/perfil/areas", { modalidade: "municipio", codigoIbge: "9999999" });
    assert.deepEqual([inexistente.status, inexistente.corpo.codigo], [404, "MUNICIPIO_NAO_ENCONTRADO"]);
  });

  it("área específica só aceita atividades do PRÓPRIO perfil; pode voltar a valer para todas", async () => {
    const cabeleireiro = await atividadeIdDaAna(CABELEIREIRO);
    const perfil = await perfilApos(ana, "POST", "/profissional/perfil/areas", { modalidade: "municipio", codigoIbge: CONTAGEM, servicoPerfilIds: [cabeleireiro] }, 201);
    const area = perfil.areas.find((item) => item.municipio?.codigoIbge === CONTAGEM);
    assert.deepEqual([area?.todasAtividades, area?.atividadeIds], [false, [cabeleireiro]]);
    // Atividade de outra pessoa: indistinguível de inexistente.
    await perfilApos(caio, "POST", "/profissional/perfil/atividades", { servicoId: MOTOTAXI }, 201);
    const doCaio = respostaPerfilProfissionalSchema.parse((await chamar(caio, "GET", "/profissional/perfil")).corpo).perfil?.atividades[0]?.id;
    const alheia = await chamar(ana, "POST", "/profissional/perfil/areas", { modalidade: "raio", raioMetros: 5000, servicoPerfilIds: [doCaio] });
    assert.deepEqual([alheia.status, alheia.corpo.codigo], [404, "ATIVIDADE_NAO_ENCONTRADA"]);
    const geral = await perfilApos(ana, "PATCH", `/profissional/perfil/areas/${area?.id}`, { servicoPerfilIds: [] });
    assert.equal(geral.areas.find((item) => item.id === area?.id)?.todasAtividades, true);
  });

  it("5 ativas; a sexta é recusada; desativada não conta; reativar respeita o limite", async () => {
    await perfilApos(ana, "POST", "/profissional/perfil/areas", { modalidade: "raio", raioMetros: 20_000 }, 201);
    const cinco = await perfilApos(ana, "POST", "/profissional/perfil/areas", { modalidade: "raio", raioMetros: 30_000 }, 201);
    assert.equal(cinco.areas.filter((area) => area.ativa).length, 5);
    const sexta = await chamar(ana, "POST", "/profissional/perfil/areas", { modalidade: "raio", raioMetros: 40_000 });
    assert.deepEqual([sexta.status, sexta.corpo.codigo], [409, "LIMITE_DE_AREAS_ATINGIDO"]);

    const primeira = cinco.areas[0]?.id as string;
    const desativada = await perfilApos(ana, "PATCH", `/profissional/perfil/areas/${primeira}`, { ativa: false });
    assert.equal(desativada.areas.find((area) => area.id === primeira)?.ativa, false);
    const comNova = await perfilApos(ana, "POST", "/profissional/perfil/areas", { modalidade: "raio", raioMetros: 40_000 }, 201);
    assert.deepEqual([comNova.areas.length, comNova.areas.filter((area) => area.ativa).length], [6, 5]);
    const reativar = await chamar(ana, "PATCH", `/profissional/perfil/areas/${primeira}`, { ativa: true });
    assert.deepEqual([reativar.status, reativar.corpo.codigo], [409, "LIMITE_DE_AREAS_ATINGIDO"]);
  });

  it("editar o raio vale só para área de raio; área de outra pessoa não existe para quem pergunta", async () => {
    const perfil = respostaPerfilProfissionalSchema.parse((await chamar(ana, "GET", "/profissional/perfil")).corpo).perfil;
    const raio = perfil?.areas.find((area) => area.modalidade === "raio" && area.ativa);
    const municipio = perfil?.areas.find((area) => area.modalidade === "municipio");
    const editada = await perfilApos(ana, "PATCH", `/profissional/perfil/areas/${raio?.id}`, { raioMetros: 12_000 });
    assert.equal(editada.areas.find((area) => area.id === raio?.id)?.raioMetros, 12_000);
    assert.equal((await chamar(ana, "PATCH", `/profissional/perfil/areas/${municipio?.id}`, { raioMetros: 12_000 })).status, 400);
    assert.equal((await chamar(caio, "PATCH", `/profissional/perfil/areas/${raio?.id}`, { ativa: false })).status, 404);
    assert.equal((await chamar(caio, "DELETE", `/profissional/perfil/areas/${raio?.id}`)).status, 404);
  });
});

describe("área desenhada no mapa (polígono)", () => {
  const QUADRADO = [
    { latitude: -19.92, longitude: -43.95 },
    { latitude: -19.92, longitude: -43.93 },
    { latitude: -19.9, longitude: -43.93 },
    { latitude: -19.9, longitude: -43.95 },
  ];
  const TRIANGULO = [
    { latitude: -19.95, longitude: -43.98 },
    { latitude: -19.95, longitude: -43.96 },
    { latitude: -19.93, longitude: -43.97 },
  ];

  it("cria a área desenhada e o DONO recebe os vértices no mesmo formato do editor", async () => {
    const perfil = await perfilApos(caio, "POST", "/profissional/perfil/areas", { modalidade: "poligono", poligonos: [QUADRADO] }, 201);
    const area = perfil.areas.find((item) => item.modalidade === "poligono");
    assert.deepEqual(area?.poligonos, [QUADRADO]);
    assert.deepEqual([area?.raioMetros, area?.municipio, area?.todasAtividades], [null, null, true]);
    // Raio e município continuam sem desenho.
    const raio = await perfilApos(caio, "POST", "/profissional/perfil/areas", { modalidade: "raio", raioMetros: 5000 }, 201);
    assert.equal(raio.areas.find((item) => item.modalidade === "raio")?.poligonos, null);
  });

  it("editar o desenho mantém a MESMA área (mesmo id), ativa e abrangência; GET devolve o novo desenho", async () => {
    const antes = respostaPerfilProfissionalSchema.parse((await chamar(caio, "GET", "/profissional/perfil")).corpo).perfil;
    const area = antes?.areas.find((item) => item.modalidade === "poligono");
    assert.ok(area);
    const depois = await perfilApos(caio, "PATCH", `/profissional/perfil/areas/${area.id}`, { poligonos: [TRIANGULO] });
    assert.deepEqual(depois.areas.map((item) => item.id), antes?.areas.map((item) => item.id));
    const editada = depois.areas.find((item) => item.id === area.id);
    assert.deepEqual([editada?.poligonos, editada?.ativa, editada?.todasAtividades], [[TRIANGULO], true, true]);
    const relido = respostaPerfilProfissionalSchema.parse((await chamar(caio, "GET", "/profissional/perfil")).corpo).perfil;
    assert.deepEqual(relido?.areas.find((item) => item.id === area.id)?.poligonos, [TRIANGULO]);
  });

  it("desenho inválido, desenho em área de outra modalidade e área alheia são recusados sem mudar nada", async () => {
    const perfil = respostaPerfilProfissionalSchema.parse((await chamar(caio, "GET", "/profissional/perfil")).corpo).perfil;
    const desenhada = perfil?.areas.find((item) => item.modalidade === "poligono");
    const raio = perfil?.areas.find((item) => item.modalidade === "raio");
    const laco = [QUADRADO[0], QUADRADO[2], QUADRADO[1], QUADRADO[3]];
    assert.equal((await chamar(caio, "PATCH", `/profissional/perfil/areas/${desenhada?.id}`, { poligonos: [laco] })).status, 400);
    assert.equal((await chamar(caio, "PATCH", `/profissional/perfil/areas/${desenhada?.id}`, { poligonos: [QUADRADO.slice(0, 2)] })).status, 400);
    // Dois polígonos que se sobrepõem formam MultiPolygon inválido: o PostGIS decide, como na criação.
    const sobreposto = QUADRADO.map((vertice) => ({ latitude: vertice.latitude + 0.005, longitude: vertice.longitude + 0.005 }));
    const invalido = await chamar(caio, "PATCH", `/profissional/perfil/areas/${desenhada?.id}`, { poligonos: [QUADRADO, sobreposto] });
    assert.deepEqual([invalido.status, (invalido.corpo as { mensagem?: string }).mensagem], [400, "Desenho da área inválido."]);
    assert.equal((await chamar(caio, "PATCH", `/profissional/perfil/areas/${raio?.id}`, { poligonos: [QUADRADO] })).status, 400);
    assert.equal((await chamar(ana, "PATCH", `/profissional/perfil/areas/${desenhada?.id}`, { poligonos: [QUADRADO] })).status, 404);
    const relido = respostaPerfilProfissionalSchema.parse((await chamar(caio, "GET", "/profissional/perfil")).corpo).perfil;
    assert.deepEqual(relido?.areas.find((item) => item.id === desenhada?.id)?.poligonos, [TRIANGULO]);
  });

  it("área desenhada respeita o limite de ativas e a abrangência por atividade como as outras", async () => {
    await perfilApos(caio, "POST", "/profissional/perfil/atividades", { servicoId: CABELEIREIRO }, 201);
    const perfil = respostaPerfilProfissionalSchema.parse((await chamar(caio, "GET", "/profissional/perfil")).corpo).perfil;
    const cabeleireiro = perfil?.atividades.find((atividade) => atividade.atividadeId === CABELEIREIRO)?.id as string;
    const desenhada = perfil?.areas.find((item) => item.modalidade === "poligono");
    const especifica = await perfilApos(caio, "PATCH", `/profissional/perfil/areas/${desenhada?.id}`, { servicoPerfilIds: [cabeleireiro] });
    assert.deepEqual(especifica.areas.find((item) => item.id === desenhada?.id)?.atividadeIds, [cabeleireiro]);
    for (const raioMetros of [6000, 7000, 8000]) await perfilApos(caio, "POST", "/profissional/perfil/areas", { modalidade: "raio", raioMetros }, 201);
    const sexta = await chamar(caio, "POST", "/profissional/perfil/areas", { modalidade: "poligono", poligonos: [TRIANGULO] });
    assert.equal(sexta.status, 409);
    await perfilApos(caio, "DELETE", `/profissional/perfil/atividades/${cabeleireiro}`);
  });

  after(async () => {
    // Devolve o Caio ao estado que os testes seguintes esperam: perfil SEM área (incompleto).
    const perfil = respostaPerfilProfissionalSchema.parse((await chamar(caio, "GET", "/profissional/perfil")).corpo).perfil;
    for (const area of perfil?.areas ?? []) await perfilApos(caio, "DELETE", `/profissional/perfil/areas/${area.id}`);
  });
});

describe("preferências, ativação e privacidade", () => {
  it("'Oportunidades de outras regiões' começa desligada e é persistida", async () => {
    assert.equal(respostaPerfilProfissionalSchema.parse((await chamar(ana, "GET", "/profissional/perfil")).corpo).perfil?.recebeOportunidadesOutrasRegioes, false);
    await perfilApos(ana, "PATCH", "/profissional/perfil/preferencias", { recebeOportunidadesOutrasRegioes: true });
    assert.equal(respostaPerfilProfissionalSchema.parse((await chamar(ana, "GET", "/profissional/perfil")).corpo).perfil?.recebeOportunidadesOutrasRegioes, true);
  });

  it("perfil incompleto não ativa; completo fica ATIVO; pausar volta a inativo", async () => {
    const incompleto = await chamar(caio, "POST", "/profissional/perfil/ativar");
    assert.deepEqual([incompleto.status, incompleto.corpo.codigo], [409, "PERFIL_PROFISSIONAL_INCOMPLETO"]);
    const ativo = await perfilApos(ana, "POST", "/profissional/perfil/ativar");
    assert.deepEqual([ativo.situacao, ativo.pendencias], ["ativo", []]);
    assert.equal((await perfilApos(ana, "POST", "/profissional/perfil/desativar")).situacao, "inativo");
  });

  it("outra pessoa não mexe nas atividades de ninguém", async () => {
    const cabeleireiro = await atividadeIdDaAna(CABELEIREIRO);
    assert.equal((await chamar(caio, "PATCH", `/profissional/perfil/atividades/${cabeleireiro}`, { especialidadeIds: [] })).status, 404);
    assert.equal((await chamar(caio, "PUT", `/profissional/perfil/atividades/${cabeleireiro}/horarios`, { periodos: [] })).status, 404);
    assert.equal((await chamar(caio, "DELETE", `/profissional/perfil/atividades/${cabeleireiro}`)).status, 404);
    assert.equal((await atividadeIdDaAna(CABELEIREIRO)), cabeleireiro);
  });

  it("a resposta do dono não traz ids internos de conta nem geometria de área", async () => {
    const texto = JSON.stringify((await chamar(ana, "GET", "/profissional/perfil")).corpo);
    for (const proibido of ["usuarioId", "identidadeId", "cobertura", "fusoHorario", ana.identidadeId]) assert.equal(texto.includes(proibido), false, proibido);
  });

  it("remover atividade tira do perfil e as demais seguem", async () => {
    const perfil = await perfilApos(ana, "DELETE", `/profissional/perfil/atividades/${await atividadeIdDaAna(MOTOTAXI)}`);
    assert.deepEqual(perfil.atividades.map((atividade) => atividade.atividadeId).sort(), [ENTREGADOR, CABELEIREIRO].sort());
  });
});
