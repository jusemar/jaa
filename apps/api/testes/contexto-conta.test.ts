import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { perfisProfissionais } from "@jaa/banco/schema";
import { contextoContaRespostaSchema, contextoContaSchema, respostaPerfilProfissionalSchema, type ContextoConta } from "@jaa/contratos";
import { inArray } from "drizzle-orm";
import { como, criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * CONTEXTO DA CONTA (`GET /conta/contexto`): resumo de navegação montado a partir dos domínios REAIS
 * (vínculos de entregador, Perfil Profissional, empresas). Os cenários usam só as rotas públicas da API.
 */

const PREFIXO = `ctx${randomUUID().slice(0, 4)}`;
const ENTREGADOR_ATIVIDADE = "0199b000-0000-7000-8000-000000000011";
const MOTO = "0199b000-0000-7000-8000-000000000031";
const CABELEIREIRO_ATIVIDADE = "0199b000-0000-7000-8000-000000000013";

const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987697001", "+5531987697002", "+5531987697003", "+5531987697004", "+5531987697005"],
  prefixoIp: "198.18.97.",
});

let comum: Pessoa; // pessoa sem capacidade nenhuma
let dona: Pessoa; // opera duas empresas
let entregador: Pessoa; // entregador em duas empresas + Perfil Profissional ativo
let convidado: Pessoa; // só convite pendente + perfil criado e nunca ativado
let incompleto: Pessoa; // perfil ativado e depois sem área
const empresas: { id: string; identidadeId: string }[] = [];

async function contexto(pessoa: Pessoa | null): Promise<ContextoConta> {
  const resposta = await ctx.api(pessoa, "GET", "/conta/contexto");
  assert.equal(resposta.statusCode, 200, resposta.body);
  // A resposta REAL vale nos dois lados: estrita (o que a API promete) e tolerante (o que o cliente lê).
  assert.equal(contextoContaSchema.safeParse(resposta.json()).success, true);
  return contextoContaRespostaSchema.parse(resposta.json());
}

async function ok(pessoa: Pessoa, metodo: "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown) {
  const resposta = await ctx.api(pessoa, metodo, caminho, corpo);
  assert.ok(resposta.statusCode < 300, `${metodo} ${caminho}: ${resposta.body}`);
  return resposta.json();
}

// Perfil Profissional UTILIZÁVEL pelo caminho real: base com ponto, atividade, área e ativar.
async function ativarPerfil(pessoa: Pessoa, atividadeId: string) {
  await ok(pessoa, "POST", "/profissional/perfil");
  await ok(pessoa, "PUT", "/profissional/perfil/base", { cep: "30130-010", logradouro: "Avenida Afonso Pena", numero: "1000", bairro: "Centro", cidade: "Belo Horizonte", uf: "MG" });
  await ok(pessoa, "PUT", "/profissional/perfil/base/ponto", { latitude: -19.9191, longitude: -43.9386 });
  // O Entregador exige veículo (atributo obrigatório do catálogo); as demais atividades entram sem escolha.
  await ok(pessoa, "POST", "/profissional/perfil/atividades", { servicoId: atividadeId, ...(atividadeId === ENTREGADOR_ATIVIDADE ? { opcaoIds: [MOTO] } : {}) });
  await ok(pessoa, "POST", "/profissional/perfil/areas", { modalidade: "raio", raioMetros: 5000 });
  const ativo = respostaPerfilProfissionalSchema.parse(await ok(pessoa, "POST", "/profissional/perfil/ativar")).perfil;
  assert.equal(ativo?.situacao, "ativo");
  return ativo;
}

const tipos = (valor: ContextoConta) => valor.capacidades.map((capacidade) => capacidade.tipo);

