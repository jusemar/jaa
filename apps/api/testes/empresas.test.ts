import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { conversas, empresas, identidades, membrosEmpresa, mensagens, participantesConversa } from "@jaa/banco/schema";
import type { Empresa, IdentidadeOperavel } from "@jaa/contratos";
import { count, eq, like } from "drizzle-orm";
import { inserirEmpresaComProprietario } from "../src/features/empresas/repositorios/repositorio-empresas.js";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * Integração REAL de empresas + identidade empresarial + vínculo de proprietário (HTTP + PostgreSQL).
 */

const PREFIXO = `emp${randomUUID().slice(0, 4)}`;
const ctx = criarAmbienteIntegracao({
  telefones: ["+5531987651201", "+5531987651202", "+5531987651203"],
  prefixoIp: "198.18.7.",
});

let A: Pessoa;
let B: Pessoa;
let identidadePessoalA = "";

const criar = (pessoa: Pessoa, corpo: Record<string, unknown>) => ctx.api(pessoa, "POST", "/empresas", corpo);
const dadosEmpresa = (sufixo: string, nome = `Pizzaria ${sufixo}`) => ({ nome, nomeUsuario: `${PREFIXO}_${sufixo}`, slug: `${PREFIXO}-${sufixo}` });

async function contar(tabela: typeof empresas | typeof identidades, condicao: ReturnType<typeof eq> | ReturnType<typeof like>) {
  const [linha] = await ctx.banco.select({ total: count() }).from(tabela).where(condicao);
  return linha?.total ?? 0;
}

before(async () => {
  await ctx.iniciar();
  A = await ctx.criarPessoa(0, `${PREFIXO}_a`, "Junior Rocha");
  B = await ctx.criarPessoa(1, `${PREFIXO}_b`, "Bruno Outro");
  identidadePessoalA = A.identidadeId;
});

after(() => ctx.encerrar());

