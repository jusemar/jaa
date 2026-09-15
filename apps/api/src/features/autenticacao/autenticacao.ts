import type { Banco } from "@jaa/banco";
import * as schema from "@jaa/banco/schema";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins";
import type { Ambiente } from "../../lib/ambiente.js";
import type { EntregadorOtp } from "./entrega-otp/entregador-otp.js";
import { derivarEmailTecnico, NOME_TECNICO_CONTA } from "./lib/conta-tecnica.js";
import type { AvisoSessoesEncerradas } from "./lib/sessoes-encerradas.js";
import { ehCelularBrasileiroNormalizado, normalizarCelularBrasileiro } from "./lib/telefone.js";

export const CAMINHO_BASE_AUTENTICACAO = "/api/auth";

// Preenchido pela ponte Fastify com o IP resolvido pelo próprio Fastify.
// Valores enviados pelo cliente neste cabeçalho são descartados antes de chegar aqui.
export const CABECALHO_IP_CLIENTE = "x-jaa-ip-cliente";

export const OTP_EXPIRA_EM_SEGUNDOS = 300;
export const INTERVALO_MINIMO_ENTRE_OTPS_SEGUNDOS = 60;

const ROTAS_COM_TELEFONE = new Set(["/phone-number/send-otp", "/phone-number/verify"]);

interface DependenciasAutenticacao {
  banco: Banco;
  ambiente: Ambiente;
  entregadorOtp: EntregadorOtp;
  sessoesEncerradas: AvisoSessoesEncerradas;
}

export function criarOpcoesAutenticacao({
  banco,
  ambiente,
  entregadorOtp,
  sessoesEncerradas,
}: DependenciasAutenticacao) {
  return {
    appName: "Jaa",
    baseURL: ambiente.BETTER_AUTH_URL,
    basePath: CAMINHO_BASE_AUTENTICACAO,
    secret: ambiente.BETTER_AUTH_SECRET,
    trustedOrigins: ambiente.ORIGENS_WEB_PERMITIDAS,
    database: drizzleAdapter(banco, {
      provider: "pg",
      schema,
      usePlural: true,
      transaction: true,
    }),
    // A única credencial é o telefone verificado por OTP. Não há senha nem login por e-mail.
    emailAndPassword: { enabled: false },
    // O plugin de telefone também expõe login/redefinição por SENHA; ficam desativados
    // para que ninguém consiga criar uma senha e contornar o OTP.
    disabledPaths: [
      "/sign-in/phone-number",
      "/phone-number/request-password-reset",
      "/phone-number/reset-password",
    ],
    rateLimit: {
      // Por padrão o Better Auth só limita em produção; o Jaa limita em todos os ambientes.
      enabled: true,
      // Persistido no PostgreSQL: sobrevive a reinícios e vale entre instâncias da API.
      storage: "database",
      customRules: {
        "/phone-number/send-otp": { window: 60, max: 5 },
        "/phone-number/verify": { window: 60, max: 10 },
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

        // O plugin de telefone passa a receber somente a forma canônica E.164.
        return { context: { body: { ...corpoObjeto, phoneNumber: telefone } } };
      }),
    },
    plugins: [
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
  api: Pick<InstanciaAutenticacao["api"], "getSession">;
};
