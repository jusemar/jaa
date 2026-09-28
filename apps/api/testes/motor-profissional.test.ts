import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { multipoligonoDeVertices } from "@jaa/banco/geoespacial";
import {
  areasAtuacaoServicos,
  atributosServico,
  categoriasProfissionais,
  especialidadesServico,
  especialidadesServicoPerfil,
  identidades,
  malhasMunicipio,
  municipios,
  opcoesAtributo,
  perfisProfissionais,
  periodosAtendimento,
  servicosProfissionais,
  termosBuscaServico,
  users,
} from "@jaa/banco/schema";
import { profissionalEncontradoSchema, type Coordenadas } from "@jaa/contratos";
import { count, eq, inArray, like, sql } from "drizzle-orm";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";
import {
  adicionarAreaAtuacao,
  adicionarServicoAoPerfil,
  ativarPerfilProfissional,
  atualizarDetalhesServicoDoPerfil,
  confirmarPontoBaseProfissional,
  definirAreaAtiva,
  definirConfiguracaoServico,
  definirHorariosAtendimentoServico,
  definirPreferenciasPerfil,
  lerPerfilProfissionalDoDono,
  obterOuCriarPerfilProfissional,
  removerServicoDoPerfilProfissional,
  salvarBaseProfissional,
} from "../src/features/profissionais/casos-de-uso/gerir-perfil-profissional.js";
import { buscarProfissionaisCompativeis, paraResultadosPublicos, type ConsultaMatching } from "../src/features/profissionais/repositorios/repositorio-matching.js";
import {
  buscarServicosPorTermo,
  criarAtributoServico,
  criarCategoriaProfissional,
  criarEspecialidadeServico,
  criarOpcaoAtributo,
  criarServicoProfissional,
  listarCatalogoServicos,
} from "../src/features/profissionais/repositorios/repositorio-taxonomia.js";

/*
 * MOTOR PROFISSIONAL — Bloco 2 (fundação de dados), contra o banco DESCARTÁVEL.
 *
 * A taxonomia abaixo é FIXTURE DE TESTE (slugs `teste-mp-*`): prova que a modelagem comporta os casos
 * reais sem que nenhum serviço/opção exista em código. Os municípios `0000001`/`0000002` são FICTÍCIOS
 * (códigos IBGE reais começam pelo código da UF); o quadrado da malha é geometria de teste, não limite
 * territorial real.
 */

const TELEFONES = ["+5531987690001", "+5531987690002", "+5531987690003", "+5531987690004", "+5531987690005", "+5531987690006", "+5531987690007"];
const ctx = criarAmbienteIntegracao({ telefones: TELEFONES, prefixoIp: "198.18.90." });
const banco = ctx.banco;

// Pontos reais aproximados (Grande BH) só como referência de distância.
const CONTAGEM: Coordenadas = { latitude: -19.9317, longitude: -44.0539 };
const ELDORADO: Coordenadas = { latitude: -19.94, longitude: -44.03 };
const PRACA_SETE: Coordenadas = { latitude: -19.9191, longitude: -43.9386 }; // ~12 km de Contagem
const BH_NORTE: Coordenadas = { latitude: -19.87, longitude: -43.9386 }; // fora do quadrado da Praça Sete
const DEZ_KM_OESTE: Coordenadas = { latitude: -19.9317, longitude: -44.1495 }; // ~10 km de Contagem
const TRINTA_KM_OESTE: Coordenadas = { latitude: -19.9317, longitude: -44.3405 }; // ~30 km de Contagem
const FICTICIO_A: Coordenadas = { latitude: -20.5, longitude: -44.5 }; // dentro da malha fictícia 0000001
const LONGE: Coordenadas = { latitude: -21.5, longitude: -45.5 };

const quadrado = (centro: Coordenadas, meiaLado: number) => [
  { latitude: centro.latitude - meiaLado, longitude: centro.longitude - meiaLado },
  { latitude: centro.latitude - meiaLado, longitude: centro.longitude + meiaLado },
  { latitude: centro.latitude + meiaLado, longitude: centro.longitude + meiaLado },
  { latitude: centro.latitude + meiaLado, longitude: centro.longitude - meiaLado },
];

const baseEm = (cidade: string) => ({ cep: "32010-000", logradouro: "Rua de Teste", numero: "100", bairro: "Centro", cidade, uf: "MG" });

let joao: Pessoa;
let maria: Pessoa;
let ana: Pessoa;
let pedro: Pessoa;
let semPerfil: Pessoa;
let outra: Pessoa;
let bia: Pessoa;

// Ids da taxonomia de teste, por slug curto.
const t = {} as Record<string, string>;
// Ids dos serviços de cada perfil.
const sp = {} as Record<string, string>;
// Ids de áreas usadas em mais de um teste.
const ar = {} as Record<string, string>;

function exigir<T extends { tipo: string }, K extends T["tipo"]>(resultado: T, tipo: K): Extract<T, { tipo: K }> {
  assert.equal(resultado.tipo, tipo, JSON.stringify(resultado));
  return resultado as Extract<T, { tipo: K }>;
}

async function prepararPerfil(pessoa: Pessoa, cidade: string, ponto: Coordenadas) {
  exigir(await obterOuCriarPerfilProfissional(banco, pessoa.identidadeId), "ok");
  exigir(await salvarBaseProfissional(banco, pessoa.identidadeId, baseEm(cidade)), "salva");
  exigir(await confirmarPontoBaseProfissional(banco, pessoa.identidadeId, ponto), "confirmado");
}

async function servico(pessoa: Pessoa, entrada: { servicoId: string; especialidadeIds?: string[]; opcaoIds?: string[] }) {
  return exigir(await adicionarServicoAoPerfil(banco, pessoa.identidadeId, entrada), "adicionado").servicoPerfilId;
}

async function area(pessoa: Pessoa, entrada: Record<string, unknown>) {
  return exigir(await adicionarAreaAtuacao(banco, pessoa.identidadeId, entrada), "adicionada").areaId;
}

async function encontrados(consulta: ConsultaMatching) {
  return (await buscarProfissionaisCompativeis(banco, consulta)).map((item) => item.identidadeId);
}