describe("criar empresa", () => {
  let pizzaria: Empresa;

  it("A cria empresa: identidade empresarial separada da pessoal e A como proprietário, com dados normalizados", async () => {
    const resposta = await criar(A, { nome: "  Pizzaria   BH ", nomeUsuario: `@${PREFIXO.toUpperCase()}_PIZZA`, slug: ` ${PREFIXO.toUpperCase()}-Pizzaria-BH ` });
    assert.equal(resposta.statusCode, 201, resposta.body);
    pizzaria = resposta.json();
    assert.equal(pizzaria.nome, "Pizzaria BH");
    assert.equal(pizzaria.nomeUsuario, `${PREFIXO}_pizza`);
    assert.equal(pizzaria.slug, `${PREFIXO}-pizzaria-bh`);
    assert.equal(pizzaria.status, "ativa");
    assert.equal(pizzaria.papel, "proprietario");
    assert.notEqual(pizzaria.identidadeId, identidadePessoalA);
    assert.deepEqual(Object.keys(pizzaria).sort(), ["atualizadoEm", "criadoEm", "id", "identidadeId", "nome", "nomeUsuario", "papel", "slug", "status"]);

    const [identidade] = await ctx.banco.select().from(identidades).where(eq(identidades.id, pizzaria.identidadeId));
    assert.equal(identidade?.tipo, "empresarial");
    assert.equal(identidade?.empresaId, pizzaria.id);
    assert.equal(identidade?.usuarioId, null, "identidade empresarial não pertence à conta");
    const membros = await ctx.banco.select().from(membrosEmpresa).where(eq(membrosEmpresa.empresaId, pizzaria.id));
    assert.equal(membros.length, 1);
    assert.equal(membros[0]?.papel, "proprietario");

    const [pessoal] = await ctx.banco.select().from(identidades).where(eq(identidades.id, identidadePessoalA));
    assert.equal(pessoal?.tipo, "pessoal");
    assert.equal(pessoal?.empresaId, null);
    assert.equal(pessoal?.nomeExibicao, "Junior Rocha", "identidade pessoal intacta");
  });

  it("cliente não se declara proprietário nem escolhe conta/papel: vínculo é sempre da sessão", async () => {
    const [membroB] = await ctx.banco.select({ usuarioId: membrosEmpresa.usuarioId }).from(membrosEmpresa).where(eq(membrosEmpresa.empresaId, pizzaria.id));
    const resposta = await criar(B, { ...dadosEmpresa("forjada"), usuarioId: membroB?.usuarioId, proprietarioId: membroB?.usuarioId, papel: "proprietario", empresaId: pizzaria.id });
    assert.equal(resposta.statusCode, 201);
    const forjada: Empresa = resposta.json();
    assert.notEqual(forjada.id, pizzaria.id);
    const membros = await ctx.banco.select().from(membrosEmpresa).where(eq(membrosEmpresa.empresaId, forjada.id));
    assert.equal(membros.length, 1);
    assert.notEqual(membros[0]?.usuarioId, membroB?.usuarioId, "dono é B (sessão), não A");
    assert.equal((await ctx.api(A, "GET", `/empresas/${forjada.id}`)).statusCode, 404);
  });

  it("slug e @usuario únicos; falha não deixa empresa nem identidade órfã; retry idêntico é idempotente", async () => {
    const empresasAntes = await contar(empresas, like(empresas.slug, `${PREFIXO}-%`));
    const identidadesAntes = await contar(identidades, like(identidades.nomeUsuario, `${PREFIXO}%`));

    const slugRepetido = await criar(B, { nome: "Outra", nomeUsuario: `${PREFIXO}_outra`, slug: pizzaria.slug });
    assert.equal(slugRepetido.statusCode, 409);
    assert.equal(slugRepetido.json().codigo, "SLUG_INDISPONIVEL");
    const usuarioRepetido = await criar(B, { nome: "Outra", nomeUsuario: pizzaria.nomeUsuario, slug: `${PREFIXO}-outra` });
    assert.equal(usuarioRepetido.statusCode, 409);
    assert.equal(usuarioRepetido.json().codigo, "NOME_USUARIO_INDISPONIVEL");
    // @usuario pessoal e empresarial compartilham o mesmo espaço único.
    assert.equal((await criar(B, { nome: "Outra", nomeUsuario: `${PREFIXO}_a`, slug: `${PREFIXO}-colide-pessoal` })).statusCode, 409);

    assert.equal(await contar(empresas, like(empresas.slug, `${PREFIXO}-%`)), empresasAntes);
    assert.equal(await contar(identidades, like(identidades.nomeUsuario, `${PREFIXO}%`)), identidadesAntes);

    const retry = await criar(A, { nome: "Pizzaria BH", nomeUsuario: pizzaria.nomeUsuario, slug: pizzaria.slug });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().id, pizzaria.id);
  });

  it("falha no meio da transação (vínculo inválido) desfaz empresa e identidade", async () => {
    const dados = dadosEmpresa("transacao");
    await assert.rejects(inserirEmpresaComProprietario(ctx.banco, { usuarioId: "conta-inexistente", ...dados }));
    assert.equal(await contar(empresas, eq(empresas.slug, dados.slug)), 0);
    assert.equal(await contar(identidades, eq(identidades.nomeUsuario, dados.nomeUsuario)), 0);
  });

  it("o banco recusa empresa sem identidade empresarial ou sem proprietário (trigger no commit)", async () => {
    await assert.rejects(ctx.banco.transaction(async (tx) => {
      await tx.insert(empresas).values({ slug: `${PREFIXO}-orfa` });
    }));
    await assert.rejects(ctx.banco.transaction(async (tx) => {
      const [empresa] = await tx.insert(empresas).values({ slug: `${PREFIXO}-sem-dono` }).returning();
      await tx.insert(identidades).values({ tipo: "empresarial", empresaId: empresa?.id, nomeExibicao: "Sem dono", nomeUsuario: `${PREFIXO}_semdono` });
    }));
    assert.equal(await contar(empresas, like(empresas.slug, `${PREFIXO}-orfa`)), 0);
    assert.equal(await contar(empresas, like(empresas.slug, `${PREFIXO}-sem-dono`)), 0);
  });

  it("dados inválidos são recusados; sem sessão 401", async () => {
    for (const corpo of [{}, { ...dadosEmpresa("x"), slug: "com espaço" }, { ...dadosEmpresa("y"), slug: "loja" }, { ...dadosEmpresa("z"), nome: "" }, { ...dadosEmpresa("w"), nomeUsuario: "1abc" }]) {
      const resposta = await criar(A, corpo);
      assert.equal(resposta.statusCode, 400, JSON.stringify(corpo));
    }
    assert.equal((await ctx.api(null, "POST", "/empresas", dadosEmpresa("anon"))).statusCode, 401);
  });
});

