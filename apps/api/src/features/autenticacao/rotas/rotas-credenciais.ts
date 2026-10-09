import type { Banco } from "@jaa/banco";
import { accounts, identidades, users } from "@jaa/banco/schema";
import {
  confirmarTelefoneEntradaSchema,
  definirSenhaEntradaSchema,
  entrarComSenhaEntradaSchema,
  identificadorPareceEmail,
  identificadorParecePelefone,
  pedirCodigoTelefoneEntradaSchema,
  type MetodosDeEntrada,
  type ErroApi,
  type SituacaoEmailConta,
  type SituacaoSenha,
  type SituacaoTelefoneConta,
} from "@jaa/contratos";
import { and, eq, ne } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Autenticacao } from "../autenticacao.js";
import { consumirLimiteDeUso } from "../../../lib/limite-de-uso.js";
import { ehEmailTecnico, normalizarEmail } from "../lib/email.js";
import { chamarBetterAuth, encaminharParaBetterAuth } from "../lib/encaminhar-para-better-auth.js";
import {
  exigirIdentidadeAutenticada,
  obterIdentidadeExigida,
} from "../lib/exigir-identidade-autenticada.js";
import { formatarTelefoneNacional, normalizarCelularBrasileiro } from "../lib/telefone.js";

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

/**
 * De qual CONTA o identificador fala, e por onde a senha dela é conferida:
 * - conta COM telefone → pelo telefone (o caminho de sempre);
 * - conta que nasceu por e-mail e ainda NÃO tem telefone → pelo e-mail real dela.
 * O e-mail técnico de uma conta do celular nunca é aceito como identificador.
 */
type ContaDoIdentificador = { por: "telefone"; telefone: string } | { por: "email"; email: string } | null;

function paraConta(linha: { telefone: string | null; email: string; emailVerificado: boolean } | undefined): ContaDoIdentificador {
  if (!linha) return null;
  if (linha.telefone) return { por: "telefone", telefone: linha.telefone };
  return linha.emailVerificado && !ehEmailTecnico(linha.email) ? { por: "email", email: linha.email } : null;
}

async function contaDoIdentificador(banco: Banco, identificador: string): Promise<ContaDoIdentificador> {
  if (identificadorParecePelefone(identificador)) {
    const telefone = normalizarCelularBrasileiro(identificador);
    return telefone ? { por: "telefone", telefone } : null;
  }

  const campos = { telefone: users.phoneNumber, email: users.email, emailVerificado: users.emailVerified };

  if (identificadorPareceEmail(identificador)) {
    const email = normalizarEmail(identificador);
    if (!email) return null;
    const [linha] = await banco.select(campos).from(users).where(and(eq(users.email, email), eq(users.emailVerified, true))).limit(1);
    return paraConta(linha);
  }

  const nomeUsuario = identificador.replace(/^@/, "").trim().toLowerCase();
  const [linha] = await banco
    .select(campos)
    .from(identidades)
    .innerJoin(users, eq(users.id, identidades.usuarioId))
    // Só identidade PESSOAL: o @usuario de uma empresa não é uma conta e não entra em lugar nenhum.
    .where(
      and(
        eq(identidades.nomeUsuario, nomeUsuario),
        eq(identidades.tipo, "pessoal"),
      ),
    )
    .limit(1);

  return paraConta(linha);
}

// Uma mensagem só para todos os casos: nada indica se o identificador existe ou se a conta tem senha.
const CREDENCIAIS_INVALIDAS: ErroApi = {
  codigo: "CREDENCIAIS_INVALIDAS",
  mensagem: "Dados de acesso incorretos. Se você ainda não criou uma senha, entre com o código.",
};

/*
 * TELEFONE DA CONTA — respostas. Dentro de uma sessão, com a pessoa tentando vincular um número, é
 * permitido dizer que ele já é de outra conta; nada MAIS sobre essa outra conta é revelado.
 */