async function montarTaxonomiaDeTeste() {
  const casa = await criarCategoriaProfissional(banco, { slug: "teste-mp-casa", nome: "Serviços para casa (teste)" });
  const transporte = await criarCategoriaProfissional(banco, { slug: "teste-mp-transporte", nome: "Transporte e entregas (teste)" });

  const eletricista = await criarServicoProfissional(banco, { categoriaId: casa.id, slug: "teste-mp-eletricista", nome: "Eletricista" });
  t.eletricista = eletricista.id;
  for (const [slug, nome] of [["instalacao", "Instalação elétrica"], ["chuveiro", "Chuveiro"], ["quadro", "Quadro elétrico"]] as const) {
    t[`el-${slug}`] = (await criarEspecialidadeServico(banco, { servicoId: eletricista.id, slug, nome })).id;
  }
  const atendimentoEl = await criarAtributoServico(banco, { servicoId: eletricista.id, slug: "atendimento", nome: "Atendimento" });
  for (const [slug, nome] of [["residencial", "Residencial"], ["comercial", "Comercial"], ["emergencial", "Atendimento emergencial"]] as const) {
    t[`el-${slug}`] = (await criarOpcaoAtributo(banco, { atributoId: atendimentoEl.id, slug, nome })).id;
  }

  const pintor = await criarServicoProfissional(banco, { categoriaId: casa.id, slug: "teste-mp-pintor", nome: "Pintor" });
  t.pintor = pintor.id;
  for (const [slug, nome] of [["paredes", "Paredes"], ["fachadas", "Fachadas"]] as const) {
    t[`pi-${slug}`] = (await criarEspecialidadeServico(banco, { servicoId: pintor.id, slug, nome })).id;
  }
  const atendimentoPi = await criarAtributoServico(banco, { servicoId: pintor.id, slug: "atendimento", nome: "Atendimento" });
  for (const [slug, nome] of [["residencial", "Residencial"], ["comercial", "Comercial"]] as const) {
    t[`pi-${slug}`] = (await criarOpcaoAtributo(banco, { atributoId: atendimentoPi.id, slug, nome })).id;
  }
  const porte = await criarAtributoServico(banco, { servicoId: pintor.id, slug: "porte", nome: "Porte da obra", tipoSelecao: "unica" });
  t["pi-pequena"] = (await criarOpcaoAtributo(banco, { atributoId: porte.id, slug: "pequena", nome: "Pequena" })).id;
  t["pi-grande"] = (await criarOpcaoAtributo(banco, { atributoId: porte.id, slug: "grande", nome: "Grande" })).id;

  const entrega = await criarServicoProfissional(banco, {
    categoriaId: transporte.id,
    slug: "teste-mp-entrega",
    nome: "Entrega",
    termos: ["entregador"],
  });
  t.entrega = entrega.id;
  t["en-alimentos"] = (await criarEspecialidadeServico(banco, { servicoId: entrega.id, slug: "alimentos", nome: "Alimentos" })).id;
  const veiculoEn = await criarAtributoServico(banco, { servicoId: entrega.id, slug: "veiculo", nome: "Veículo" });
  t["en-moto"] = (await criarOpcaoAtributo(banco, { atributoId: veiculoEn.id, slug: "moto", nome: "Moto", termos: ["motoboy", "motoqueiro"] })).id;
  t["en-carro"] = (await criarOpcaoAtributo(banco, { atributoId: veiculoEn.id, slug: "carro", nome: "Carro" })).id;

  const passageiros = await criarServicoProfissional(banco, {
    categoriaId: transporte.id,
    slug: "teste-mp-passageiros",
    nome: "Transporte de passageiros",
  });
  t.passageiros = passageiros.id;
  const veiculoPa = await criarAtributoServico(banco, { servicoId: passageiros.id, slug: "veiculo", nome: "Veículo" });
  t["pa-moto"] = (await criarOpcaoAtributo(banco, { atributoId: veiculoPa.id, slug: "moto", nome: "Moto", termos: ["mototáxi", "mototaxista"] })).id;

  const limpeza = await criarServicoProfissional(banco, { categoriaId: casa.id, slug: "teste-mp-limpeza", nome: "Limpeza", termos: ["faxina", "diarista"] });
  t.limpeza = limpeza.id;
  t["li-residencial"] = (await criarEspecialidadeServico(banco, { servicoId: limpeza.id, slug: "residencial", nome: "Limpeza residencial" })).id;
  t["li-pos-obra"] = (await criarEspecialidadeServico(banco, { servicoId: limpeza.id, slug: "pos-obra", nome: "Pós-obra", termos: ["limpeza pós-obra"] })).id;
  const condicoes = await criarAtributoServico(banco, { servicoId: limpeza.id, slug: "condicoes", nome: "Condições" });
  t["li-material"] = (await criarOpcaoAtributo(banco, { atributoId: condicoes.id, slug: "leva-material", nome: "Leva material próprio" })).id;
  t["li-recorrente"] = (await criarOpcaoAtributo(banco, { atributoId: condicoes.id, slug: "recorrente", nome: "Aceita serviço recorrente" })).id;

  // Municípios FICTÍCIOS: um com malha de teste (descoberta pelo ponto), outro sem malha (só por código).
  await banco.insert(municipios).values([
    { codigoIbge: "0000001", nome: "Município fictício A (teste)", uf: "MG" },
    { codigoIbge: "0000002", nome: "Município fictício B (teste)", uf: "MG" },
  ]);
  await banco.insert(malhasMunicipio).values({
    codigoIbge: "0000001",
    versao: "2025",
    geometria: multipoligonoDeVertices([quadrado(FICTICIO_A, 0.1)]),
    fonte: "fixture de teste (não é malha do IBGE)",
    vigente: true,
  });
}

async function removerTaxonomiaDeTeste() {
  const servicos = banco.select({ id: servicosProfissionais.id }).from(servicosProfissionais).where(like(servicosProfissionais.slug, "teste-mp-%"));
  await banco.delete(termosBuscaServico).where(inArray(termosBuscaServico.servicoId, servicos));
  await banco.delete(opcoesAtributo).where(inArray(opcoesAtributo.servicoId, servicos));
  await banco.delete(atributosServico).where(inArray(atributosServico.servicoId, servicos));
  await banco.delete(especialidadesServico).where(inArray(especialidadesServico.servicoId, servicos));
  await banco.delete(servicosProfissionais).where(like(servicosProfissionais.slug, "teste-mp-%"));
  await banco.delete(categoriasProfissionais).where(like(categoriasProfissionais.slug, "teste-mp-%"));
  await banco.delete(municipios).where(inArray(municipios.codigoIbge, ["0000001", "0000002"]));
}