describe("listar, obter e atualizar", () => {
  it("uma conta tem duas empresas; A lista as suas; B não vê as de A", async () => {
    const farmacia: Empresa = (await criar(A, dadosEmpresa("farmacia", "Farmácia Central"))).json();
    const listaA: Empresa[] = (await ctx.api(A, "GET", "/empresas")).json().empresas;
    assert.ok(listaA.length >= 2);
    assert.ok(listaA.some((e) => e.id === farmacia.id));
    assert.ok(listaA.every((e) => e.papel === "proprietario"));
    const listaB: Empresa[] = (await ctx.api(B, "GET", "/empresas")).json().empresas;
    assert.ok(!listaB.some((e) => listaA.some((a) => a.id === e.id)), "B não lista empresas de A");
    assert.ok(!JSON.stringify(listaB).includes("Farmácia Central"));
  });

  it("B não obtém nem altera empresa de A (404 como inexistente); slug não concede acesso", async () => {
    const [empresaA] = (await ctx.api(A, "GET", "/empresas")).json().empresas as Empresa[];
    assert.ok(empresaA);
    const obter = await ctx.api(B, "GET", `/empresas/${empresaA.id}`);
    assert.equal(obter.statusCode, 404);
    assert.equal(obter.json().codigo, "EMPRESA_NAO_ENCONTRADA");
    assert.deepEqual((await ctx.api(B, "GET", `/empresas/${randomUUID()}`)).json(), obter.json(), "inexistente e alheia são indistinguíveis");
    assert.equal((await ctx.api(B, "GET", `/empresas/${empresaA.slug}`)).statusCode, 400, "slug não é chave de acesso");

    for (const corpo of [{ nome: "Tomada" }, { slug: `${PREFIXO}-tomada` }, { slug: empresaA.slug, papel: "proprietario", usuarioId: "x" }]) {
      assert.equal((await ctx.api(B, "PATCH", `/empresas/${empresaA.id}`, corpo)).statusCode, 404);
    }
    const [linha] = await ctx.banco.select().from(empresas).where(eq(empresas.id, empresaA.id));
    assert.equal(linha?.slug, empresaA.slug);
    assert.equal((await ctx.api(A, "GET", `/empresas/${empresaA.id}`)).json().nome, empresaA.nome);
  });

  it("A atualiza nome (na identidade empresarial) e slug; slug de outra empresa é recusado", async () => {
    const empresa: Empresa = (await criar(A, dadosEmpresa("mutavel", "Nome Antigo"))).json();
    const atualizada = await ctx.api(A, "PATCH", `/empresas/${empresa.id}`, { nome: "Nome Novo", slug: `${PREFIXO}-Mutavel-Nova` });
    assert.equal(atualizada.statusCode, 200, atualizada.body);
    assert.equal(atualizada.json().nome, "Nome Novo");
    assert.equal(atualizada.json().slug, `${PREFIXO}-mutavel-nova`);
    assert.equal(atualizada.json().identidadeId, empresa.identidadeId);
    const [identidade] = await ctx.banco.select().from(identidades).where(eq(identidades.id, empresa.identidadeId));
    assert.equal(identidade?.nomeExibicao, "Nome Novo");

    const [outra] = (await ctx.api(B, "GET", "/empresas")).json().empresas as Empresa[];
    assert.ok(outra);
    const conflito = await ctx.api(A, "PATCH", `/empresas/${empresa.id}`, { slug: outra.slug });
    assert.equal(conflito.statusCode, 409);
    assert.equal(conflito.json().codigo, "SLUG_INDISPONIVEL");
  });
});