const TELEFONE_INVALIDO: ErroApi = { codigo: "TELEFONE_INVALIDO", mensagem: "Número de celular inválido." };
const TELEFONE_IGUAL: ErroApi = { codigo: "TELEFONE_IGUAL", mensagem: "Este já é o telefone da sua conta." };
const TELEFONE_EM_USO: ErroApi = { codigo: "TELEFONE_EM_USO", mensagem: "Este número já está vinculado a outra conta." };
const FALHA_AO_ENVIAR: ErroApi = { codigo: "FALHA_AO_ENVIAR_CODIGO", mensagem: "Não foi possível enviar o código. Tente novamente." };
const MUITAS_TENTATIVAS: ErroApi = { codigo: "LIMITE_DE_TENTATIVAS_ATINGIDO", mensagem: "Muitas tentativas. Aguarde um pouco e tente de novo." };
const FALHA_GENERICA: ErroApi = { codigo: "DADOS_INVALIDOS", mensagem: "Não foi possível concluir. Tente novamente." };

// O que o Better Auth diz sobre o código, em frases do Jaa (sem citar a biblioteca).
const ERROS_DO_CODIGO: Record<string, { status: number; erro: ErroApi }> = {
  INVALID_OTP: { status: 400, erro: { codigo: "CODIGO_INVALIDO", mensagem: "Código incorreto." } },
  OTP_EXPIRED: { status: 400, erro: { codigo: "CODIGO_INVALIDO", mensagem: "Código expirado. Peça um novo código." } },
  OTP_NOT_FOUND: { status: 400, erro: { codigo: "CODIGO_INVALIDO", mensagem: "Código não encontrado. Peça um novo código." } },
  TOO_MANY_ATTEMPTS: { status: 429, erro: { codigo: "LIMITE_DE_TENTATIVAS_ATINGIDO", mensagem: "Muitas tentativas. Peça um novo código." } },
  OTP_SOLICITADO_RECENTEMENTE: { status: 429, erro: { codigo: "LIMITE_DE_TENTATIVAS_ATINGIDO", mensagem: "Aguarde um minuto antes de pedir um novo código." } },
  PHONE_NUMBER_EXIST: { status: 409, erro: TELEFONE_EM_USO },
};

// Pedidos de código para TROCAR o telefone, por conta: impede usar a tela para sondar números em massa.
const LIMITE_PEDIDOS_DE_TELEFONE = { janelaSegundos: 3600, maximo: 10 };

async function codigoDoErro(resposta: Response): Promise<string | null> {
  const corpo: unknown = await resposta.json().catch(() => null);
  return typeof corpo === "object" && corpo !== null && "code" in corpo && typeof corpo.code === "string" ? corpo.code : null;
}

// Mesmo teto por IP que o Better Auth aplica a `/sign-in/phone-number` (a chamada interna não passa por ele).
const LIMITE_ENTRAR_POR_EMAIL = { janelaSegundos: 60, maximo: 10 };