before(async () => {
  await ctx.iniciar();
  await removerTaxonomiaDeTeste();
  joao = await ctx.criarPessoa(0, "mp_joao", "João");
  maria = await ctx.criarPessoa(1, "mp_maria", "Maria");
  ana = await ctx.criarPessoa(2, "mp_ana", "Ana");
  pedro = await ctx.criarPessoa(3, "mp_pedro", "Pedro");
  semPerfil = await ctx.criarPessoa(4, "mp_sem_perfil", "Sem Perfil");
  outra = await ctx.criarPessoa(5, "mp_outra", "Outra");
  bia = await ctx.criarPessoa(6, "mp_bia", "Bia");
  await montarTaxonomiaDeTeste();

  // EXEMPLO 1 — João: um perfil, três serviços completamente diferentes.
  await prepararPerfil(joao, "Contagem", CONTAGEM);
  sp.joaoEletricista = await servico(joao, {
    servicoId: t.eletricista as string,
    especialidadeIds: [t["el-instalacao"], t["el-chuveiro"], t["el-quadro"]] as string[],
    opcaoIds: [t["el-residencial"], t["el-comercial"], t["el-emergencial"]] as string[],
  });
  sp.joaoPintor = await servico(joao, {
    servicoId: t.pintor as string,
    especialidadeIds: [t["pi-paredes"], t["pi-fachadas"]] as string[],
    opcaoIds: [t["pi-residencial"], t["pi-comercial"]] as string[],
  });
  sp.joaoEntrega = await servico(joao, { servicoId: t.entrega as string, opcaoIds: [t["en-carro"]] as string[] });
  await area(joao, { modalidade: "raio", raioMetros: 20_000, servicoPerfilIds: [sp.joaoEletricista] });
  await area(joao, { modalidade: "raio", raioMetros: 45_000, servicoPerfilIds: [sp.joaoPintor] });
  await area(joao, { modalidade: "raio", raioMetros: 3_000, servicoPerfilIds: [sp.joaoEntrega] });
  ar.joaoPoligono = await area(joao, { modalidade: "poligono", poligonos: [quadrado(PRACA_SETE, 0.01)] });
  await area(joao, { modalidade: "municipio", codigoIbge: "0000001" });
  // Horários de João, serviço a serviço (substituem o padrão criado com cada serviço).
  const horarios = (dias: number[], faixas: Array<[string, string]>) => ({
    periodos: dias.flatMap((diaSemana) => faixas.map(([inicio, fim]) => ({ diaSemana, inicio, fim }))),
  });
  exigir(await definirHorariosAtendimentoServico(banco, joao.identidadeId, sp.joaoEletricista, horarios([1, 2, 3, 4, 5], [["08:00", "12:00"], ["14:00", "18:00"]])), "definidos");
  exigir(await definirHorariosAtendimentoServico(banco, joao.identidadeId, sp.joaoPintor, horarios([6], [["08:00", "16:00"]])), "definidos");
  exigir(await definirHorariosAtendimentoServico(banco, joao.identidadeId, sp.joaoEntrega, horarios([1, 2, 3, 4, 5], [["18:00", "22:00"]])), "definidos");
  exigir(await ativarPerfilProfissional(banco, joao.identidadeId), "ativado");

  // EXEMPLO 2 — Maria: Entrega + veículo Moto (o "motoboy"), sem entidade própria para isso.
  await prepararPerfil(maria, "Contagem", ELDORADO);
  sp.mariaEntrega = await servico(maria, { servicoId: t.entrega as string, especialidadeIds: [t["en-alimentos"]] as string[], opcaoIds: [t["en-moto"]] as string[] });
  await area(maria, { modalidade: "raio", raioMetros: 10_000 });
  exigir(await ativarPerfilProfissional(banco, maria.identidadeId), "ativado");

  // Pedro: Transporte de passageiros + Moto (o "mototáxi") — a Moto DELE é outra linha, de outro serviço.
  await prepararPerfil(pedro, "Contagem", CONTAGEM);
  sp.pedroPassageiros = await servico(pedro, { servicoId: t.passageiros as string, opcaoIds: [t["pa-moto"]] as string[] });
  await area(pedro, { modalidade: "raio", raioMetros: 10_000 });
  exigir(await ativarPerfilProfissional(banco, pedro.identidadeId), "ativado");

  // EXEMPLO 3 — Ana: Limpeza, sem nada de veículo ou entrega.
  await prepararPerfil(ana, "Belo Horizonte", PRACA_SETE);
  sp.anaLimpeza = await servico(ana, {
    servicoId: t.limpeza as string,
    especialidadeIds: [t["li-residencial"], t["li-pos-obra"]] as string[],
    opcaoIds: [t["li-material"], t["li-recorrente"]] as string[],
  });
  await area(ana, { modalidade: "raio", raioMetros: 8_000 });
  await area(ana, { modalidade: "municipio", codigoIbge: "0000002" });
  exigir(await ativarPerfilProfissional(banco, ana.identidadeId), "ativado");
});

after(async () => {
  await banco.delete(perfisProfissionais).where(inArray(perfisProfissionais.identidadeId, [joao, maria, ana, pedro, semPerfil, outra, bia].map((p) => p.identidadeId)));
  await removerTaxonomiaDeTeste();
  await ctx.encerrar();
});

describe("perfil profissional pertence à pessoa existente", () => {
  it("é da identidade pessoal, sem criar conta nem identidade nova, e é idempotente", async () => {
    // Contagem restrita às contas DESTE arquivo: os arquivos de teste rodam em paralelo e criam
    // contas/identidades ao mesmo tempo — contar o banco inteiro tornava a asserção instável.
    const contasDoArquivo = banco.select({ id: users.id }).from(users).where(inArray(users.phoneNumber, TELEFONES));
    const contar = async () => ({
      contas: (await banco.select({ total: count() }).from(users).where(inArray(users.phoneNumber, TELEFONES)))[0]?.total,
      identidades: (await banco.select({ total: count() }).from(identidades).where(inArray(identidades.usuarioId, contasDoArquivo)))[0]?.total,
    });
    const antes = await contar();
    const primeiro = exigir(await obterOuCriarPerfilProfissional(banco, semPerfil.identidadeId), "ok");
    const segundo = exigir(await obterOuCriarPerfilProfissional(banco, semPerfil.identidadeId), "ok");
    assert.equal(primeiro.perfil.identidadeId, semPerfil.identidadeId);
    assert.equal(segundo.perfil.id, primeiro.perfil.id);
    assert.equal(primeiro.perfil.ativo, false);
    assert.deepEqual(await contar(), antes);
  });

  it("identidade EMPRESARIAL não tem perfil profissional (servidor e banco)", async () => {
    const criada = await ctx.api(joao, "POST", "/empresas", { nome: "Empresa MP", nomeUsuario: "mp_empresa", slug: "mp-empresa" });
    assert.equal(criada.statusCode, 201, criada.body);
    const identidadeEmpresa: string = criada.json().identidadeId;
    assert.equal((await obterOuCriarPerfilProfissional(banco, identidadeEmpresa)).tipo, "identidade-nao-pessoal");
    await assert.rejects(banco.insert(perfisProfissionais).values({ identidadeId: identidadeEmpresa }));
    await assert.rejects(banco.insert(perfisProfissionais).values({ identidadeId: identidadeEmpresa, identidadeTipo: "empresarial" }));
  });
});

