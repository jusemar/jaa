import type { Banco } from "@jaa/banco";
import * as schema from "@jaa/banco/schema";
import { users } from "@jaa/banco/schema";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { and, eq, ne } from "drizzle-orm";
import { emailOTP, phoneNumber } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { SENHA_TAMANHO_MAXIMO, SENHA_TAMANHO_MINIMO } from "@jaa/contratos";
import type { Ambiente } from "../../lib/ambiente.js";
import { createHash } from "node:crypto";
import { consumirLimiteDeUso } from "../../lib/limite-de-uso.js";
import type { EntregadorOtp } from "./entrega-otp/entregador-otp.js";
import type { EntregadorOtpEmail } from "./entrega-otp/entregador-otp-email.js";
import { derivarEmailTecnico, NOME_TECNICO_CONTA } from "./lib/conta-tecnica.js";
import { normalizarEmail } from "./lib/email.js";
import { pinDoDispositivo } from "./pin/plugin-pin-dispositivo.js";
import type { AvisoSessoesEncerradas } from "./lib/sessoes-encerradas.js";
import { ehCelularBrasileiroNormalizado, normalizarCelularBrasileiro } from "./lib/telefone.js";

export const CAMINHO_BASE_AUTENTICACAO = "/api/auth";

/*
 * Schemes do aplicativo (apps/mobile/app.config.ts): `jaa` é o app de produção e `jaa-dev` o "Jaa Dev"
 * de desenvolvimento. O Better Auth precisa confiar neles para aceitar as requisições do Mobile: é a
 * MESMA autenticação do Web (conta + sessão + OTP por celular), só que com a sessão guardada em
 * armazenamento seguro do aparelho em vez de cookie do navegador. A API de produção não reconhece o
 * app de desenvolvimento: os dois ambientes não se misturam.
 */
export function esquemasMobile(nodeEnv: Ambiente["NODE_ENV"]): string[] {
  return nodeEnv === "production" ? ["jaa"] : ["jaa", "jaa-dev"];
}

// Preenchido pela ponte Fastify com o IP resolvido pelo próprio Fastify.
// Valores enviados pelo cliente neste cabeçalho são descartados antes de chegar aqui.
export const CABECALHO_IP_CLIENTE = "x-jaa-ip-cliente";

// Validade de TODO código de verificação do Jaa: 5 minutos, contados pelo Better Auth a partir do
// pedido. É o padrão também para canais futuros (e-mail). O entregador (SMS) não controla isto.
export const OTP_EXPIRA_EM_SEGUNDOS = 300;
export const INTERVALO_MINIMO_ENTRE_OTPS_SEGUNDOS = 60;
/*
 * Tetos por HORA do código por e-mail. Com o cadastro por e-mail aberto, qualquer endereço pode
 * receber um código: sem teto, o Jaa viraria disparador de mensagens para terceiros.
 */
export const MAXIMO_CODIGOS_EMAIL_POR_DESTINATARIO_POR_HORA = 5;
export const MAXIMO_CODIGOS_EMAIL_POR_IP_POR_HORA = 20;

const ROTAS_COM_TELEFONE = new Set([
  "/phone-number/send-otp",
  "/phone-number/verify",
  // Recuperação de senha: também recebe telefone e também precisa da forma canônica E.164.
  "/phone-number/request-password-reset",
]);

/*
 * OTP POR E-MAIL (plugin oficial `emailOTP` do Better Auth). Rotas em que o e-mail informado é
 * normalizado e validado ANTES de chegar ao plugin, e o campo do corpo que o carrega.
 */
const ROTAS_COM_EMAIL = new Map([
  ["/email-otp/send-verification-otp", "email"],
  ["/sign-in/email-otp", "email"],
  ["/email-otp/request-email-change", "newEmail"],
  ["/email-otp/change-email", "newEmail"],
]);
// As que DISPARAM um e-mail: sobre elas vale o intervalo mínimo por destinatário.
const ROTAS_QUE_ENVIAM_EMAIL = new Set(["/email-otp/send-verification-otp", "/email-otp/request-email-change"]);

/*
 * Rotas do plugin de e-mail que o Jaa NÃO usa nesta etapa: verificação avulsa de e-mail e
 * recuperação de senha por e-mail (a recuperação será uma etapa própria).
 */
const ROTAS_EMAIL_DESATIVADAS = [
  "/email-otp/verify-email",
  "/email-otp/check-verification-otp",
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
  "/email-otp/reset-password",
];

// O destinatário (e o IP) entram na chave do limite só como hash: a tabela de limites não guarda e-mails.
const resumo = (valor: string) => createHash("sha256").update(valor).digest("hex");
const chaveLimiteEmail = (email: string) => `otp-email:${resumo(email)}`;