before(async () => {
  await ctx.iniciar();
  comum = await ctx.criarPessoa(0, `${PREFIXO}_comum`, "Comum");
  dona = await ctx.criarPessoa(1, `${PREFIXO}_dona`, "Dona");
  entregador = await ctx.criarPessoa(2, `${PREFIXO}_ent`, "Entregador");
  convidado = await ctx.criarPessoa(3, `${PREFIXO}_conv`, "Convidado");
  incompleto = await ctx.criarPessoa(4, `${PREFIXO}_inc`, "Incompleto");

  for (const sufixo of ["a", "b"]) {
    const empresa = await ok(dona, "POST", "/empresas", { nome: `Loja ${sufixo}`, nomeUsuario: `${PREFIXO}_loja${sufixo}`, slug: `${PREFIXO}-loja-${sufixo}` });
    empresas.push({ id: empresa.id, identidadeId: empresa.identidadeId });
  }
  const [lojaA, lojaB] = empresas as [(typeof empresas)[0], (typeof empresas)[0]];
  // Entregador ativo nas DUAS empresas (disponível só em uma: disponibilidade não entra no contexto).
  await ctx.criarEntregadorAtivo(dona, lojaA.id, entregador, `${PREFIXO}_ent`);
  await ctx.criarEntregadorAtivo(dona, lojaB.id, entregador, `${PREFIXO}_ent`, false);
  // Convite ainda não respondido.
  await ok(dona, "POST", `/empresas/${lojaA.id}/entregadores`, { nomeUsuario: `${PREFIXO}_conv` });

  await ativarPerfil(entregador, ENTREGADOR_ATIVIDADE);
  await ok(convidado, "POST", "/profissional/perfil");
  const perfil = await ativarPerfil(incompleto, CABELEIREIRO_ATIVIDADE);
  for (const area of perfil?.areas ?? []) await ok(incompleto, "DELETE", `/profissional/perfil/areas/${area.id}`);
});

after(async () => {
  const pessoas = [comum, dona, entregador, convidado, incompleto].filter(Boolean);
  await ctx.banco.delete(perfisProfissionais).where(inArray(perfisProfissionais.identidadeId, pessoas.map((pessoa) => pessoa.identidadeId)));
  await ctx.encerrar();
});

