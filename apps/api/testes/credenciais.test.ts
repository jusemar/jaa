import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { criarAmbienteIntegracao, type Pessoa } from "./apoio/integracao.js";

/*
 * ENTRAR COM IDENTIFICADOR (celular OU @usuario) + SENHA.
 *
 * O OTP continua sendo o cadastro e a recuperação: quem nunca definiu senha não perde o acesso.
 * Nenhum sistema paralelo — a sessão e o cookie continuam sendo os do Better Auth.
 */

const TELEFONES = ["+5531987665001", "+5531987665002"];
const SENHA = "senha-boa-do-jaa-2026";

const ctx = criarAmbienteIntegracao({
  telefones: TELEFONES,
  prefixoIp: "198.51.105.",
});

let joao: Pessoa;
let semSenha: Pessoa;

const entrar = (identificador: string, senha: string) =>
  ctx.api(null, "POST", "/autenticacao/entrar", { identificador, senha });

before(async () => {
  await ctx.iniciar();
  // Cadastro continua por OTP: a senha só existe depois, por escolha da pessoa.
  joao = await ctx.criarPessoa(0, "joao_senha", "João Senha");
  semSenha = await ctx.criarPessoa(1, "sem_senha", "Sem Senha");
});

after(async () => {
  await ctx.encerrar();
});

describe("definir a senha depois do cadastro por OTP", () => {
  it("a conta nasce sem senha e a tela sabe disso", async () => {
    const situacao = await ctx.api(joao, "GET", "/conta/senha");
    assert.equal(situacao.statusCode, 200, situacao.body);
    assert.deepEqual(situacao.json(), { definida: false });
  });

  it("senha curta demais é recusada antes de chegar ao banco", async () => {
    const fraca = await ctx.api(joao, "POST", "/conta/senha", { senha: "123" });
    assert.equal(fraca.statusCode, 400, fraca.body);
    assert.equal(fraca.json().codigo, "SENHA_FRACA");
    assert.equal(
      (await ctx.api(joao, "GET", "/conta/senha")).json().definida,
      false,
    );
  });

  it("define a primeira senha", async () => {
    const definida = await ctx.api(joao, "POST", "/conta/senha", {
      senha: SENHA,
    });
    assert.equal(definida.statusCode, 200, definida.body);
    assert.equal(
      (await ctx.api(joao, "GET", "/conta/senha")).json().definida,
      true,
    );
  });

  it("trocar a senha EXIGE a senha atual: sessão aberta não basta", async () => {
    const semAtual = await ctx.api(joao, "POST", "/conta/senha", {
      senha: "outra-senha-qualquer",
    });
    assert.equal(semAtual.statusCode, 409, semAtual.body);
    assert.equal(semAtual.json().codigo, "SENHA_JA_DEFINIDA");
    // A senha antiga continua valendo: nada foi sobrescrito.
    assert.equal((await entrar("joao_senha", SENHA)).statusCode, 200);

    const errada = await ctx.api(joao, "POST", "/conta/senha", {
      senha: "outra-senha-qualquer",
      senhaAtual: "nao-e-essa",
    });
    assert.notEqual(errada.statusCode, 200);
  });

  it("sem sessão não se define senha de ninguém", async () => {
    assert.equal(
      (await ctx.api(null, "POST", "/conta/senha", { senha: SENHA }))
        .statusCode,
      401,
    );
    assert.equal((await ctx.api(null, "GET", "/conta/senha")).statusCode, 401);
  });
});

describe("entrar com telefone ou @usuario", () => {
  it("entra pelo @usuario e cria sessão de verdade", async () => {
    const resposta = await entrar("joao_senha", SENHA);
    assert.equal(resposta.statusCode, 200, resposta.body);
    const cookie = resposta.cookies.find(
      (c) => c.name === "better-auth.session_token",
    );
    assert.ok(
      cookie?.value,
      "a sessão é o cookie do Better Auth, não um token próprio",
    );

    // A sessão vale de verdade nas rotas do Jaa.
    const conta = await ctx.api(
      { ...joao, cookie: `${cookie.name}=${cookie.value}` },
      "GET",
      "/perfil",
    );
    assert.equal(conta.statusCode, 200);
    assert.equal(conta.json().nomeUsuario, "joao_senha");
  });

  it("entra pelo celular, com ou sem máscara, com ou sem @ no identificador", async () => {
    assert.equal((await entrar("(31) 98766-5001", SENHA)).statusCode, 200);
    assert.equal((await entrar("+5531987665001", SENHA)).statusCode, 200);
    assert.equal((await entrar("@joao_senha", SENHA)).statusCode, 200);
    assert.equal(
      (await entrar("JOAO_SENHA", SENHA)).statusCode,
      200,
      "@usuario é canônico em minúsculas",
    );
  });

  it("senha errada, @usuario inexistente e conta sem senha respondem IGUAL", async () => {
    const senhaErrada = await entrar("joao_senha", "nao-e-a-senha-dele");
    const inexistente = await entrar("ninguem_aqui", SENHA);
    const contaSemSenha = await entrar("sem_senha", SENHA);

    for (const resposta of [senhaErrada, inexistente, contaSemSenha]) {
      assert.equal(resposta.statusCode, 401, resposta.body);
      assert.equal(resposta.json().codigo, "CREDENCIAIS_INVALIDAS");
      assert.equal(
        resposta.cookies.some(
          (c) => c.name === "better-auth.session_token" && c.value,
        ),
        false,
      );
    }
    // A mensagem não distingue os casos: descobrir quem está no Jaa não pode ser de graça.
    assert.equal(inexistente.json().codigo, "CREDENCIAIS_INVALIDAS");
  });

  it("quem nunca definiu senha continua entrando por OTP", async () => {
    assert.equal((await ctx.api(semSenha, "GET", "/perfil")).statusCode, 200);
    assert.equal(
      (await ctx.api(semSenha, "GET", "/conta/senha")).json().definida,
      false,
    );
  });

  it("identificador vazio é erro de dados, não tentativa de login", async () => {
    const vazio = await ctx.api(null, "POST", "/autenticacao/entrar", {
      identificador: "   ",
      senha: SENHA,
    });
    assert.equal(vazio.statusCode, 400);
    assert.equal(vazio.json().codigo, "DADOS_INVALIDOS");
  });

  it("o @usuario de uma EMPRESA não é uma conta e não entra", async () => {
    const empresa = await ctx.api(joao, "POST", "/empresas", {
      nome: "Loja do João",
      nomeUsuario: "loja_do_joao",
      slug: "loja-do-joao",
    });
    assert.equal(empresa.statusCode, 201, empresa.body);
    assert.equal((await entrar("loja_do_joao", SENHA)).statusCode, 401);
  });
});