const MUITOS_PEDIDOS = { code: "MUITOS_PEDIDOS_DE_CODIGO", message: "Muitas solicitações de código. Tente novamente mais tarde." };

interface DependenciasAutenticacao {
  banco: Banco;
  ambiente: Ambiente;
  entregadorOtp: EntregadorOtp;
  // Ausente/null = OTP por e-mail desligado: o plugin nem é registrado e as rotas não existem.
  entregadorOtpEmail?: EntregadorOtpEmail | null;
  sessoesEncerradas: AvisoSessoesEncerradas;
}

export function criarOpcoesAutenticacao({
  banco,
  ambiente,
  entregadorOtp,
  entregadorOtpEmail = null,
  sessoesEncerradas,
}: DependenciasAutenticacao) {
  /*
   * O plugin de e-mail NÃO propaga a falha do envio (ele a registra e responde sucesso). No Jaa,
   * código que não saiu é pedido que FALHOU: o envio marca a requisição aqui e o hook `after`
   * devolve o erro. A marca fica presa à própria requisição e some com ela.
   */
  const enviosDeEmailQueFalharam = new WeakSet<Request>();

  return {
    appName: "Jaa",
    baseURL: ambiente.BETTER_AUTH_URL,
    basePath: CAMINHO_BASE_AUTENTICACAO,
    secret: ambiente.BETTER_AUTH_SECRET,
    trustedOrigins: [...ambiente.ORIGENS_WEB_PERMITIDAS, ...esquemasMobile(ambiente.NODE_ENV).map((esquema) => `${esquema}://`)],
    database: drizzleAdapter(banco, {
      provider: "pg",
      schema,
      usePlural: true,
      transaction: true,
    }),
    /*
     * A senha é uma credencial do Better Auth (hash, sessão e cookie são dele). O e-mail continua
     * fora do produto: é um endereço técnico opaco, ninguém o conhece — por isso as rotas de e-mail
     * ficam desativadas e o login acontece por telefone OU @usuario (rotas-credenciais.ts).
     *
     * O OTP não foi substituído: ele continua sendo o CADASTRO e a RECUPERAÇÃO. Conta antiga sem
     * senha nenhuma segue entrando por OTP e pode definir uma senha depois.
     */
    emailAndPassword: { enabled: true, minPasswordLength: SENHA_TAMANHO_MINIMO, maxPasswordLength: SENHA_TAMANHO_MAXIMO },
    disabledPaths: ["/sign-in/email", "/sign-up/email", "/forget-password", "/reset-password", ...ROTAS_EMAIL_DESATIVADAS],
    rateLimit: {
      // Por padrão o Better Auth só limita em produção; o Jaa limita em todos os ambientes.
      enabled: true,
      // Persistido no PostgreSQL: sobrevive a reinícios e vale entre instâncias da API.
      storage: "database",
      customRules: {
        "/phone-number/send-otp": { window: 60, max: 5 },
        "/phone-number/verify": { window: 60, max: 10 },
        "/phone-number/request-password-reset": { window: 60, max: 5 },
        // Tentar senha é barato para quem ataca: o limite por IP é a primeira barreira.
        "/sign-in/phone-number": { window: 60, max: 10 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: [CABECALHO_IP_CLIENTE] },
    },
    telemetry: { enabled: false },
    databaseHooks: {
      session: {
        delete: {
          // Hook oficial executado para CADA sessão apagada (logout, revogação, sessão expirada).
          // Avisa com o id da sessão, nunca o token, para encerrar só as conexões dela.
          after: async (sessao) => {
            sessoesEncerradas.notificar(sessao.id);
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const campoEmail = ROTAS_COM_EMAIL.get(ctx.path);
        if (campoEmail) {
          const corpo: unknown = ctx.body;
          const corpoObjeto: Record<string, unknown> | null = typeof corpo === "object" && corpo !== null ? { ...corpo } : null;
          const informado = corpoObjeto?.[campoEmail];
          const email = typeof informado === "string" ? normalizarEmail(informado) : null;

          if (!corpoObjeto || !email) {
            throw APIError.from("BAD_REQUEST", { code: "INVALID_EMAIL", message: "E-mail inválido." });
          }
          // Só o código de ENTRADA é pedido por aqui; os demais tipos do plugin não fazem parte do Jaa.
          if (ctx.path === "/email-otp/send-verification-otp" && corpoObjeto.type !== "sign-in") {
            throw APIError.from("BAD_REQUEST", { code: "TIPO_DE_CODIGO_INVALIDO", message: "Tipo de código inválido." });
          }
          // Limite por DESTINATÁRIO (o do Better Auth é por IP): ninguém recebe uma enxurrada de
          // códigos, venha o pedido de onde vier. Mesmo intervalo do SMS, mais os tetos por hora.
          // Valem para QUALQUER endereço, com ou sem conta: o limite não revela nada.
          if (ROTAS_QUE_ENVIAM_EMAIL.has(ctx.path)) {
            const limite = await consumirLimiteDeUso(banco, chaveLimiteEmail(email), { janelaSegundos: INTERVALO_MINIMO_ENTRE_OTPS_SEGUNDOS, maximo: 1 });
            if (!limite.permitido) {
              throw APIError.from("TOO_MANY_REQUESTS", { code: "OTP_SOLICITADO_RECENTEMENTE", message: "Aguarde um minuto antes de solicitar um novo código." });
            }
            const porHora = [{ chave: `otp-email-hora:${resumo(email)}`, maximo: MAXIMO_CODIGOS_EMAIL_POR_DESTINATARIO_POR_HORA }];
            const ip = ctx.headers?.get(CABECALHO_IP_CLIENTE);
            if (ip) porHora.push({ chave: `otp-email-ip:${resumo(ip)}`, maximo: MAXIMO_CODIGOS_EMAIL_POR_IP_POR_HORA });
            for (const { chave, maximo } of porHora) {
              if (!(await consumirLimiteDeUso(banco, chave, { janelaSegundos: 3600, maximo })).permitido) throw APIError.from("TOO_MANY_REQUESTS", MUITOS_PEDIDOS);
            }
          }

          /*
           * CADASTRAR E-MAIL que já é de OUTRA conta: o plugin responde sucesso sem enviar nada. Para
           * que a resposta não dependa de o endereço ter conta (com o provedor fora do ar, um caso
           * falharia e o outro não), o dono do endereço recebe um AVISO pelo mesmo canal — e a falha
           * desse envio é falha do pedido, igual à do código. Nada é unido nem trocado aqui.
           */
          if (ctx.path === "/email-otp/request-email-change" && entregadorOtpEmail) {
            const sessao = await getSessionFromCtx(ctx);
            if (sessao) {
              const [outraConta] = await banco.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, sessao.user.id))).limit(1);
              if (outraConta) {
                try {
                  await entregadorOtpEmail.avisarEnderecoJaCadastrado({ email });
                } catch (erro) {
                  ctx.context.logger.error("Falha ao enviar aviso de e-mail já cadastrado:", erro);
                  if (ctx.request) enviosDeEmailQueFalharam.add(ctx.request);
                }
              }
            }
          }

          /*
           * ENTRAR/CADASTRAR por e-mail: conta nova nasce com o nome técnico (o nome público vive na
           * identidade), e nada além de e-mail e código vem do cliente — nem nome, nem imagem, nem
           * campo extra.
           */
          if (ctx.path === "/sign-in/email-otp") {
            if (Object.keys(corpoObjeto).some((campo) => campo !== "email" && campo !== "otp")) {
              throw APIError.from("BAD_REQUEST", { code: "DADOS_INVALIDOS", message: "Dados inválidos." });
            }
            return { context: { body: { email, name: NOME_TECNICO_CONTA } } };
          }
          // O plugin passa a receber somente o e-mail em forma canônica.
          return { context: { body: { ...corpoObjeto, [campoEmail]: email } } };
        }

        if (!ROTAS_COM_TELEFONE.has(ctx.path)) {
          return;
        }

        const corpo: unknown = ctx.body;
        const corpoObjeto = typeof corpo === "object" && corpo !== null ? corpo : null;
        const telefoneInformado = corpoObjeto && "phoneNumber" in corpoObjeto ? corpoObjeto.phoneNumber : undefined;
        const telefone = typeof telefoneInformado === "string" ? normalizarCelularBrasileiro(telefoneInformado) : null;

        if (!corpoObjeto || !telefone) {
          throw APIError.from("BAD_REQUEST", {
            code: "INVALID_PHONE_NUMBER",
            message: "Número de celular inválido.",
          });
        }

        // Limite por TELEFONE (o rate limit do Better Auth é por IP): evita disparos
        // repetidos para o mesmo número, o que geraria custo quando houver SMS real.
        if (ctx.path === "/phone-number/send-otp") {
          const verificacaoAtual = await ctx.context.internalAdapter.findVerificationValue(telefone);
          const limite = Date.now() - INTERVALO_MINIMO_ENTRE_OTPS_SEGUNDOS * 1000;

          if (verificacaoAtual && verificacaoAtual.createdAt.getTime() > limite) {
            throw APIError.from("TOO_MANY_REQUESTS", {
              code: "OTP_SOLICITADO_RECENTEMENTE",
              message: "Aguarde um minuto antes de solicitar um novo código.",
            });
          }
        }

        /*
         * VINCULAR o celular a uma conta que nasceu por e-mail: se quem confirma o código já está
         * autenticado e a conta dele ainda NÃO tem telefone, o número entra NESSA conta (fluxo
         * oficial `updatePhoneNumber`). Sem isto, a mesma chamada criaria uma segunda conta. Número
         * que já é de outra conta é recusado pelo plugin — nunca há união automática.
         */
        if (ctx.path === "/phone-number/verify") {
          const sessao = await getSessionFromCtx(ctx);
          const telefoneDaConta: unknown = sessao?.user.phoneNumber;
          if (sessao && !telefoneDaConta) {
            return { context: { body: { ...corpoObjeto, phoneNumber: telefone, updatePhoneNumber: true } } };
          }
        }

        // O plugin de telefone passa a receber somente a forma canônica E.164.
        return { context: { body: { ...corpoObjeto, phoneNumber: telefone } } };
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.request && enviosDeEmailQueFalharam.has(ctx.request)) {
          throw APIError.from("SERVICE_UNAVAILABLE", { code: "FALHA_AO_ENVIAR_CODIGO", message: "Não foi possível enviar o código. Tente novamente." });
        }
      }),
    },
    plugins: [
      // Sessão do aplicativo nativo (mesmo domínio de contas; nenhuma autenticação paralela).
      expo(),
      phoneNumber({
        otpLength: 6,
        expiresIn: OTP_EXPIRA_EM_SEGUNDOS,
        allowedAttempts: 3,
        // Segunda barreira: após o hook, só chega aqui celular brasileiro já em E.164 canônico.
        phoneNumberValidator: ehCelularBrasileiroNormalizado,
        sendOTP: async ({ phoneNumber: telefone, code }) => {
          await entregadorOtp.enviar({ telefone, codigo: code });
        },
        signUpOnVerification: {
          // O Better Auth exige e-mail único na conta. O Jaa não pede e-mail: usa um endereço
          // técnico opaco e estável (HMAC do telefone), sem o telefone visível.
          getTempEmail: (telefone) => derivarEmailTecnico(telefone, ambiente.BETTER_AUTH_SECRET),
          // Sem getTempName o Better Auth usaria o TELEFONE como nome. O nome público vive na identidade.
          getTempName: () => NOME_TECNICO_CONTA,
        },
      }),
      /*
       * OTP POR E-MAIL — mesmo princípio do telefone: o Better Auth gera, expira e valida; o
       * entregador só entrega.
       * - ENTRAR e CADASTRAR são o mesmo pedido: o código vai para QUALQUER e-mail válido, tenha
       *   conta ou não (a resposta não revela qual). Confirmado o código, entra na conta daquele
       *   e-mail ou, se não existir, cria a conta — com o e-mail real já verificado e SEM telefone.
       * - CADASTRAR/TROCAR o e-mail de uma conta existente é da pessoa já autenticada
       *   (`changeEmail`): o código vai para o endereço novo, e só a confirmação o grava
       *   (verificado) no lugar do técnico. É assim que a conta do celular ganha e-mail.
       */
      ...(entregadorOtpEmail
        ? [
            emailOTP({
              otpLength: 6,
              expiresIn: OTP_EXPIRA_EM_SEGUNDOS,
              allowedAttempts: 3,
              changeEmail: { enabled: true },
              // Por IP, em cada rota do plugin; o limite por destinatário fica no hook acima.
              rateLimit: { window: 60, max: 3 },
              sendVerificationOTP: async ({ email, otp }, ctx) => {
                try {
                  await entregadorOtpEmail.enviar({ email, codigo: otp, validadeSegundos: OTP_EXPIRA_EM_SEGUNDOS });
                } catch (erro) {
                  if (ctx?.request) enviosDeEmailQueFalharam.add(ctx.request);
                  throw erro;
                }
              },
            }),
          ]
        : []),
      // PIN do dispositivo autorizado: entrada sem novo código em aparelho/navegador já comprovado.
      pinDoDispositivo({ banco, segredo: ambiente.BETTER_AUTH_SECRET }),
    ],
  } satisfies BetterAuthOptions;
}

export function criarAutenticacao(dependencias: DependenciasAutenticacao) {
  return betterAuth(criarOpcoesAutenticacao(dependencias));
}

type InstanciaAutenticacao = ReturnType<typeof criarAutenticacao>;

// Superfície do Better Auth usada pelas rotas do Jaa. Permite injetar instâncias com
// plugins adicionais (ex.: testUtils nos testes) sem acoplar as rotas à configuração exata.
export type Autenticacao = Pick<InstanciaAutenticacao, "handler"> & {
  // `setPassword` é server-only no Better Auth: só existe por aqui, nunca como rota HTTP.
  // `signInEmail`: a rota pública `/sign-in/email` fica DESLIGADA; a senha de conta sem telefone é
  // conferida por esta chamada interna, a partir de `POST /autenticacao/entrar`.
  api: Pick<InstanciaAutenticacao["api"], "getSession" | "setPassword" | "signInEmail">;
};