describe("identidades operáveis", () => {
  it("A opera a pessoal e as empresariais dele; B não opera nenhuma de A", async () => {
    const operaveisA: IdentidadeOperavel[] = (await ctx.api(A, "GET", "/identidades/operaveis")).json().identidades;
    assert.equal(operaveisA[0]?.tipo, "pessoal");
    assert.equal(operaveisA[0]?.identidadeId, identidadePessoalA);
    const empresariaisA = operaveisA.filter((i) => i.tipo === "empresarial");
    assert.ok(empresariaisA.length >= 2);
    assert.equal(new Set(operaveisA.map((i) => i.identidadeId)).size, operaveisA.length, "identidades distintas");

    for (const identidade of operaveisA) {
      assert.equal((await ctx.api(A, "GET", `/identidades/operaveis/${identidade.identidadeId}`)).statusCode, 200);
      const porB = await ctx.api(B, "GET", `/identidades/operaveis/${identidade.identidadeId}`);
      assert.equal(porB.statusCode, 404, `B não opera ${identidade.tipo} de A`);
      assert.ok(!porB.body.includes(identidade.nomeUsuario));
    }
    const operaveisB: IdentidadeOperavel[] = (await ctx.api(B, "GET", "/identidades/operaveis")).json().identidades;
    assert.ok(!operaveisB.some((i) => operaveisA.some((a) => a.identidadeId === i.identidadeId)));
    assert.equal((await ctx.api(A, "GET", `/identidades/operaveis/${randomUUID()}`)).statusCode, 404);
  });

  it("sem pedir identidade atuante, a sessão age como PESSOAL; @usuario de empresa ativa abre conversa com a EMPRESA", async () => {
    const conta = (await ctx.api(A, "GET", "/usuarios/eu")).json();
    assert.equal(conta.identidadePessoal?.id, identidadePessoalA);
    const [empresa] = (await ctx.api(A, "GET", "/empresas")).json().empresas as Empresa[];
    const conversa = await ctx.api(B, "POST", "/conversas/diretas", { nomeUsuario: empresa?.nomeUsuario });
    assert.equal(conversa.statusCode, 201, conversa.body);
    const participantes = conversa.json().participantes as Array<{ identidadeId: string; tipo: string }>;
    assert.ok(participantes.some((p) => p.identidadeId === empresa?.identidadeId && p.tipo === "empresarial"));
    assert.ok(!participantes.some((p) => p.identidadeId === identidadePessoalA), "o dono pessoal não participa");
  });

  it("schema do mensageiro já aceita identidade empresarial como participante e remetente (verificação estrutural, desfeita)", async () => {
    const [empresa] = (await ctx.api(A, "GET", "/empresas")).json().empresas as Empresa[];
    assert.ok(empresa);
    const desfazer = new Error("desfazer verificação estrutural");
    await assert.rejects(
      ctx.banco.transaction(async (tx) => {
        const [conversa] = await tx.insert(conversas).values({ tipo: "direta", chaveDireta: `teste:${randomUUID()}` }).returning();
        assert.ok(conversa);
        await tx.insert(participantesConversa).values([
          { conversaId: conversa.id, identidadeId: B.identidadeId },
          { conversaId: conversa.id, identidadeId: empresa.identidadeId },
        ]);
        const [mensagem] = await tx
          .insert(mensagens)
          .values({ conversaId: conversa.id, remetenteIdentidadeId: empresa.identidadeId, idCliente: randomUUID(), tipo: "texto", conteudo: "Olá, sou a empresa" })
          .returning();
        assert.equal(mensagem?.remetenteIdentidadeId, empresa.identidadeId);
        throw desfazer;
      }),
      (erro) => erro === desfazer,
    );
  });
});