describe("serviços do perfil (até 3)", () => {
  it("João tem 3 serviços diferentes; o quarto é recusado", async () => {
    const lido = await lerPerfilProfissionalDoDono(banco, joao.identidadeId);
    assert.equal(lido?.servicos.length, 3);
    const quarto = await adicionarServicoAoPerfil(banco, joao.identidadeId, { servicoId: t.limpeza });
    assert.deepEqual(quarto, { tipo: "limite-servicos", maximo: 3 });
  });

  it("aceita 1 ou 2 serviços, sem obrigar a preencher 3", async () => {
    assert.equal((await lerPerfilProfissionalDoDono(banco, maria.identidadeId))?.servicos.length, 1);
    exigir(await obterOuCriarPerfilProfissional(banco, outra.identidadeId), "ok");
    await servico(outra, { servicoId: t.eletricista as string });
    await servico(outra, { servicoId: t.pintor as string });
    assert.equal((await lerPerfilProfissionalDoDono(banco, outra.identidadeId))?.servicos.length, 2);
    assert.equal((await adicionarServicoAoPerfil(banco, outra.identidadeId, { servicoId: t.pintor })).tipo, "servico-duplicado");
  });

  it("especialidades e atributos ficam no serviço deles e não vazam para os outros", async () => {
    const lido = await lerPerfilProfissionalDoDono(banco, joao.identidadeId);
    const porServico = new Map(lido?.servicos.map((item) => [item.servicoId, item]));
    assert.deepEqual(porServico.get(t.eletricista as string)?.especialidades.map((e) => e.slug).sort(), ["chuveiro", "instalacao", "quadro"]);
    assert.deepEqual(porServico.get(t.pintor as string)?.especialidades.map((e) => e.slug).sort(), ["fachadas", "paredes"]);
    assert.deepEqual(porServico.get(t.entrega as string)?.especialidades, []);
    assert.deepEqual(porServico.get(t.entrega as string)?.opcoes.map((o) => o.slug), ["carro"]);

    // O servidor recusa escolher coisa de OUTRO serviço…
    assert.equal((await atualizarDetalhesServicoDoPerfil(banco, joao.identidadeId, sp.joaoPintor as string, { especialidadeIds: [t["el-chuveiro"]] })).tipo, "especialidade-invalida");
    assert.equal((await atualizarDetalhesServicoDoPerfil(banco, joao.identidadeId, sp.joaoEntrega as string, { opcaoIds: [t["el-residencial"]] })).tipo, "opcao-invalida");
    // …e o banco também (FK composta com o serviço).
    await assert.rejects(banco.insert(especialidadesServicoPerfil).values({ servicoPerfilId: sp.joaoPintor as string, servicoId: t.pintor as string, especialidadeId: t["el-chuveiro"] as string }));
  });

  it("atributo de seleção única aceita uma opção só", async () => {
    const duas = await atualizarDetalhesServicoDoPerfil(banco, joao.identidadeId, sp.joaoPintor as string, { opcaoIds: [t["pi-pequena"], t["pi-grande"]] });
    assert.equal(duas.tipo, "selecao-unica-violada");
  });

  it("Moto de Entrega (motoboy) e Moto de Transporte de passageiros (mototáxi) não se confundem", async () => {
    assert.deepEqual(await encontrados({ servicoId: t.entrega as string, opcaoIds: [t["en-moto"] as string], ponto: CONTAGEM }), [maria.identidadeId]);
    assert.deepEqual(await encontrados({ servicoId: t.passageiros as string, opcaoIds: [t["pa-moto"] as string], ponto: CONTAGEM }), [pedro.identidadeId]);
    // A Moto de Entrega não serve para Transporte de passageiros.
    assert.equal((await adicionarServicoAoPerfil(banco, maria.identidadeId, { servicoId: t.passageiros, opcaoIds: [t["en-moto"]] })).tipo, "opcao-invalida");
  });
});

describe("horários de atendimento por serviço", () => {
  const padrao = [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, inicio: "08:00", fim: "18:00" }));
  const servicosDe = async (pessoa: Pessoa) => (await lerPerfilProfissionalDoDono(banco, pessoa.identidadeId))?.servicos ?? [];

  it("serviço novo nasce segunda a sexta 08:00–18:00; sábado e domingo sem período", async () => {
    const servicos = await servicosDe(outra);
    assert.equal(servicos.length, 2);
    for (const servico of servicos) {
      assert.deepEqual(servico.periodos, padrao);
      assert.equal(servico.periodos.some((periodo) => periodo.diaSemana === 6), false);
      assert.equal(servico.periodos.some((periodo) => periodo.diaSemana === 7), false);
    }
  });

  it("o profissional altera os períodos; dois períodos no mesmo dia (almoço) são aceitos", async () => {
    const porServico = new Map((await servicosDe(joao)).map((servico) => [servico.id, servico.periodos]));
    const segunda = porServico.get(sp.joaoEletricista as string)?.filter((periodo) => periodo.diaSemana === 1);
    assert.deepEqual(segunda, [
      { diaSemana: 1, inicio: "08:00", fim: "12:00" },
      { diaSemana: 1, inicio: "14:00", fim: "18:00" },
    ]);
    assert.deepEqual(porServico.get(sp.joaoPintor as string), [{ diaSemana: 6, inicio: "08:00", fim: "16:00" }]);
    assert.equal(porServico.get(sp.joaoEntrega as string)?.length, 5);
  });

  it("sobreposição e início ≥ fim são recusados pelo servidor e pelo banco", async () => {
    const eletricistaDela = (await servicosDe(outra)).find((servico) => servico.servicoId === t.eletricista)?.id as string;
    const sobrepostos = { periodos: [{ diaSemana: 1, inicio: "08:00", fim: "12:00" }, { diaSemana: 1, inicio: "11:00", fim: "15:00" }] };
    assert.equal((await definirHorariosAtendimentoServico(banco, outra.identidadeId, eletricistaDela, sobrepostos)).tipo, "dados-invalidos");
    const invertido = { periodos: [{ diaSemana: 2, inicio: "18:00", fim: "08:00" }] };
    assert.equal((await definirHorariosAtendimentoServico(banco, outra.identidadeId, eletricistaDela, invertido)).tipo, "dados-invalidos");
    // Nada mudou.
    assert.deepEqual((await servicosDe(outra)).find((servico) => servico.id === eletricistaDela)?.periodos, padrao);

    // Banco: trigger (sobreposição, inclusive dentro do mesmo INSERT) e CHECK (início < fim).
    await assert.rejects(banco.insert(periodosAtendimento).values({ servicoPerfilId: eletricistaDela, diaSemana: 1, inicio: "17:00", fim: "19:00" }));
    await assert.rejects(
      banco.insert(periodosAtendimento).values([
        { servicoPerfilId: eletricistaDela, diaSemana: 6, inicio: "08:00", fim: "12:00" },
        { servicoPerfilId: eletricistaDela, diaSemana: 6, inicio: "10:00", fim: "13:00" },
      ]),
    );
    await assert.rejects(banco.insert(periodosAtendimento).values({ servicoPerfilId: eletricistaDela, diaSemana: 6, inicio: "12:00", fim: "12:00" }));
    // Encostar não é sobrepor: 18:00–22:00 depois de 08:00–18:00 é válido.
    await banco.insert(periodosAtendimento).values({ servicoPerfilId: eletricistaDela, diaSemana: 1, inicio: "18:00", fim: "22:00" });
    exigir(await definirHorariosAtendimentoServico(banco, outra.identidadeId, eletricistaDela, { periodos: padrao }), "definidos");
  });

  it("24 horas é só configurar 00:00–24:00; lista vazia = não atende em dia nenhum", async () => {
    const pintorDela = (await servicosDe(outra)).find((servico) => servico.servicoId === t.pintor)?.id as string;
    exigir(await definirHorariosAtendimentoServico(banco, outra.identidadeId, pintorDela, { periodos: [{ diaSemana: 7, inicio: "00:00", fim: "24:00" }] }), "definidos");
    assert.deepEqual((await servicosDe(outra)).find((servico) => servico.id === pintorDela)?.periodos, [{ diaSemana: 7, inicio: "00:00", fim: "24:00" }]);
    exigir(await definirHorariosAtendimentoServico(banco, outra.identidadeId, pintorDela, { periodos: [] }), "definidos");
    assert.deepEqual((await servicosDe(outra)).find((servico) => servico.id === pintorDela)?.periodos, []);
  });

  it("serviço de outra pessoa não tem horário alterado", async () => {
    assert.equal((await definirHorariosAtendimentoServico(banco, maria.identidadeId, sp.joaoEntrega as string, { periodos: [] })).tipo, "servico-nao-encontrado");
  });
});

