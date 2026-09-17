import type { Banco } from "@jaa/banco";
import { accounts, identidades, users } from "@jaa/banco/schema";
import {
  definirSenhaEntradaSchema,
  entrarComSenhaEntradaSchema,
  identificadorParecePelefone,
  type ErroApi,
  type SituacaoSenha,
} from "@jaa/contratos";
import { and, eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Autenticacao } from "../autenticacao.js";
import { encaminharParaBetterAuth } from "../lib/encaminhar-para-better-auth.js";
import { exigirIdentidadeAutenticada, obterIdentidadeExigida } from "../lib/exigir-identidade-autenticada.js";
import { normalizarCelularBrasileiro } from "../lib/telefone.js";

/*
 * ENTRAR COM IDENTIFICADOR + SENHA.
 *
 * O Jaa só faz uma coisa aqui: descobrir DE QUAL CONTA o identificador fala. Autenticar, comparar
 * hash, criar sessão e assinar cookie continua sendo do Better Auth — não existe login paralelo.
 *
 * O @usuario mora na IDENTIDADE (uma fonte só, seção 7 do CLAUDE.md), então entrar por @usuario é
 * traduzir identidade → conta → telefone e delegar o resto.
 */

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

async function telefoneDoIdentificador(banco: Banco, identificador: string): Promise<string | null> {
  if (identificadorParecePelefone(identificador)) return normalizarCelularBrasileiro(identificador);

  const nomeUsuario = identificador.replace(/^@/, "").trim().toLowerCase();
  const [linha] = await banco
    .select({ telefone: users.phoneNumber })
    .from(identidades)
    .innerJoin(users, eq(users.id, identidades.usuarioId))
    // Só identidade PESSOAL: o @usuario de uma empresa não é uma conta e não entra em lugar nenhum.
    .where(and(eq(identidades.nomeUsuario, nomeUsuario), eq(identidades.tipo, "pessoal")))
    .limit(1);

  return linha?.telefone ?? null;
}

export function registrarRotasCredenciais(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; urlBase: string },
) {
  const { banco, autenticacao, urlBase } = dependencias;
  const preHandler = exigirIdentidadeAutenticada(dependencias);

  /**
   * Identificador (celular OU @usuario) + senha. A resposta é a MESMA para identificador
   * inexistente, conta sem senha e senha errada: dizer "esse @usuario não existe" entregaria quem
   * está no Jaa para quem só quer descobrir.
   */
  servidor.post("/autenticacao/entrar", async (requisicao, resposta) => {
    const entrada = entrarComSenhaEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) {
      return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: entrada.error.issues[0]?.message ?? "Dados inválidos." });
    }

    const telefone = await telefoneDoIdentificador(banco, entrada.data.identificador);
    if (!telefone) {
      return responder(resposta, 401, { codigo: "CREDENCIAIS_INVALIDAS", mensagem: "Celular/@usuario ou senha incorretos." });
    }

    return encaminharParaBetterAuth({ autenticacao, urlBase }, requisicao, resposta, "/sign-in/phone-number", {
      phoneNumber: telefone,
      password: entrada.data.senha,
    });
  });

  /** A tela precisa saber se oferece "Definir senha" ou "Alterar senha". Nunca devolve o hash. */
  servidor.get("/conta/senha", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const [conta] = await banco
      .select({ senha: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, usuarioId), eq(accounts.providerId, "credential")))
      .limit(1);
    const situacao: SituacaoSenha = { definida: Boolean(conta?.senha) };
    return situacao;
  });

  /**
   * Definir a primeira senha (depois do cadastro por OTP) ou trocar a atual.
   *
   * Trocar EXIGE a senha atual: sessão aberta em aparelho esquecido não pode virar troca de senha.
   * Quem esqueceu a senha usa a recuperação por OTP do próprio Better Auth.
   */
  servidor.post("/conta/senha", { preHandler }, async (requisicao, resposta) => {
    const entrada = definirSenhaEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) {
      return responder(resposta, 400, { codigo: "SENHA_FRACA", mensagem: entrada.error.issues[0]?.message ?? "Senha inválida." });
    }

    if (entrada.data.senhaAtual) {
      return encaminharParaBetterAuth({ autenticacao, urlBase }, requisicao, resposta, "/change-password", {
        currentPassword: entrada.data.senhaAtual,
        newPassword: entrada.data.senha,
      });
    }

    // `setPassword` é SERVER-ONLY no Better Auth (não existe por HTTP, de propósito): ele só define a
    // primeira senha e recusa sobrescrever uma existente. É exatamente a garantia que queremos.
    try {
      await autenticacao.api.setPassword({ body: { newPassword: entrada.data.senha }, headers: fromNodeHeaders(requisicao.headers) });
      return { definida: true } satisfies SituacaoSenha;
    } catch {
      return responder(resposta, 409, { codigo: "SENHA_FRACA", mensagem: "Você já tem uma senha. Informe a senha atual para alterá-la." });
    }
  });
}
