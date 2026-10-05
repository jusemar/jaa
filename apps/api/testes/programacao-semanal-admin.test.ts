import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { gruposOpcoesProduto, opcoesProdutoDias } from "@jaa/banco/schema";
import { avisoDeMinimoDoDia, programacaoSemanalGrupoSchema, type DiaSemana, type ListaGruposOpcoes, type ProgramacaoSemanalGrupo } from "@jaa/contratos";
import { eq, inArray } from "drizzle-orm";
import { consultarProdutoDoCatalogo } from "../src/features/catalogo/casos-de-uso/consultar-catalogo.js";
import { serializarGruposPublicos } from "../src/features/produtos/lib/serializar-personalizacao.js";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * ADMINISTRAÇÃO da programação semanal pela API (as rotas que a tela do gestor usa).
 *
 * Protege: ativar pela 1ª vez não muda o cardápio; desligar não apaga; religar retoma; cada dia é
 * independente; nada de outro grupo ou de outra empresa entra; opção nova não se espalha sozinha;
 * a disponibilidade normal continua mandando.
 */

const PREFIXO = `adm${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({ telefones: ["+5531987669101", "+5531987669102"], prefixoIp: "198.51.110." });
const DIAS = [1, 2, 3, 4, 5, 6, 7] as const;

let dona: Pessoa;
let outraDona: Pessoa;
let empresaId = "";
let identidadeEmpresa = "";
let outraEmpresaId = "";
let prato = "";
let produtoDaOutra = "";
const grupo: Record<string, string> = {};
const opcao: Record<string, string> = {};

const rotaGrupos = (empresa: string, produto: string) => `/empresas/${empresa}/produtos/${produto}/grupos-opcoes`;
const rotaProgramacao = (chaveGrupo: string) => `${rotaGrupos(empresaId, prato)}/${grupo[chaveGrupo]}/programacao`;

async function criarGrupo(quem: Pessoa, empresa: string, produto: string, chave: string, corpo: Record<string, unknown>) {
  const resposta = await ctx.api(quem, "POST", rotaGrupos(empresa, produto), corpo);
  assert.equal(resposta.statusCode, 201, resposta.body);
  grupo[chave] = (resposta.json() as ListaGruposOpcoes).grupos.at(-1)!.id;
}
async function criarOpcao(quem: Pessoa, empresa: string, produto: string, chaveGrupo: string, chave: string, corpo: Record<string, unknown>) {
  const resposta = await ctx.api(quem, "POST", `${rotaGrupos(empresa, produto)}/${grupo[chaveGrupo]}/opcoes`, corpo);
  assert.equal(resposta.statusCode, 201, resposta.body);
  opcao[chave] = (resposta.json() as ListaGruposOpcoes).grupos.find((item) => item.id === grupo[chaveGrupo])!.opcoes.at(-1)!.id;
}

const consultar = async (chaveGrupo: string): Promise<ProgramacaoSemanalGrupo> => {
  const resposta = await ctx.api(dona, "GET", rotaProgramacao(chaveGrupo));
  assert.equal(resposta.statusCode, 200, resposta.body);
  return programacaoSemanalGrupoSchema.parse(resposta.json());
};
const ligar = (chaveGrupo: string, programacaoSemanal: boolean, quem: Pessoa | null = dona) => ctx.api(quem, "PUT", rotaProgramacao(chaveGrupo), { programacaoSemanal });
const salvarDia = (chaveGrupo: string, dia: number | string, chaves: string[], quem: Pessoa | null = dona) =>
  ctx.api(quem, "PUT", `${rotaProgramacao(chaveGrupo)}/dias/${dia}`, { opcaoIds: chaves.map((chave) => opcao[chave] ?? chave) });
const doDia = (programacao: ProgramacaoSemanalGrupo, dia: DiaSemana) => programacao.dias.find((item) => item.diaSemana === dia)!.opcaoIds;
const nomes = (ids: string[]) => ids.map((id) => Object.entries(opcao).find(([, valor]) => valor === id)?.[0]);

/** O que o CLIENTE vê do grupo num dia (15h UTC = meio-dia em São Paulo; 2026-10-05 é segunda). */
async function clienteVe(nomeGrupo: string, dia: DiaSemana): Promise<string[] | undefined> {
  const resultado = await consultarProdutoDoCatalogo(ctx.banco, identidadeEmpresa, prato, new Date(Date.UTC(2026, 9, 4 + dia, 15)));
  if (resultado.tipo !== "produto") throw new Error("produto não encontrado");
  return serializarGruposPublicos(resultado.grupos).find((item) => item.nome === nomeGrupo)?.opcoes.map((escolha) => escolha.nome);
}

before(async () => {
  await ctx.iniciar();
  dona = await ctx.criarPessoa(0, `${PREFIXO}_dona`, "Dona Admin");
  outraDona = await ctx.criarPessoa(1, `${PREFIXO}_outra`, "Outra Dona");
  const empresa = (await ctx.api(dona, "POST", "/empresas", { nome: "Restaurante Admin", nomeUsuario: `${PREFIXO}_rest`, slug: `${PREFIXO}-rest` })).json();
  empresaId = empresa.id;
  identidadeEmpresa = empresa.identidadeId;
  outraEmpresaId = (await ctx.api(outraDona, "POST", "/empresas", { nome: "Outra Empresa", nomeUsuario: `${PREFIXO}_out`, slug: `${PREFIXO}-out` })).json().id;
  prato = (await ctx.api(dona, "POST", `/empresas/${empresaId}/produtos`, { nome: "Monte seu prato", precoCentavos: 2490 })).json().id;
  produtoDaOutra = (await ctx.api(outraDona, "POST", `/empresas/${outraEmpresaId}/produtos`, { nome: "Marmita", precoCentavos: 1800 })).json().id;

  await criarGrupo(dona, empresaId, prato, "guarnicoes", { nome: "Guarnições", minimoEscolhas: 0, maximoEscolhas: 5 });
  await criarOpcao(dona, empresaId, prato, "guarnicoes", "arroz", { nome: "Arroz" });
  await criarOpcao(dona, empresaId, prato, "guarnicoes", "feijao", { nome: "Feijão" });
  await criarOpcao(dona, empresaId, prato, "guarnicoes", "salada", { nome: "Salada" });
  await criarOpcao(dona, empresaId, prato, "guarnicoes", "macarrao", { nome: "Macarrão", disponibilidade: "indisponivel" });
  await criarGrupo(dona, empresaId, prato, "carne", { nome: "Tipo de carne", minimoEscolhas: 0, maximoEscolhas: 1 });
  await criarOpcao(dona, empresaId, prato, "carne", "frango", { nome: "Frango" });
  await criarOpcao(dona, empresaId, prato, "carne", "boi", { nome: "Boi" });
  await criarGrupo(dona, empresaId, prato, "molhos", { nome: "Molhos", minimoEscolhas: 2, maximoEscolhas: 2 });
  await criarOpcao(dona, empresaId, prato, "molhos", "vinagrete", { nome: "Vinagrete" });
  await criarOpcao(dona, empresaId, prato, "molhos", "pimenta", { nome: "Pimenta" });

  await criarGrupo(outraDona, outraEmpresaId, produtoDaOutra, "daOutra", { nome: "Acompanhamento", minimoEscolhas: 0, maximoEscolhas: 1 });
  await criarOpcao(outraDona, outraEmpresaId, produtoDaOutra, "daOutra", "farofa", { nome: "Farofa" });
});

after(() => ctx.encerrar());

describe("ativar pela PRIMEIRA vez", () => {
  it("antes de ativar: programação desligada e nenhum dia gravado", async () => {
    const programacao = await consultar("guarnicoes");
    assert.equal(programacao.programacaoSemanal, false);
    assert.deepEqual(programacao.dias.map((dia) => [dia.diaSemana, dia.opcaoIds.length]), DIAS.map((dia) => [dia, 0]));
  });

  it("preenche os sete dias com TODAS as opções do grupo — e o cliente continua vendo exatamente o mesmo", async () => {
    const antes = await Promise.all(DIAS.map((dia) => clienteVe("Guarnições", dia)));
    assert.deepEqual(antes[0], ["Arroz", "Feijão", "Salada"]);

    const resposta = await ligar("guarnicoes", true);
    assert.equal(resposta.statusCode, 200, resposta.body);
    const programacao = programacaoSemanalGrupoSchema.parse(resposta.json());
    assert.equal(programacao.programacaoSemanal, true);
    for (const dia of DIAS) assert.deepEqual(nomes(doDia(programacao, dia)), ["arroz", "feijao", "salada", "macarrao"], `dia ${dia}`);

    assert.deepEqual(await Promise.all(DIAS.map((dia) => clienteVe("Guarnições", dia))), antes, "nada mudou para o cliente");
    const lista: ListaGruposOpcoes = (await ctx.api(dona, "GET", rotaGrupos(empresaId, prato))).json();
    assert.deepEqual(lista.grupos.map((item) => [item.nome, item.programacaoSemanal]), [["Guarnições", true], ["Tipo de carne", false], ["Molhos", false]]);
  });

  it("ativar de novo (clique repetido) não duplica nem reinicia nada", async () => {
    assert.equal((await salvarDia("guarnicoes", 2, ["arroz"])).statusCode, 200);
    assert.equal((await ligar("guarnicoes", true)).statusCode, 200);
    const programacao = await consultar("guarnicoes");
    assert.deepEqual(nomes(doDia(programacao, 2)), ["arroz"], "a terça editada continua editada");
    const linhas = await ctx.banco.select().from(opcoesProdutoDias).where(eq(opcoesProdutoDias.opcaoId, opcao.arroz!));
    assert.equal(linhas.length, 7, "uma linha por dia, sem duplicar");
  });
});

describe("editar os dias", () => {
  it("alterar a segunda não altera a terça; a mesma opção fica em vários dias", async () => {
    assert.equal((await salvarDia("guarnicoes", 1, ["arroz", "feijao", "salada", "macarrao"])).statusCode, 200);
    const resposta = await salvarDia("guarnicoes", 2, ["arroz", "salada", "macarrao"]);
    assert.equal(resposta.statusCode, 200, resposta.body);
    const programacao: ProgramacaoSemanalGrupo = resposta.json();
    assert.deepEqual(nomes(doDia(programacao, 1)), ["arroz", "feijao", "salada", "macarrao"]);
    assert.deepEqual(nomes(doDia(programacao, 2)), ["arroz", "salada", "macarrao"]);
    assert.deepEqual(nomes(doDia(programacao, 3)), ["arroz", "feijao", "salada", "macarrao"], "quarta intocada");
    assert.deepEqual(await clienteVe("Guarnições", 1), ["Arroz", "Feijão", "Salada"]);
    assert.deepEqual(await clienteVe("Guarnições", 2), ["Arroz", "Salada"]);
  });

  it("a disponibilidade normal continua mandando: marcada no dia mas indisponível não aparece ao cliente", async () => {
    assert.ok(doDia(await consultar("guarnicoes"), 1).includes(opcao.macarrao!));
    assert.ok(!(await clienteVe("Guarnições", 1))?.includes("Macarrão"));
    // Tornar disponível faz aparecer nos dias em que está marcada — sem mexer na programação.
    await ctx.api(dona, "PATCH", `${rotaGrupos(empresaId, prato)}/${grupo.guarnicoes}/opcoes/${opcao.macarrao}`, { disponibilidade: "disponivel" });
    assert.ok((await clienteVe("Guarnições", 1))?.includes("Macarrão"));
    await ctx.api(dona, "PATCH", `${rotaGrupos(empresaId, prato)}/${grupo.guarnicoes}/opcoes/${opcao.macarrao}`, { disponibilidade: "indisponivel" });
  });

  it("salvar lista vazia funciona; com mínimo 0 o dia vazio é válido (o grupo só não aparece naquele dia)", async () => {
    const resposta = await salvarDia("guarnicoes", 7, []);
    assert.equal(resposta.statusCode, 200, resposta.body);
    const programacao: ProgramacaoSemanalGrupo = resposta.json();
    assert.deepEqual(doDia(programacao, 7), []);
    assert.equal(await clienteVe("Guarnições", 7), undefined);
    assert.deepEqual(await clienteVe("Guarnições", 6), ["Arroz", "Feijão", "Salada"]);
  });

  it("salvar o mesmo dia duas vezes (inclusive ao mesmo tempo) não cria duplicidade", async () => {
    const respostas = await Promise.all([salvarDia("guarnicoes", 5, ["arroz", "feijao"]), salvarDia("guarnicoes", 5, ["arroz", "feijao"]), salvarDia("guarnicoes", 5, ["arroz", "feijao"])]);
    assert.deepEqual(respostas.map((resposta) => resposta.statusCode), [200, 200, 200]);
    assert.deepEqual(nomes(doDia(await consultar("guarnicoes"), 5)), ["arroz", "feijao"]);
    const repetida = await ctx.api(dona, "PUT", `${rotaProgramacao("guarnicoes")}/dias/5`, { opcaoIds: [opcao.arroz, opcao.arroz] });
    assert.equal(repetida.statusCode, 400, "a mesma opção duas vezes no corpo é recusada");
  });
});

describe("desligar e religar", () => {
  it("desligar NÃO apaga os dias e devolve o comportamento antigo; religar retoma — inclusive o dia vazio", async () => {
    const antes = (await consultar("guarnicoes")).dias;
    const desligada = await ligar("guarnicoes", false);
    assert.equal(desligada.statusCode, 200, desligada.body);
    assert.equal(desligada.json().programacaoSemanal, false);
    assert.deepEqual(desligada.json().dias, antes, "os dias continuam gravados");
    assert.deepEqual(await clienteVe("Guarnições", 7), ["Arroz", "Feijão", "Salada"], "desligada: todas as disponíveis, todo dia");

    const religada = await ligar("guarnicoes", true);
    assert.equal(religada.json().programacaoSemanal, true);
    assert.deepEqual(religada.json().dias, antes, "nada foi reinicializado");
    assert.equal(await clienteVe("Guarnições", 7), undefined, "o domingo vazio continua vazio");
    assert.deepEqual(await clienteVe("Guarnições", 2), ["Arroz", "Salada"]);
  });

  it("grupo com TODOS os dias esvaziados de propósito não é repreenchido ao religar", async () => {
    await ligar("carne", true);
    for (const dia of DIAS) assert.equal((await salvarDia("carne", dia, [])).statusCode, 200);
    await ligar("carne", false);
    const religada: ProgramacaoSemanalGrupo = (await ligar("carne", true)).json();
    assert.deepEqual(religada.dias.map((dia) => dia.opcaoIds.length), [0, 0, 0, 0, 0, 0, 0]);
    // mínimo 0 / máximo 1: grupo sem opção no dia some; o produto continua montável pelos outros grupos.
    assert.equal(await clienteVe("Tipo de carne", 1), undefined);
    await salvarDia("carne", 1, ["frango", "boi"]);
    assert.deepEqual(await clienteVe("Tipo de carne", 1), ["Frango", "Boi"]);
  });
});

describe("opções novas e excluídas", () => {
  it("opção criada depois NÃO entra sozinha nos dias já configurados; o gestor escolhe os dias", async () => {
    await criarOpcao(dona, empresaId, prato, "guarnicoes", "beterraba", { nome: "Beterraba" });
    const programacao = await consultar("guarnicoes");
    for (const dia of DIAS) assert.ok(!doDia(programacao, dia).includes(opcao.beterraba!), `dia ${dia}`);
    assert.ok(!(await clienteVe("Guarnições", 1))?.includes("Beterraba"));

    assert.equal((await salvarDia("guarnicoes", 3, ["arroz", "beterraba"])).statusCode, 200);
    assert.deepEqual(await clienteVe("Guarnições", 3), ["Arroz", "Beterraba"]);
    assert.ok(!(await clienteVe("Guarnições", 1))?.includes("Beterraba"));
  });

  it("excluir a opção remove as associações dela em todos os dias", async () => {
    const apagada = await ctx.api(dona, "DELETE", `${rotaGrupos(empresaId, prato)}/${grupo.guarnicoes}/opcoes/${opcao.beterraba}`);
    assert.ok(apagada.statusCode < 300, apagada.body);
    assert.deepEqual(await ctx.banco.select().from(opcoesProdutoDias).where(eq(opcoesProdutoDias.opcaoId, opcao.beterraba!)), []);
    assert.deepEqual(nomes(doDia(await consultar("guarnicoes"), 3)), ["arroz"]);
  });
});

describe("aviso administrativo de mínimo (só aviso; nada é alterado)", () => {
  it("mínimo 2 com 1 opção disponível na terça gera o aviso daquele dia; os outros dias não", async () => {
    await ligar("molhos", true);
    const resposta = await salvarDia("molhos", 2, ["vinagrete"]);
    const programacao: ProgramacaoSemanalGrupo = resposta.json();
    const lista: ListaGruposOpcoes = (await ctx.api(dona, "GET", rotaGrupos(empresaId, prato))).json();
    const molhos = lista.grupos.find((item) => item.id === grupo.molhos)!;
    const aviso = (dia: DiaSemana) => avisoDeMinimoDoDia(molhos, programacao.dias.find((item) => item.diaSemana === dia)!);

    assert.equal(aviso(2), "Este grupo exige pelo menos 2 escolhas, mas terça-feira possui apenas 1 opção disponível. Nesse dia o grupo não aparece para o cliente.");
    assert.equal(aviso(1), null);
    // O servidor não mexeu no mínimo/máximo, e aplica a regra genérica: o grupo não é oferecido na terça.
    assert.deepEqual([molhos.minimoEscolhas, molhos.maximoEscolhas], [2, 2]);
    assert.equal(await clienteVe("Molhos", 2), undefined);
    assert.deepEqual(await clienteVe("Molhos", 1), ["Vinagrete", "Pimenta"]);
  });

  it("conta só o que o cliente encontra: marcada mas indisponível não ajuda a atingir o mínimo; mínimo 0 nunca avisa", async () => {
    const opcoes = [{ id: "a", disponibilidade: "disponivel" as const }, { id: "b", disponibilidade: "indisponivel" as const }];
    assert.match(avisoDeMinimoDoDia({ minimoEscolhas: 2, opcoes }, { diaSemana: 6, opcaoIds: ["a", "b"] }) ?? "", /sábado possui apenas 1 opção disponível/);
    assert.match(avisoDeMinimoDoDia({ minimoEscolhas: 1, opcoes }, { diaSemana: 7, opcaoIds: [] }) ?? "", /pelo menos 1 escolha, mas domingo não possui nenhuma opção disponível/);
    assert.equal(avisoDeMinimoDoDia({ minimoEscolhas: 0, opcoes }, { diaSemana: 1, opcaoIds: [] }), null);
    assert.equal(avisoDeMinimoDoDia({ minimoEscolhas: 1, opcoes }, { diaSemana: 1, opcaoIds: ["a"] }), null);
  });
});

describe("validação e escopo", () => {
  it("opção de OUTRO grupo é recusada e nada é gravado", async () => {
    const antes = (await consultar("guarnicoes")).dias;
    const resposta = await salvarDia("guarnicoes", 4, ["arroz", "frango"]);
    assert.equal(resposta.statusCode, 404, resposta.body);
    assert.equal(resposta.json().codigo, "OPCAO_NAO_ENCONTRADA");
    assert.deepEqual((await consultar("guarnicoes")).dias, antes);
  });

  it("opção de OUTRA empresa e id inexistente são recusados do mesmo jeito", async () => {
    assert.equal((await salvarDia("guarnicoes", 4, ["farofa"])).statusCode, 404);
    assert.equal((await salvarDia("guarnicoes", 4, [randomUUID()])).statusCode, 404);
    assert.equal((await ctx.api(dona, "PUT", `${rotaProgramacao("guarnicoes")}/dias/4`, { opcaoIds: ["arroz"] })).statusCode, 400, "id que não é uuid");
  });

  it("dia inválido é recusado", async () => {
    for (const dia of [0, 8, -1, "segunda", "1.5"]) {
      const resposta = await salvarDia("guarnicoes", dia, ["arroz"]);
      assert.equal(resposta.statusCode, 400, `${dia}: ${resposta.body}`);
    }
  });

  it("corpo inválido ao ligar/desligar é recusado", async () => {
    assert.equal((await ctx.api(dona, "PUT", rotaProgramacao("guarnicoes"), { programacaoSemanal: "sim" })).statusCode, 400);
    assert.equal((await ctx.api(dona, "PUT", rotaProgramacao("guarnicoes"), {})).statusCode, 400);
  });

  it("quem não opera a empresa não consulta nem altera; sem sessão é 401", async () => {
    assert.equal((await ctx.api(outraDona, "GET", rotaProgramacao("guarnicoes"))).statusCode, 404);
    assert.equal((await ligar("guarnicoes", false, outraDona)).statusCode, 404);
    assert.equal((await salvarDia("guarnicoes", 1, [], outraDona)).statusCode, 404);
    assert.equal((await ctx.api(null, "GET", rotaProgramacao("guarnicoes"))).statusCode, 401);
    assert.equal((await salvarDia("guarnicoes", 1, [], null)).statusCode, 401);
    assert.equal((await consultar("guarnicoes")).programacaoSemanal, true, "nada mudou");
  });

  it("grupo de outra empresa, ou grupo sob o produto errado, não é encontrado", async () => {
    // A dona tenta alcançar o grupo da OUTRA empresa pelas próprias rotas.
    const cruzada = `${rotaGrupos(empresaId, prato)}/${grupo.daOutra}/programacao`;
    assert.equal((await ctx.api(dona, "GET", cruzada)).statusCode, 404);
    assert.equal((await ctx.api(dona, "PUT", cruzada, { programacaoSemanal: true })).statusCode, 404);
    assert.equal((await ctx.api(dona, "PUT", `${cruzada}/dias/1`, { opcaoIds: [] })).statusCode, 404);
    // E pela rota da outra empresa, que ela não opera.
    assert.equal((await ctx.api(dona, "PUT", `${rotaGrupos(outraEmpresaId, produtoDaOutra)}/${grupo.daOutra}/programacao`, { programacaoSemanal: true })).statusCode, 404);
    const [intocado] = await ctx.banco.select({ ativa: gruposOpcoesProduto.programacaoSemanal }).from(gruposOpcoesProduto).where(eq(gruposOpcoesProduto.id, grupo.daOutra!));
    assert.equal(intocado?.ativa, false);
    assert.deepEqual(await ctx.banco.select().from(opcoesProdutoDias).where(inArray(opcoesProdutoDias.opcaoId, [opcao.farofa!])), []);
  });
});