describe("agendamento é opcional e decidido por serviço", () => {
  it("João permite agendar Eletricista e Pintor, não Entrega; nada é reservado", async () => {
    exigir(await definirConfiguracaoServico(banco, joao.identidadeId, sp.joaoEletricista as string, { permiteAgendamento: true }), "salva");
    exigir(await definirConfiguracaoServico(banco, joao.identidadeId, sp.joaoPintor as string, { permiteAgendamento: true }), "salva");
    const servicos = (await lerPerfilProfissionalDoDono(banco, joao.identidadeId))?.servicos ?? [];
    const permite = Object.fromEntries(servicos.map((servico) => [servico.id, servico.permiteAgendamento]));
    assert.deepEqual(permite, { [sp.joaoEletricista as string]: true, [sp.joaoPintor as string]: true, [sp.joaoEntrega as string]: false });
    // Maria nunca mexeu: o padrão é NÃO.
    assert.equal((await lerPerfilProfissionalDoDono(banco, maria.identidadeId))?.servicos[0]?.permiteAgendamento, false);
    // Permitir não cria reserva: não existe tabela de agenda/reserva nesta etapa.
    const tabelas = await banco.execute<{ nome: string }>(sql`select table_name as nome from information_schema.tables where table_schema = 'public' and table_name ~ '(agend|reserva)'`);
    assert.deepEqual(tabelas.rows, []);
  });

  it("serviço sem agendamento continua sendo encontrado normalmente (Agenda não é obrigatória)", async () => {
    assert.deepEqual(await encontrados({ servicoId: t.entrega as string, opcaoIds: [t["en-carro"] as string], ponto: PRACA_SETE }), [joao.identidadeId]);
  });
});

describe("áreas de atuação (até 5 ativas)", () => {
  it("João usa as 5 áreas; a sexta é recusada", async () => {
    assert.deepEqual(await adicionarAreaAtuacao(banco, joao.identidadeId, { modalidade: "raio", raioMetros: 1000 }), { tipo: "limite-areas", maximo: 5 });
  });

  it("o limite é de 5 áreas ATIVAS: desativadas ficam salvas, não contam, e reativar respeita o limite", async () => {
    exigir(await obterOuCriarPerfilProfissional(banco, bia.identidadeId), "ok");
    const poligonoEm = (latitude: number) => ({ modalidade: "poligono", poligonos: [quadrado({ latitude, longitude: -44 }, 0.02)] });
    const ids: string[] = [];
    for (let indice = 0; indice < 5; indice += 1) ids.push(await area(bia, poligonoEm(-19.5 - indice * 0.1)));
    const [primeira, segunda] = ids as [string, string];
    assert.deepEqual(await adicionarAreaAtuacao(banco, bia.identidadeId, poligonoEm(-20.2)), { tipo: "limite-areas", maximo: 5 });

    // Desativar libera vaga, sem apagar a área.
    exigir(await definirAreaAtiva(banco, bia.identidadeId, primeira, false), "definida");
    const substituta = await area(bia, poligonoEm(-20.2));
    exigir(await definirAreaAtiva(banco, bia.identidadeId, segunda, false), "definida");
    await area(bia, poligonoEm(-20.3));

    // 5 ativas + 2 desativadas é válido.
    const perfilBia = (await lerPerfilProfissionalDoDono(banco, bia.identidadeId))?.perfil.id as string;
    const [contagem] = (
      await banco.execute<{ total: number; ativas: number }>(sql`select count(*)::int as total, (count(*) filter (where ativa))::int as ativas from areas_atuacao where perfil_id = ${perfilBia}`)
    ).rows;
    assert.deepEqual(contagem, { total: 7, ativas: 5 });

    // Reativar com 5 ativas é recusado; depois de desativar outra, é aceito.
    assert.deepEqual(await definirAreaAtiva(banco, bia.identidadeId, primeira, true), { tipo: "limite-areas", maximo: 5 });
    exigir(await definirAreaAtiva(banco, bia.identidadeId, substituta, false), "definida");
    exigir(await definirAreaAtiva(banco, bia.identidadeId, primeira, true), "definida");
    // Área de outra pessoa não existe para quem pergunta.
    assert.equal((await definirAreaAtiva(banco, joao.identidadeId, primeira, false)).tipo, "area-nao-encontrada");
  });

  it("raio até 50 km é aceito; acima de 50 km ou zero é recusado; sem ponto de base não há raio", async () => {
    assert.equal((await adicionarAreaAtuacao(banco, outra.identidadeId, { modalidade: "raio", raioMetros: 50_000 })).tipo, "base-sem-ponto");
    exigir(await salvarBaseProfissional(banco, outra.identidadeId, baseEm("Contagem")), "salva");
    exigir(await confirmarPontoBaseProfissional(banco, outra.identidadeId, CONTAGEM), "confirmado");
    await area(outra, { modalidade: "raio", raioMetros: 50_000 });
    assert.equal((await adicionarAreaAtuacao(banco, outra.identidadeId, { modalidade: "raio", raioMetros: 50_001 })).tipo, "dados-invalidos");
    assert.equal((await adicionarAreaAtuacao(banco, outra.identidadeId, { modalidade: "raio", raioMetros: 0 })).tipo, "dados-invalidos");
  });

  it("geometria inválida e município inexistente são recusados", async () => {
    const laco = [CONTAGEM, { latitude: -19.8, longitude: -43.9 }, { latitude: -19.8, longitude: -44.1 }, { latitude: -19.95, longitude: -43.9 }];
    assert.equal((await adicionarAreaAtuacao(banco, outra.identidadeId, { modalidade: "poligono", poligonos: [laco] })).tipo, "dados-invalidos");
    // Dois polígonos sobrepostos na mesma área: o PostGIS (ST_IsValid) recusa.
    const sobrepostos = [quadrado(PRACA_SETE, 0.02), quadrado(PRACA_SETE, 0.01)];
    assert.equal((await adicionarAreaAtuacao(banco, outra.identidadeId, { modalidade: "poligono", poligonos: sobrepostos })).tipo, "geometria-invalida");
    assert.equal((await adicionarAreaAtuacao(banco, outra.identidadeId, { modalidade: "municipio", codigoIbge: "9999999" })).tipo, "municipio-nao-encontrado");
  });

  it("serviço de OUTRO perfil não pode ser vinculado à área (servidor e banco)", async () => {
    const resultado = await adicionarAreaAtuacao(banco, ana.identidadeId, { modalidade: "raio", raioMetros: 5000, servicoPerfilIds: [sp.joaoEletricista] });
    assert.equal(resultado.tipo, "servico-de-outro-perfil");
    const perfilAna = (await lerPerfilProfissionalDoDono(banco, ana.identidadeId))?.perfil.id as string;
    const [areaAna] = await banco.execute<{ id: string }>(sql`select id from areas_atuacao where perfil_id = ${perfilAna} limit 1`).then((r) => r.rows);
    await assert.rejects(banco.insert(areasAtuacaoServicos).values({ areaId: areaAna?.id as string, perfilId: perfilAna, servicoPerfilId: sp.joaoEletricista as string }));
  });
});