export function registrarRotasCredenciais(
  servidor: FastifyInstance,
  dependencias: { banco: Banco; autenticacao: Autenticacao; urlBase: string; otpPorEmailDisponivel?: boolean },
) {
  const { banco, autenticacao, urlBase, otpPorEmailDisponivel = false } = dependencias;
  const preHandler = exigirIdentidadeAutenticada(dependencias);

  /** Canais de código ligados neste servidor (público; não fala de conta nenhuma). */
  servidor.get("/autenticacao/metodos", async () => {
    const metodos: MetodosDeEntrada = { telefone: true, email: otpPorEmailDisponivel };
    return metodos;
  });

  /**
   * Identificador (celular, e-mail OU @usuario) + senha. A resposta é a MESMA para identificador
   * inexistente, conta sem senha e senha errada: dizer "esse @usuario não existe" entregaria quem
   * está no Jaa para quem só quer descobrir.
   */
  servidor.post("/autenticacao/entrar", async (requisicao, resposta) => {
    const entrada = entrarComSenhaEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) {
      return responder(resposta, 400, {
        codigo: "DADOS_INVALIDOS",
        mensagem: entrada.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }

    const conta = await contaDoIdentificador(banco, entrada.data.identificador);
    if (!conta) return responder(resposta, 401, CREDENCIAIS_INVALIDAS);

    if (conta.por === "email") {
      const limite = await consumirLimiteDeUso(banco, `entrar-por-email:${requisicao.ip}`, LIMITE_ENTRAR_POR_EMAIL);
      if (!limite.permitido) {
        return resposta
          .header("retry-after", String(limite.tenteNovamenteEmSegundos))
          .code(429)
          .send({ codigo: "LIMITE_DE_TENTATIVAS_ATINGIDO", mensagem: "Muitas tentativas. Aguarde um pouco e tente de novo." });
      }
      // O Better Auth confere o hash e cria a MESMA sessão; aqui só se repassam status e cookies.
      const respostaAutenticacao = await autenticacao.api
        .signInEmail({ body: { email: conta.email, password: entrada.data.senha }, headers: fromNodeHeaders(requisicao.headers), asResponse: true })
        .catch(() => null);
      if (!respostaAutenticacao || !respostaAutenticacao.ok) return responder(resposta, 401, CREDENCIAIS_INVALIDAS);
      const cookies = respostaAutenticacao.headers.getSetCookie();
      if (cookies.length > 0) resposta.header("set-cookie", cookies);
      return resposta.code(200).send(await respostaAutenticacao.text());
    }

    return encaminharParaBetterAuth(
      { autenticacao, urlBase },
      requisicao,
      resposta,
      "/sign-in/phone-number",
      {
        phoneNumber: conta.telefone,
        password: entrada.data.senha,
      },
      CREDENCIAIS_INVALIDAS,
    );
  });

  const telefoneDeOutraConta = async (telefone: string, usuarioId: string) => {
    const [outra] = await banco.select({ id: users.id }).from(users).where(and(eq(users.phoneNumber, telefone), ne(users.id, usuarioId))).limit(1);
    return Boolean(outra);
  };

  /** Telefone da CONTA, como a própria pessoa o lê (ou null: conta que nasceu por e-mail). */
  servidor.get("/conta/telefone", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const [conta] = await banco.select({ telefone: users.phoneNumber }).from(users).where(eq(users.id, usuarioId)).limit(1);
    const situacao: SituacaoTelefoneConta = { telefone: conta?.telefone ? formatarTelefoneNacional(conta.telefone) : null };
    return situacao;
  });

  /**
   * PEDIR O CÓDIGO para cadastrar/alterar o telefone. O SMS vai para o número NOVO — e só sai depois
   * de conferido que ele é válido, não é o atual e NÃO pertence a outra conta. O envio em si é o do
   * Better Auth (`/phone-number/send-otp`), com os limites de sempre: nenhum fluxo paralelo de código.
   */
  servidor.post("/conta/telefone/codigo", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const entrada = pedirCodigoTelefoneEntradaSchema.safeParse(requisicao.body);
    const telefone = entrada.success ? normalizarCelularBrasileiro(entrada.data.telefone) : null;
    if (!telefone) return responder(resposta, 400, TELEFONE_INVALIDO);

    const [conta] = await banco.select({ telefone: users.phoneNumber }).from(users).where(eq(users.id, usuarioId)).limit(1);
    if (conta?.telefone === telefone) return responder(resposta, 409, TELEFONE_IGUAL);

    const limite = await consumirLimiteDeUso(banco, `conta-telefone:${usuarioId}`, LIMITE_PEDIDOS_DE_TELEFONE);
    if (!limite.permitido) return resposta.header("retry-after", String(limite.tenteNovamenteEmSegundos)).code(429).send(MUITAS_TENTATIVAS);

    // ANTES de qualquer SMS: número de outra conta não recebe código e não segue adiante.
    if (await telefoneDeOutraConta(telefone, usuarioId)) return responder(resposta, 409, TELEFONE_EM_USO);

    const envio = await chamarBetterAuth({ autenticacao, urlBase }, requisicao, "/phone-number/send-otp", { phoneNumber: telefone }).catch(() => null);
    if (envio?.ok) return resposta.code(200).send({ enviado: true });
    const conhecido = envio ? ERROS_DO_CODIGO[(await codigoDoErro(envio)) ?? ""] : undefined;
    if (conhecido) return responder(resposta, conhecido.status, conhecido.erro);
    if (envio?.status === 429) return responder(resposta, 429, MUITAS_TENTATIVAS);
    return responder(resposta, 503, FALHA_AO_ENVIAR);
  });

  /**
   * CONFIRMAR o código e gravar o telefone NOVO na conta. Quem confere o código e grava é o Better
   * Auth (`/phone-number/verify` com `updatePhoneNumber`); antes disso nada muda na conta.
   *
   * UNICIDADE em três camadas: a conferência antes do SMS, a conferência do próprio Better Auth ao
   * gravar, e o índice único do banco. Se duas contas confirmarem o mesmo número quase juntas, a que
   * perder recebe a mesma resposta controlada de "já vinculado" — nunca um erro técnico.
   */
  servidor.post("/conta/telefone", { preHandler }, async (requisicao, resposta) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const entrada = confirmarTelefoneEntradaSchema.safeParse(requisicao.body);
    if (!entrada.success) {
      const noCodigo = entrada.error.issues[0]?.path[0] === "codigo";
      return responder(resposta, 400, noCodigo ? { codigo: "CODIGO_INVALIDO", mensagem: "O código tem 6 números." } : TELEFONE_INVALIDO);
    }
    const telefone = normalizarCelularBrasileiro(entrada.data.telefone);
    if (!telefone) return responder(resposta, 400, TELEFONE_INVALIDO);
    if (await telefoneDeOutraConta(telefone, usuarioId)) return responder(resposta, 409, TELEFONE_EM_USO);

    const verificacao = await chamarBetterAuth({ autenticacao, urlBase }, requisicao, "/phone-number/verify", {
      phoneNumber: telefone,
      code: entrada.data.codigo,
      updatePhoneNumber: true,
    }).catch(() => null);

    if (verificacao?.ok) {
      const situacao: SituacaoTelefoneConta = { telefone: formatarTelefoneNacional(telefone) };
      return resposta.code(200).send(situacao);
    }
    const conhecido = verificacao ? ERROS_DO_CODIGO[(await codigoDoErro(verificacao)) ?? ""] : undefined;
    if (conhecido) return responder(resposta, conhecido.status, conhecido.erro);
    if (verificacao?.status === 429) return responder(resposta, 429, MUITAS_TENTATIVAS);
    // Perdeu a corrida (o índice único recusou a gravação): o número agora é de outra conta.
    if (await telefoneDeOutraConta(telefone, usuarioId)) return responder(resposta, 409, TELEFONE_EM_USO);
    return responder(resposta, 500, FALHA_GENERICA);
  });

  /**
   * E-mail REAL da conta (ou null). O endereço técnico criado no cadastro por telefone nunca sai
   * daqui. Cadastrar/trocar o e-mail é do Better Auth (`/api/auth/email-otp/request-email-change` e
   * `/change-email`): não existe rota do Jaa que grave e-mail sem o código.
   */
  servidor.get("/conta/email", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const [conta] = await banco.select({ email: users.email, verificado: users.emailVerified }).from(users).where(eq(users.id, usuarioId)).limit(1);
    const email = conta && conta.verificado && !ehEmailTecnico(conta.email) ? conta.email : null;
    const situacao: SituacaoEmailConta = { email, disponivel: otpPorEmailDisponivel };
    return situacao;
  });

  /** A tela precisa saber se oferece "Definir senha" ou "Alterar senha". Nunca devolve o hash. */
  servidor.get("/conta/senha", { preHandler }, async (requisicao) => {
    const { usuarioId } = obterIdentidadeExigida(requisicao);
    const [conta] = await banco
      .select({ senha: accounts.password })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, usuarioId),
          eq(accounts.providerId, "credential"),
        ),
      )
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
  servidor.post(
    "/conta/senha",
    { preHandler },
    async (requisicao, resposta) => {
      const entrada = definirSenhaEntradaSchema.safeParse(requisicao.body);
      if (!entrada.success) {
        return responder(resposta, 400, {
          codigo: "SENHA_FRACA",
          mensagem: entrada.error.issues[0]?.message ?? "Senha inválida.",
        });
      }

      if (entrada.data.senhaAtual) {
        return encaminharParaBetterAuth(
          { autenticacao, urlBase },
          requisicao,
          resposta,
          "/change-password",
          {
            currentPassword: entrada.data.senhaAtual,
            newPassword: entrada.data.senha,
          },
        );
      }

      // `setPassword` é SERVER-ONLY no Better Auth (não existe por HTTP, de propósito): ele só define a
      // primeira senha e recusa sobrescrever uma existente. É exatamente a garantia que queremos.
      try {
        await autenticacao.api.setPassword({
          body: { newPassword: entrada.data.senha },
          headers: fromNodeHeaders(requisicao.headers),
        });
        return { definida: true } satisfies SituacaoSenha;
      } catch {
        return responder(resposta, 409, {
          codigo: "SENHA_JA_DEFINIDA",
          mensagem:
            "Você já tem uma senha. Informe a senha atual para alterá-la.",
        });
      }
    },
  );
}