describe("GET /conta/contexto", () => {
  it("sem sessão responde 401 NAO_AUTENTICADO, como as demais rotas da conta", async () => {
    const resposta = await ctx.api(null, "GET", "/conta/contexto");
    assert.equal(resposta.statusCode, 401);
    assert.equal(resposta.json().codigo, "NAO_AUTENTICADO");
  });

  it("conta comum: identidade pessoal, só a pessoal como operável e nenhuma capacidade", async () => {
    const valor = await contexto(comum);
    assert.equal(valor.versao, 1);
    assert.equal(valor.conta.cadastroCompleto, true);
    assert.match(valor.conta.telefoneMascarado ?? "", /7001$/);
    assert.equal(valor.identidadePessoal?.id, comum.identidadeId);
    assert.deepEqual(valor.identidadesOperaveis, [{ tipo: "pessoal", identidadeId: comum.identidadeId, nomeExibicao: "Comum", nomeUsuario: `${PREFIXO}_comum`, fotoUrl: null }]);
    assert.deepEqual(valor.capacidades, []);
  });

  it("coincide com /usuarios/eu e /identidades/operaveis, que continuam funcionando", async () => {
    const valor = await contexto(dona);
    const eu = (await ctx.api(dona, "GET", "/usuarios/eu")).json();
    assert.deepEqual({ ...valor.conta, identidadePessoal: valor.identidadePessoal }, eu);
    const operaveis = await ctx.api(dona, "GET", "/identidades/operaveis");
    assert.equal(operaveis.statusCode, 200);
    assert.deepEqual(valor.identidadesOperaveis, operaveis.json().identidades);
  });

  it("quem opera empresas as recebe como IDENTIDADES operáveis (com papel), nunca como capacidade", async () => {
    const valor = await contexto(dona);
    const empresariais = valor.identidadesOperaveis.filter((identidade) => identidade.tipo === "empresarial");
    assert.deepEqual(empresariais.map((identidade) => identidade.identidadeId).sort(), empresas.map((empresa) => empresa.identidadeId).sort());
    assert.ok(empresariais.every((identidade) => identidade.empresa.papel === "proprietario"));
    assert.equal(valor.identidadesOperaveis[0]?.tipo, "pessoal");
    assert.deepEqual(valor.capacidades, []);
  });

  it("vínculos em várias empresas + Perfil Profissional ativo: UMA entrada de cada capacidade", async () => {
    const valor = await contexto(entregador);
    assert.deepEqual(tipos(valor), ["entregador_empresa", "perfil_profissional"]);
    assert.deepEqual(valor.capacidades[0], { tipo: "entregador_empresa", estado: "ativa", resumo: { vinculosAtivos: 2, convitesPendentes: 0 } });
    assert.deepEqual(valor.capacidades[1], { tipo: "perfil_profissional", estado: "ativa", resumo: { pendencias: [] } });
  });

  it("a atividade profissional 'Entregador' não vira capacidade nem se confunde com o vínculo", async () => {
    const valor = await contexto(incompleto);
    // Cabeleireiro no perfil, nenhum vínculo: só o Perfil Profissional aparece.
    assert.deepEqual(tipos(valor), ["perfil_profissional"]);
    const nomes = JSON.stringify(valor.capacidades);
    assert.equal(/cabeleireiro|entregador"|mototaxi/i.test(nomes), false);
    // E o Entregador com atividade "Entregador" continua com UMA entrada de cada tipo.
    assert.deepEqual(tipos(await contexto(entregador)).filter((tipo) => tipo === "entregador_empresa").length, 1);
  });

  it("só convite pendente = entregador_empresa pendente; perfil nunca ativado = inativa", async () => {
    const valor = await contexto(convidado);
    assert.deepEqual(valor.capacidades, [
      { tipo: "entregador_empresa", estado: "pendente", resumo: { vinculosAtivos: 0, convitesPendentes: 1 } },
      { tipo: "perfil_profissional", estado: "inativa", resumo: { pendencias: ["base", "atividade", "area"] } },
    ]);
  });

  it("perfil ativo que perdeu a área = pendente (situação 'incompleto' do domínio)", async () => {
    const perfil = respostaPerfilProfissionalSchema.parse((await ctx.api(incompleto, "GET", "/profissional/perfil")).json()).perfil;
    assert.equal(perfil?.situacao, "incompleto");
    assert.deepEqual((await contexto(incompleto)).capacidades, [{ tipo: "perfil_profissional", estado: "pendente", resumo: { pendencias: ["area"] } }]);
  });

  it("não depende de x-jaa-identidade: mesma resposta agindo como empresa ou com identidade não operável", async () => {
    const semCabecalho = await contexto(dona);
    const [lojaA] = empresas as [(typeof empresas)[0]];
    assert.deepEqual(await contexto(como(dona, lojaA.identidadeId)), semCabecalho);
    // Mesmo um pedido inválido/não autorizado não muda nada: o contexto é da CONTA.
    assert.deepEqual(await contexto(como(dona, comum.identidadeId)), semCabecalho);
  });

  it("a identidade atuante continua valendo nas rotas do mensageiro (comportamento existente)", async () => {
    const recusada = await ctx.api(como(dona, comum.identidadeId), "GET", "/conversas");
    assert.equal(recusada.statusCode, 403);
    assert.equal(recusada.json().codigo, "IDENTIDADE_NAO_AUTORIZADA");
  });

  it("não traz dados de domínio (empresas dos vínculos, disponibilidade, perfil completo)", async () => {
    const texto = JSON.stringify(await contexto(entregador));
    for (const proibido of ["disponivel", "fila", "coordenadas", "latitude", "areas", "atividades", "periodos", "Loja a"]) {
      assert.equal(texto.includes(proibido), false, proibido);
    }
  });
});