describe("matching geográfico", () => {
  it("raio: dentro corresponde, fora não; distância pública só quando a cobertura vem do raio", async () => {
    // Praça Sete fica a ~12 km: dentro dos 20 km do Eletricista.
    const [eletricista] = await buscarProfissionaisCompativeis(banco, { servicoId: t.eletricista as string, ponto: PRACA_SETE });
    assert.equal(eletricista?.identidadeId, joao.identidadeId);
    assert.equal(eletricista?.cobertoPorRaio, true);
    // 30 km: fora do raio do Eletricista (20 km), dentro do raio do Pintor (45 km).
    assert.deepEqual(await encontrados({ servicoId: t.eletricista as string, ponto: TRINTA_KM_OESTE }), []);
    assert.deepEqual(await encontrados({ servicoId: t.pintor as string, ponto: TRINTA_KM_OESTE }), [joao.identidadeId]);
  });

  it("área ESPECÍFICA restringe por serviço; área GERAL atende todos os serviços do perfil", async () => {
    // A 10 km: o raio de 20 km é só do Eletricista; Entrega (raio de 3 km) não atende.
    assert.deepEqual(await encontrados({ servicoId: t.eletricista as string, ponto: DEZ_KM_OESTE }), [joao.identidadeId]);
    assert.deepEqual(await encontrados({ servicoId: t.entrega as string, opcaoIds: [t["en-carro"] as string], ponto: DEZ_KM_OESTE }), []);
    // Na Praça Sete, Entrega entra pelo POLÍGONO geral (não pelo raio de 3 km)…
    const [entrega] = await buscarProfissionaisCompativeis(banco, { servicoId: t.entrega as string, opcaoIds: [t["en-carro"] as string], ponto: PRACA_SETE });
    assert.equal(entrega?.identidadeId, joao.identidadeId);
    assert.equal(entrega?.cobertoPorRaio, false);
    // …e no público aparece "Atende sua região", sem distância inventada.
    const [publico] = await paraResultadosPublicos(banco, entrega ? [entrega] : []);
    assert.equal(publico?.distanciaAproximadaMetros, null);
  });

  it("polígono: dentro e BORDA correspondem; fora não", async () => {
    const borda = { latitude: PRACA_SETE.latitude + 0.01, longitude: PRACA_SETE.longitude };
    const consulta = (ponto: Coordenadas) => encontrados({ servicoId: t.entrega as string, opcaoIds: [t["en-carro"] as string], ponto });
    assert.deepEqual(await consulta(PRACA_SETE), [joao.identidadeId]);
    assert.deepEqual(await consulta(borda), [joao.identidadeId]);
    assert.deepEqual(await consulta(BH_NORTE), []);
  });

  it("município: pela malha vigente (ponto) ou pelo código informado, nunca pelo nome", async () => {
    assert.deepEqual(await encontrados({ servicoId: t.entrega as string, ponto: FICTICIO_A }), [joao.identidadeId]);
    assert.deepEqual(await encontrados({ servicoId: t.limpeza as string, ponto: LONGE }), []);
    assert.deepEqual(await encontrados({ servicoId: t.limpeza as string, ponto: LONGE, codigoIbgeDoPonto: "0000002" }), [ana.identidadeId]);
    // Com malha cobrindo o ponto, a GEOMETRIA manda: o código informado não contradiz a coordenada.
    assert.deepEqual(await encontrados({ servicoId: t.limpeza as string, ponto: FICTICIO_A, codigoIbgeDoPonto: "0000002" }), []);
  });

  it("especialidades exigidas: todas precisam estar no serviço do profissional", async () => {
    assert.deepEqual(await encontrados({ servicoId: t.limpeza as string, especialidadeIds: [t["li-pos-obra"] as string], ponto: PRACA_SETE }), [ana.identidadeId]);
    assert.deepEqual(await encontrados({ servicoId: t.eletricista as string, especialidadeIds: [t["el-chuveiro"] as string], ponto: PRACA_SETE }), [joao.identidadeId]);
  });

  it("horário é avaliado POR SERVIÇO: no mesmo instante João atende como Entregador e não como Eletricista", async () => {
    // Segunda, 28/09/2026, 22:30 UTC = 19:30 em São Paulo.
    const noiteSegunda = { instante: new Date("2026-09-28T22:30:00.000Z") };
    const entregaNaPraca = { servicoId: t.entrega as string, opcaoIds: [t["en-carro"] as string], ponto: PRACA_SETE };
    const eletricistaNaPraca = { servicoId: t.eletricista as string, ponto: PRACA_SETE };
    assert.deepEqual(await encontrados({ ...entregaNaPraca, horario: noiteSegunda, somenteNoHorario: true }), [joao.identidadeId]);
    assert.deepEqual(await encontrados({ ...eletricistaNaPraca, horario: noiteSegunda, somenteNoHorario: true }), []);
    // 15:00 em São Paulo (18:00 UTC): o contrário.
    const tardeSegunda = { instante: new Date("2026-09-28T18:00:00.000Z") };
    assert.deepEqual(await encontrados({ ...eletricistaNaPraca, horario: tardeSegunda, somenteNoHorario: true }), [joao.identidadeId]);
    assert.deepEqual(await encontrados({ ...entregaNaPraca, horario: tardeSegunda, somenteNoHorario: true }), []);
    // 12:30 é o intervalo de almoço do Eletricista (08–12 + 14–18).
    const almoco = { instante: new Date("2026-09-28T15:30:00.000Z") };
    assert.deepEqual(await encontrados({ ...eletricistaNaPraca, horario: almoco, somenteNoHorario: true }), []);
  });

  it("sem filtrar, o horário só é informado; sem horário consultado, fica null", async () => {
    const [comHorario] = await buscarProfissionaisCompativeis(banco, { servicoId: t.eletricista as string, ponto: PRACA_SETE, horario: { instante: new Date("2026-09-28T22:30:00.000Z") } });
    assert.equal(comHorario?.identidadeId, joao.identidadeId);
    assert.equal(comHorario?.atendeNoHorario, false);
    const [semHorario] = await buscarProfissionaisCompativeis(banco, { servicoId: t.eletricista as string, ponto: PRACA_SETE });
    assert.equal(semHorario?.atendeNoHorario, null);
  });

  it("aceita horário SEMANAL de referência ('quem atende terça às 15:00?')", async () => {
    const ponto = PRACA_SETE;
    assert.deepEqual(await encontrados({ servicoId: t.eletricista as string, ponto, horario: { diaSemana: 2, hora: "15:00" }, somenteNoHorario: true }), [joao.identidadeId]);
    // Pintor só aos sábados (08–16); Pintor de João cobre 30 km a oeste pelo raio de 45 km.
    const pintor = { servicoId: t.pintor as string, ponto: TRINTA_KM_OESTE, somenteNoHorario: true };
    assert.deepEqual(await encontrados({ ...pintor, horario: { diaSemana: 6, hora: "10:00" } }), [joao.identidadeId]);
    assert.deepEqual(await encontrados({ ...pintor, horario: { diaSemana: 2, hora: "10:00" } }), []);
    assert.deepEqual(await encontrados({ ...pintor, horario: { diaSemana: 7, hora: "10:00" } }), []);
  });

  it("o instante é lido no FUSO do perfil, não em UTC", async () => {
    // 21:30 UTC = 18:30 em São Paulo (Entrega aberta) = 17:30 em Manaus (Entrega fechada, Eletricista aberto).
    const instante = { instante: new Date("2026-09-28T21:30:00.000Z") };
    const entrega = { servicoId: t.entrega as string, opcaoIds: [t["en-carro"] as string], ponto: PRACA_SETE, horario: instante, somenteNoHorario: true };
    const eletricista = { servicoId: t.eletricista as string, ponto: PRACA_SETE, horario: instante, somenteNoHorario: true };
    assert.deepEqual(await encontrados(entrega), [joao.identidadeId]);
    assert.deepEqual(await encontrados(eletricista), []);
    exigir(await definirPreferenciasPerfil(banco, joao.identidadeId, { fusoHorario: "America/Manaus" }), "salvo");
    try {
      assert.deepEqual(await encontrados(entrega), []);
      assert.deepEqual(await encontrados(eletricista), [joao.identidadeId]);
    } finally {
      exigir(await definirPreferenciasPerfil(banco, joao.identidadeId, { fusoHorario: "America/Sao_Paulo" }), "salvo");
    }
    assert.equal((await definirPreferenciasPerfil(banco, joao.identidadeId, { fusoHorario: "Hora/Inventada" })).tipo, "dados-invalidos");
  });

  it("área DESATIVADA deixa de cobrir e volta a cobrir ao ser reativada", async () => {
    const entregaNaPraca = { servicoId: t.entrega as string, opcaoIds: [t["en-carro"] as string], ponto: PRACA_SETE };
    exigir(await definirAreaAtiva(banco, joao.identidadeId, ar.joaoPoligono as string, false), "definida");
    assert.deepEqual(await encontrados(entregaNaPraca), []);
    exigir(await definirAreaAtiva(banco, joao.identidadeId, ar.joaoPoligono as string, true), "definida");
    assert.deepEqual(await encontrados(entregaNaPraca), [joao.identidadeId]);
  });

  it("raio da busca limita pela distância da base ('mototáxi em até 3 km')", async () => {
    assert.deepEqual(await encontrados({ servicoId: t.passageiros as string, ponto: ELDORADO, raioBuscaMetros: 3_000 }), [pedro.identidadeId]);
    assert.deepEqual(await encontrados({ servicoId: t.passageiros as string, ponto: DEZ_KM_OESTE, raioBuscaMetros: 3_000 }), []);
  });

  it("perfil inativo não aparece; ativar exige base, serviço e área", async () => {
    const pendente = await ativarPerfilProfissional(banco, semPerfil.identidadeId);
    assert.deepEqual(pendente, { tipo: "requisitos-pendentes", pendencias: ["base", "atividade", "area"] });
    // Outra tem serviços + raio de 50 km, mas ainda não ativou (João aparece: o raio dele cobre Contagem).
    assert.equal((await encontrados({ servicoId: t.eletricista as string, ponto: CONTAGEM })).includes(outra.identidadeId), false);
    exigir(await ativarPerfilProfissional(banco, outra.identidadeId), "ativado");
    assert.ok((await encontrados({ servicoId: t.eletricista as string, ponto: CONTAGEM })).includes(outra.identidadeId));
  });

  it("remover o último serviço de uma área restrita NÃO a transforma em área geral", async () => {
    const perfil = await lerPerfilProfissionalDoDono(banco, outra.identidadeId);
    const pintorDela = perfil?.servicos.find((item) => item.servicoId === t.pintor)?.id as string;
    await area(outra, { modalidade: "poligono", poligonos: [quadrado(LONGE, 0.05)], servicoPerfilIds: [pintorDela] });
    assert.deepEqual(await encontrados({ servicoId: t.pintor as string, ponto: LONGE }), [outra.identidadeId]);
    exigir(await removerServicoDoPerfilProfissional(banco, outra.identidadeId, pintorDela), "removido");
    assert.deepEqual(await encontrados({ servicoId: t.eletricista as string, ponto: LONGE }), []);
  });

  it("as consultas espaciais usam os índices GiST (raio pela base, polígono pela área)", async () => {
    const usa = (consulta: ReturnType<typeof sql>, indice: string) =>
      banco.transaction(async (transacao) => {
        await transacao.execute(sql`set local enable_seqscan = off`);
        return JSON.stringify((await transacao.execute(sql`explain (format json) ${consulta}`)).rows).includes(indice);
      });
    const ponto = sql`ST_SetSRID(ST_MakePoint(${PRACA_SETE.longitude}::double precision, ${PRACA_SETE.latitude}::double precision), 4326)`;
    assert.ok(await usa(sql`select perfil_id from bases_profissionais where ponto is not null and ST_DWithin((ponto)::geography, (${ponto})::geography, 50000)`, "bases_profissionais_ponto_gist"));
    assert.ok(await usa(sql`select id from areas_atuacao where modalidade = 'poligono' and ativa and ST_Covers(cobertura, ${ponto})`, "areas_atuacao_cobertura_gist"));
  });
});

