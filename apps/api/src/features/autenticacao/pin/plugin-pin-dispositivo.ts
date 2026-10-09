import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Banco } from "@jaa/banco";
import { dispositivosAutorizados } from "@jaa/banco/schema";
import {
  criarPinEntradaSchema,
  dispositivoDoPinEntradaSchema,
  dispositivoObrigatorioEntradaSchema,
  entrarComBiometriaEntradaSchema,
  entrarComPinEntradaSchema,
  type BiometriaAtivada,
  type PinCriado,
  type SituacaoPin,
} from "@jaa/contratos";
import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, isNull } from "drizzle-orm";
import { JANELA_PARA_CRIAR_PIN_SEGUNDOS, VALIDADE_CREDENCIAL_WEB_SEGUNDOS, consequenciaDoErro } from "./politica-pin.js";

/*
 * PIN DO DISPOSITIVO AUTORIZADO — plugin do Better Auth (rotas em /api/auth/pin/*).
 *
 * É um plugin, e não rotas soltas, para que a SESSÃO criada depois do PIN seja a do próprio Better
 * Auth (`createSession` + `setSessionCookie`): mesmo cookie no navegador, mesma sessão no aplicativo,
 * mesma verificação de origem e mesmo limite por IP das outras entradas. Nada de sessão manual.
 *
 * QUEM É A CONTA vem só da credencial do dispositivo — o cliente nunca manda usuário, e-mail ou
 * telefone. PIN certo sem a credencial daquele dispositivo não entra em lugar nenhum.
 *
 * ONDE FICA A CREDENCIAL (256 bits aleatórios; no banco, só o SHA-256 dela):
 * - NAVEGADOR: cookie HttpOnly, restrito às rotas do PIN — o JavaScript da página não a lê;
 * - APLICATIVO: devolvida UMA vez ao criar o PIN, para o armazenamento seguro do aparelho, e enviada
 *   no corpo ao entrar. É esse segredo que a biometria vai liberar na próxima etapa.
 * Quem decide o modo é o servidor, pelo cabeçalho Origin: navegador sempre o envia como http(s) e não
 * consegue forjá-lo; o aplicativo chega com o scheme dele.
 *
 * BIOMETRIA (só no aplicativo; rotas /pin/biometria/*): o servidor NUNCA recebe dado biométrico. Ele
 * guarda o hash de um SEGUNDO segredo aleatório do dispositivo, que o aparelho mantém protegido pela
 * biometria do sistema. Entrar por biometria exige a credencial do dispositivo E esse segredo; é um
 * caminho independente do PIN (não conta nem zera tentativas de PIN) e cai junto com a autorização
 * quando o dispositivo é revogado. No navegador essas rotas não existem.
 */

const CAMINHO = {
  situacao: "/pin/situacao",
  criar: "/pin/criar",
  entrar: "/pin/entrar",
  remover: "/pin/remover",
  ativarBiometria: "/pin/biometria/ativar",
  entrarComBiometria: "/pin/biometria/entrar",
  desativarBiometria: "/pin/biometria/desativar",
} as const;

// Entradas por CÓDIGO: são elas que comprovam a identidade e abrem a janela para criar o PIN.
const ENTRADAS_POR_CODIGO = new Set(["/phone-number/verify", "/sign-in/email-otp"]);
const marcaDeCodigoComprovado = (sessaoId: string) => `pin-codigo-comprovado:${sessaoId}`;

// Uma resposta só para tudo o que não é "entrou": não diz se o dispositivo existe, se foi revogado,
// se a conta sumiu ou se o PIN estava errado.
const PIN_NAO_ACEITO = { code: "PIN_NAO_ACEITO", message: "Não foi possível entrar com o PIN. Confira o PIN ou use SMS ou e-mail." };
const PIN_BLOQUEADO = { code: "PIN_BLOQUEADO", message: "Muitas tentativas. Aguarde alguns minutos ou use SMS ou e-mail." };
// Também uma resposta só: segredo errado, de outro aparelho, biometria não ativada, dispositivo revogado ou conta removida.
const BIOMETRIA_NAO_ACEITA = { code: "BIOMETRIA_NAO_ACEITA", message: "Não foi possível entrar com a biometria. Use o PIN." };
const BIOMETRIA_INDISPONIVEL = { code: "BIOMETRIA_INDISPONIVEL", message: "Não foi possível ativar a biometria neste aparelho." };
const ROTA_INEXISTENTE = { code: "NOT_FOUND", message: "Not Found" };

