import type { Banco } from "@jaa/banco";
import * as schema from "@jaa/banco/schema";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { SENHA_TAMANHO_MAXIMO, SENHA_TAMANHO_MINIMO } from "@jaa/contratos";
import type { Ambiente } from "../../lib/ambiente.js";
import type { EntregadorOtp } from "./entrega-otp/entregador-otp.js";
import { derivarEmailTecnico, NOME_TECNICO_CONTA } from "./lib/conta-tecnica.js";
import type { AvisoSessoesEncerradas } from "./lib/sessoes-encerradas.js";
import { ehCelularBrasileiroNormalizado, normalizarCelularBrasileiro } from "./lib/telefone.js";

export const CAMINHO_BASE_AUTENTICACAO = "/api/auth";

/*
 * Esquema do aplicativo (apps/mobile/app.json → expo.scheme). O Better Auth precisa confiar nele para
 * aceitar as requisições do Mobile: é a MESMA autenticação do Web (conta + sessão + OTP por celular),
 * só que com a sessão guardada em armazenamento seguro do aparelho em vez de cookie do navegador.
 */
export const ESQUEMA_MOBILE = "mobile";

// Preenchido pela ponte Fastify com o IP resolvido pelo próprio Fastify.
// Valores enviados pelo cliente neste cabeçalho são descartados antes de chegar aqui.
export const CABECALHO_IP_CLIENTE = "x-jaa-ip-cliente";

export const OTP_EXPIRA_EM_SEGUNDOS = 300;
export const INTERVALO_MINIMO_ENTRE_OTPS_SEGUNDOS = 60;

const ROTAS_COM_TELEFONE = new Set([
  "/phone-number/send-otp",
  "/phone-number/verify",
  // Recuperação de senha: também recebe telefone e também precisa da forma canônica E.164.
  "/phone-number/request-password-reset",
]);

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
    trustedOrigins: [...ambiente.ORIGENS_WEB_PERMITIDAS, `${ESQUEMA_MOBILE}://`],
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
    disabledPaths: ["/sign-in/email", "/sign-up/email", "/forget-password", "/reset-password"],
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
  api: Pick<InstanciaAutenticacao["api"], "getSession" | "setPassword">;
};