describe("busca textual de serviços (sem IA)", () => {
  const achar = async (termo: string) => (await buscarServicosPorTermo(banco, termo)).filter((item) => Object.values(t).includes(item.servicoId));

  it("nome exato, sem acento e sem diferenciar maiúsculas", async () => {
    const [primeiro] = await achar("ELETRÍCISTA");
    assert.equal(primeiro?.servicoId, t.eletricista);
    assert.equal(primeiro?.prioridade, 0);
  });

  it("prefixo e erro de digitação (trigramas) também encontram", async () => {
    assert.deepEqual((await achar("eletri"))[0]?.prioridade, 1);
    const [digitado] = await achar("eletrecista");
    assert.equal(digitado?.servicoId, t.eletricista);
    assert.equal(digitado?.prioridade, 2);
  });

  it("aliases levam ao serviço e ao detalhe certo: motoboy → Entrega + Moto; mototaxi → Transporte + Moto", async () => {
    const [motoboy] = await achar("motoboy");
    assert.deepEqual([motoboy?.servicoId, motoboy?.opcaoId], [t.entrega, t["en-moto"]]);
    const [mototaxi] = await achar("mototaxi");
    assert.deepEqual([mototaxi?.servicoId, mototaxi?.opcaoId], [t.passageiros, t["pa-moto"]]);
  });

  it("'limpeza pos obra' encontra Limpeza + Pós-obra", async () => {
    const [primeiro] = await achar("limpeza pos obra");
    assert.deepEqual([primeiro?.servicoId, primeiro?.especialidadeId], [t.limpeza, t["li-pos-obra"]]);
  });

  it("o catálogo vem do banco (nada fixo no frontend)", async () => {
    const catalogo = await listarCatalogoServicos(banco);
    const entrega = catalogo.categorias.flatMap((categoria) => categoria.servicos).find((item) => item.id === t.entrega);
    assert.deepEqual(entrega?.atributos[0]?.opcoes.map((opcao) => opcao.slug).sort(), ["carro", "moto"]);
  });
});