const resumoDaCredencial = (credencial: string) => createHash("sha256").update(credencial).digest("hex");

interface DependenciasPin {
  banco: Banco;
  /** Segredo do servidor: entra na derivação do PIN e não existe no banco. */
  segredo: string;
}

export function pinDoDispositivo({ banco, segredo }: DependenciasPin) {
  /*
   * O que vai para o hash forte NÃO é o PIN, e sim um valor derivado de PIN + credencial + segredo
   * do servidor. Sem a credencial em claro (que só o dispositivo tem) e sem o segredo, o hash do
   * banco não serve para testar PINs.
   */
  const materialDoPin = (pin: string, credencial: string) => createHmac("sha256", segredo).update(`jaa:pin:v1:${credencial}:${pin}`).digest("hex");

  type Contexto = GenericEndpointContext;

  const cookieDoDispositivo = (ctx: Contexto) =>
    ctx.context.createAuthCookie("dispositivo", { maxAge: VALIDADE_CREDENCIAL_WEB_SEGUNDOS, path: `${new URL(ctx.context.baseURL).pathname.replace(/\/+$/, "")}/pin` });

  const ehNavegador = (ctx: Contexto) => /^https?:\/\//i.test(ctx.headers?.get("origin") ?? "");

  /** Credencial que ESTE pedido apresenta: cookie no navegador; corpo no aplicativo. Nunca os dois. */
  function credencialApresentada(ctx: Contexto, doCorpo: string | undefined): string | null {
    if (ehNavegador(ctx)) return ctx.getCookie(cookieDoDispositivo(ctx).name) ?? null;
    return doCorpo ?? null;
  }

  // Biometria é do aplicativo: para o navegador estas rotas simplesmente não existem.
  function somenteAplicativo(ctx: Contexto) {
    if (ehNavegador(ctx)) throw APIError.from("NOT_FOUND", ROTA_INEXISTENTE);
  }

  // Comparação em tempo constante do segredo apresentado com o hash guardado.
  function segredoConfere(segredo: string, hashGuardado: string | null): boolean {
    if (!hashGuardado) return false;
    const [apresentado, guardado] = [Buffer.from(resumoDaCredencial(segredo), "hex"), Buffer.from(hashGuardado, "hex")];
    return apresentado.length === guardado.length && timingSafeEqual(apresentado, guardado);
  }

  function guardarNoNavegador(ctx: Contexto, credencial: string) {
    const cookie = cookieDoDispositivo(ctx);
    ctx.setCookie(cookie.name, credencial, cookie.attributes);
  }

  function esquecerNoNavegador(ctx: Contexto) {
    const cookie = cookieDoDispositivo(ctx);
    ctx.setCookie(cookie.name, "", { ...cookie.attributes, maxAge: 0 });
  }

  const autorizacaoAtiva = (credencial: string) => and(eq(dispositivosAutorizados.credencialHash, resumoDaCredencial(credencial)), isNull(dispositivosAutorizados.revogadoEm));

  async function revogar(credencial: string, usuarioId?: string) {
    await banco
      .update(dispositivosAutorizados)
      .set({ revogadoEm: new Date() })
      .where(usuarioId ? and(autorizacaoAtiva(credencial), eq(dispositivosAutorizados.usuarioId, usuarioId)) : autorizacaoAtiva(credencial));
  }

  /**
   * Confere o PIN e aplica a política de tentativas numa transação com a linha travada: palpites
   * simultâneos não passam juntos pela mesma tentativa.
   */
  async function conferirPin(credencial: string, pin: string): Promise<{ tipo: "ok"; usuarioId: string } | { tipo: "bloqueado" } | { tipo: "nao_aceito" }> {
    return banco.transaction(async (transacao) => {
      const [dispositivo] = await transacao.select().from(dispositivosAutorizados).where(autorizacaoAtiva(credencial)).for("update").limit(1);
      if (!dispositivo) return { tipo: "nao_aceito" };

      const agora = new Date();
      // Durante o bloqueio nem o PIN certo é conferido, e a tentativa não conta.
      if (dispositivo.bloqueadoAte && dispositivo.bloqueadoAte > agora) return { tipo: "bloqueado" };

      const filtro = eq(dispositivosAutorizados.id, dispositivo.id);
      if (await verifyPassword({ hash: dispositivo.pinHash, password: materialDoPin(pin, credencial) })) {
        await transacao.update(dispositivosAutorizados).set({ tentativasErradas: 0, bloqueadoAte: null, ultimoUsoEm: agora }).where(filtro);
        return { tipo: "ok", usuarioId: dispositivo.usuarioId };
      }

      const errosSeguidos = dispositivo.tentativasErradas + 1;
      const consequencia = consequenciaDoErro(errosSeguidos);
      await transacao
        .update(dispositivosAutorizados)
        .set({
          tentativasErradas: errosSeguidos,
          bloqueadoAte: consequencia.tipo === "bloqueio" ? new Date(agora.getTime() + consequencia.segundos * 1000) : null,
          revogadoEm: consequencia.tipo === "revogar" ? agora : null,
        })
        .where(filtro);
      return consequencia.tipo === "bloqueio" ? { tipo: "bloqueado" } : { tipo: "nao_aceito" };
    });
  }

  return {
    id: "pin-do-dispositivo",

    hooks: {
      after: [
        {
          // Entrou por CÓDIGO agora: esta sessão pode criar o PIN do dispositivo pelos próximos minutos.
          matcher: (ctx) => ENTRADAS_POR_CODIGO.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const sessaoId = ctx.context.newSession?.session.id;
            if (!sessaoId) return;
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: marcaDeCodigoComprovado(sessaoId),
              value: "1",
              expiresAt: new Date(Date.now() + JANELA_PARA_CRIAR_PIN_SEGUNDOS * 1000),
            });
          }),
        },
      ],
    },

    // Por IP, além da conta de erros por dispositivo. Persistido no banco, como os demais limites.
    rateLimit: [
      { pathMatcher: (caminho) => caminho === CAMINHO.entrar, window: 60, max: 5 },
      { pathMatcher: (caminho) => caminho === CAMINHO.criar, window: 60, max: 5 },
      { pathMatcher: (caminho) => caminho === CAMINHO.situacao || caminho === CAMINHO.remover || caminho === CAMINHO.desativarBiometria, window: 60, max: 30 },
      { pathMatcher: (caminho) => caminho === CAMINHO.entrarComBiometria, window: 60, max: 10 },
      { pathMatcher: (caminho) => caminho === CAMINHO.ativarBiometria, window: 60, max: 5 },
    ],

    endpoints: {
      /** Este dispositivo pode oferecer "Entrar com PIN"? Só responde sobre a credencial apresentada. */
      situacaoDoPin: createAuthEndpoint(CAMINHO.situacao, { method: "POST" }, async (ctx) => {
        const entrada = dispositivoDoPinEntradaSchema.safeParse(ctx.body ?? {});
        const credencial = credencialApresentada(ctx, entrada.success ? entrada.data.credencial : undefined);
        const situacao: SituacaoPin = { autorizado: false, biometria: false };
        if (credencial) {
          const [dispositivo] = await banco.select({ biometriaHash: dispositivosAutorizados.biometriaHash }).from(dispositivosAutorizados).where(autorizacaoAtiva(credencial)).limit(1);
          situacao.autorizado = Boolean(dispositivo);
          situacao.biometria = Boolean(dispositivo?.biometriaHash) && !ehNavegador(ctx);
        }
        return ctx.json(situacao);
      }),

      /**
       * CRIAR o PIN deste dispositivo. Só com sessão válida que acabou de ser aberta por CÓDIGO (SMS
       * ou e-mail): uma sessão antiga — ou roubada — não consegue plantar um dispositivo autorizado.
       */
      criarPin: createAuthEndpoint(CAMINHO.criar, { method: "POST", use: [sessionMiddleware] }, async (ctx) => {
        const entrada = criarPinEntradaSchema.safeParse(ctx.body);
        if (!entrada.success) {
          throw APIError.from("BAD_REQUEST", { code: "PIN_INVALIDO", message: entrada.error.issues[0]?.message ?? "PIN inválido." });
        }
        const { session, user } = ctx.context.session;

        const comprovacao = await ctx.context.internalAdapter.findVerificationValue(marcaDeCodigoComprovado(session.id));
        if (!comprovacao || comprovacao.expiresAt < new Date()) {
          throw APIError.from("FORBIDDEN", { code: "CODIGO_NECESSARIO", message: "Para criar o PIN, entre de novo com o código por SMS ou e-mail." });
        }

        // Dispositivo que já tinha um PIN desta conta: o anterior deixa de valer.
        const corpo: unknown = ctx.body;
        const doCorpo = typeof corpo === "object" && corpo !== null && "credencial" in corpo && typeof corpo.credencial === "string" ? corpo.credencial : undefined;
        const anterior = credencialApresentada(ctx, doCorpo);
        if (anterior) await revogar(anterior, user.id);

        const credencial = randomBytes(32).toString("base64url");
        await banco.insert(dispositivosAutorizados).values({
          usuarioId: user.id,
          credencialHash: resumoDaCredencial(credencial),
          pinHash: await hashPassword(materialDoPin(entrada.data.pin, credencial)),
        });

        if (ehNavegador(ctx)) {
          guardarNoNavegador(ctx, credencial);
          const criado: PinCriado = { autorizado: true };
          return ctx.json(criado);
        }
        const criado: PinCriado = { autorizado: true, credencial };
        return ctx.json(criado);
      }),

      /** ENTRAR com PIN: credencial do dispositivo + PIN → sessão normal do Better Auth. */
      entrarComPin: createAuthEndpoint(CAMINHO.entrar, { method: "POST" }, async (ctx) => {
        const entrada = entrarComPinEntradaSchema.safeParse(ctx.body);
        const credencial = credencialApresentada(ctx, entrada.success ? entrada.data.credencial : undefined);
        if (!entrada.success || !credencial) throw APIError.from("UNAUTHORIZED", PIN_NAO_ACEITO);

        const resultado = await conferirPin(credencial, entrada.data.pin);
        if (resultado.tipo === "bloqueado") throw APIError.from("TOO_MANY_REQUESTS", PIN_BLOQUEADO);
        if (resultado.tipo === "nao_aceito") throw APIError.from("UNAUTHORIZED", PIN_NAO_ACEITO);

        const usuario = await ctx.context.internalAdapter.findUserById(resultado.usuarioId);
        if (!usuario) {
          await revogar(credencial);
          throw APIError.from("UNAUTHORIZED", PIN_NAO_ACEITO);
        }

        const sessao = await ctx.context.internalAdapter.createSession(usuario.id);
        if (!sessao) throw APIError.from("UNAUTHORIZED", PIN_NAO_ACEITO);
        await setSessionCookie(ctx, { session: sessao, user: usuario });
        // No navegador a credencial é renovada a cada entrada (o prazo do cookie recomeça).
        if (ehNavegador(ctx)) guardarNoNavegador(ctx, credencial);
        return ctx.json({ autenticado: true });
      }),

      /** Este dispositivo deixa de aceitar PIN. Sempre responde igual, exista a autorização ou não. */
      removerPin: createAuthEndpoint(CAMINHO.remover, { method: "POST" }, async (ctx) => {
        const entrada = dispositivoDoPinEntradaSchema.safeParse(ctx.body ?? {});
        const credencial = credencialApresentada(ctx, entrada.success ? entrada.data.credencial : undefined);
        if (credencial) await revogar(credencial);
        if (ehNavegador(ctx)) esquecerNoNavegador(ctx);
        const situacao: SituacaoPin = { autorizado: false, biometria: false };
        return ctx.json(situacao);
      }),

      /**
       * ATIVAR a biometria deste aparelho. Só para quem está autenticado, num dispositivo JÁ
       * autorizado (com PIN) da própria conta. O segredo novo vem uma única vez; o aparelho o guarda
       * sob a biometria do sistema. Ativar de novo troca o segredo (o anterior deixa de valer).
       */
      ativarBiometria: createAuthEndpoint(CAMINHO.ativarBiometria, { method: "POST", use: [sessionMiddleware] }, async (ctx) => {
        somenteAplicativo(ctx);
        const entrada = dispositivoObrigatorioEntradaSchema.safeParse(ctx.body);
        if (!entrada.success) throw APIError.from("FORBIDDEN", BIOMETRIA_INDISPONIVEL);

        const segredo = randomBytes(32).toString("base64url");
        const atualizados = await banco
          .update(dispositivosAutorizados)
          .set({ biometriaHash: resumoDaCredencial(segredo) })
          // O dispositivo precisa ser DESTA conta: a credencial de outro usuário não ativa nada.
          .where(and(autorizacaoAtiva(entrada.data.credencial), eq(dispositivosAutorizados.usuarioId, ctx.context.session.user.id)))
          .returning({ id: dispositivosAutorizados.id });
        if (atualizados.length === 0) throw APIError.from("FORBIDDEN", BIOMETRIA_INDISPONIVEL);

        const ativada: BiometriaAtivada = { segredo };
        return ctx.json(ativada);
      }),

      /** ENTRAR com biometria: credencial do dispositivo + segredo liberado pela biometria → sessão normal. */
      entrarComBiometria: createAuthEndpoint(CAMINHO.entrarComBiometria, { method: "POST" }, async (ctx) => {
        somenteAplicativo(ctx);
        const entrada = entrarComBiometriaEntradaSchema.safeParse(ctx.body);
        if (!entrada.success) throw APIError.from("UNAUTHORIZED", BIOMETRIA_NAO_ACEITA);

        const [dispositivo] = await banco.select().from(dispositivosAutorizados).where(autorizacaoAtiva(entrada.data.credencial)).limit(1);
        if (!dispositivo || !segredoConfere(entrada.data.segredo, dispositivo.biometriaHash)) throw APIError.from("UNAUTHORIZED", BIOMETRIA_NAO_ACEITA);

        const usuario = await ctx.context.internalAdapter.findUserById(dispositivo.usuarioId);
        if (!usuario) {
          await revogar(entrada.data.credencial);
          throw APIError.from("UNAUTHORIZED", BIOMETRIA_NAO_ACEITA);
        }

        const sessao = await ctx.context.internalAdapter.createSession(usuario.id);
        if (!sessao) throw APIError.from("UNAUTHORIZED", BIOMETRIA_NAO_ACEITA);
        // Só o uso é registrado: as tentativas e o bloqueio do PIN não são tocados pela biometria.
        await banco.update(dispositivosAutorizados).set({ ultimoUsoEm: new Date() }).where(eq(dispositivosAutorizados.id, dispositivo.id));
        await setSessionCookie(ctx, { session: sessao, user: usuario });
        return ctx.json({ autenticado: true });
      }),

      /** Este aparelho deixa de aceitar biometria (o PIN continua). Sempre responde igual. */
      desativarBiometria: createAuthEndpoint(CAMINHO.desativarBiometria, { method: "POST" }, async (ctx) => {
        somenteAplicativo(ctx);
        const entrada = dispositivoObrigatorioEntradaSchema.safeParse(ctx.body);
        if (entrada.success) await banco.update(dispositivosAutorizados).set({ biometriaHash: null }).where(autorizacaoAtiva(entrada.data.credencial));
        return ctx.json({ biometria: false });
      }),
    },
  } satisfies BetterAuthPlugin;
}