describe("catálogo inicial: Entregador + Veículo=Moto por termo (grafia compacta)", () => {
  // IDs FIXOS semeados pela migration 0035 (catálogo real, não fixture).
  const ENTREGADOR = "0199b000-0000-7000-8000-000000000011";
  const MOTOTAXI = "0199b000-0000-7000-8000-000000000012";
  const CABELEIREIRO = "0199b000-0000-7000-8000-000000000013";
  const MOTO = "0199b000-0000-7000-8000-000000000031";
  const CORTE_MASCULINO = "0199b000-0000-7000-8000-000000000041";
  const REAIS = [ENTREGADOR, MOTOTAXI, CABELEIREIRO];
  const resolver = async (termo: string) => (await buscarServicosPorTermo(banco, termo)).filter((item) => REAIS.includes(item.servicoId));

  it("a opção devolvida é de fato Veículo=Moto do Entregador", async () => {
    const [opcao] = await banco
      .select({ slug: opcoesAtributo.slug, servicoId: opcoesAtributo.servicoId, atributo: atributosServico.slug })
      .from(opcoesAtributo)
      .innerJoin(atributosServico, eq(atributosServico.id, opcoesAtributo.atributoId))
      .where(eq(opcoesAtributo.id, MOTO));
    assert.deepEqual(opcao, { slug: "moto", servicoId: ENTREGADOR, atributo: "veiculo" });
  });

  for (const termo of ["motoboy", "Motoboy", "MOTOBOY", "moto boy", "MOTO BOY", "moto-boy", "entregador de moto", "Entregador de Moto"]) {
    it(`"${termo}" → Entregador + Moto, como correspondência exata`, async () => {
      const [primeiro] = await resolver(termo);
      assert.deepEqual([primeiro?.servicoId, primeiro?.especialidadeId, primeiro?.opcaoId, primeiro?.prioridade], [ENTREGADOR, null, MOTO, 0]);
    });
  }

  it('"moto" continua AMBÍGUO: Entregador+Moto e Mototáxi aparecem, nenhum como exato', async () => {
    const resultados = await resolver("moto");
    assert.ok(resultados.some((item) => item.servicoId === ENTREGADOR && item.opcaoId === MOTO));
    assert.ok(resultados.some((item) => item.servicoId === MOTOTAXI));
    assert.equal(resultados.some((item) => item.prioridade === 0), false);
  });

  it("variações de grafia não viram linhas nem atividades novas", async () => {
    const termosMoto = await banco.select({ termo: termosBuscaServico.termo }).from(termosBuscaServico).where(eq(termosBuscaServico.opcaoId, MOTO));
    assert.deepEqual(termosMoto.map((linha) => linha.termo).sort(), ["Entregador de moto", "Motoboy", "Motoqueiro"]);
    const reais = await banco.select({ slug: servicosProfissionais.slug }).from(servicosProfissionais).where(inArray(servicosProfissionais.id, REAIS));
    assert.deepEqual(reais.map((linha) => linha.slug).sort(), ["cabeleireiro", "entregador", "mototaxi"]);
    const [compacto] = await banco.select({ c: termosBuscaServico.termoCompacto }).from(termosBuscaServico).where(eq(termosBuscaServico.termo, "Moto táxi"));
    assert.equal(compacto?.c, "mototaxi");
  });

  it("Mototáxi e Cabeleireiro seguem iguais (sem regressão)", async () => {
    for (const termo of ["mototaxi", "Moto táxi", "MOTOTAXISTA"]) {
      const [primeiro] = await resolver(termo);
      assert.deepEqual([primeiro?.servicoId, primeiro?.opcaoId, primeiro?.prioridade], [MOTOTAXI, null, 0], termo);
    }
    const [corte] = await resolver("corte masculino");
    assert.deepEqual([corte?.servicoId, corte?.especialidadeId, corte?.prioridade], [CABELEIREIRO, CORTE_MASCULINO, 0]);
    const [cabelo] = await resolver("cabeleireira");
    assert.deepEqual([cabelo?.servicoId, cabelo?.opcaoId], [CABELEIREIRO, null]);
  });
});

describe("preferências e privacidade", () => {
  it("'Oportunidades de outras regiões' começa em Não e é persistida", async () => {
    assert.equal((await lerPerfilProfissionalDoDono(banco, maria.identidadeId))?.perfil.recebeOportunidadesOutrasRegioes, false);
    exigir(await definirPreferenciasPerfil(banco, maria.identidadeId, { recebeOportunidadesOutrasRegioes: true }), "salvo");
    assert.equal((await lerPerfilProfissionalDoDono(banco, maria.identidadeId))?.perfil.recebeOportunidadesOutrasRegioes, true);
  });

  it("resultado PÚBLICO não tem base, endereço, coordenada nem geometria; distância é arredondada", async () => {
    const internos = await buscarProfissionaisCompativeis(banco, { servicoId: t.eletricista as string, ponto: PRACA_SETE });
    const publicos = await paraResultadosPublicos(banco, internos);
    assert.ok(publicos.length > 0);
    for (const item of publicos) assert.equal(profissionalEncontradoSchema.safeParse(item).success, true);
    const texto = JSON.stringify(publicos);
    for (const proibido of ["latitude", "longitude", "logradouro", "cep", "ponto", "cobertura", "poligonos", "Rua de Teste"]) assert.equal(texto.includes(proibido), false, proibido);
    const joaoPublico = publicos.find((item) => item.identidadeId === joao.identidadeId);
    assert.equal(joaoPublico?.distanciaAproximadaMetros, 13_000);
    assert.deepEqual(joaoPublico?.regiao, { cidade: "Contagem", uf: "MG" });
    assert.deepEqual(joaoPublico?.especialidades.map((e) => e.nome).sort(), ["Chuveiro", "Instalação elétrica", "Quadro elétrico"]);
  });

  it("mudar campo estrutural da base derruba o ponto; ponto de referência não", async () => {
    exigir(await salvarBaseProfissional(banco, outra.identidadeId, { ...baseEm("Contagem"), pontoReferencia: "Perto da praça" }), "salva");
    assert.ok((await lerPerfilProfissionalDoDono(banco, outra.identidadeId))?.base?.ponto);
    const mudouNumero = exigir(await salvarBaseProfissional(banco, outra.identidadeId, { ...baseEm("Contagem"), numero: "200" }), "salva");
    assert.equal(mudouNumero.pontoMantido, false);
    assert.equal((await lerPerfilProfissionalDoDono(banco, outra.identidadeId))?.base?.ponto, null);
  });
});
