import { createHash } from "node:crypto";
import type { Banco } from "@jaa/banco";
import { sessions, users } from "@jaa/banco/schema";
import { NOME_PADRAO_VISITANTE, criarVisitanteEntradaSchema, type ErroApi, type VisitanteAtual } from "@jaa/contratos";
import { fromNodeHeaders } from "better-auth/node";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as z from "zod";
import { consumirLimiteDeUso } from "../../../lib/limite-de-uso.js";
import type { Autenticacao } from "../../autenticacao/autenticacao.js";
import { ehSessaoAnonima } from "../../autenticacao/lib/sessao-anonima.js";
import { expiracaoDoVisitante, situacaoDoVisitante } from "../lib/situacao-visitante.js";
import { buscarVisitanteDoUsuario, inserirIdentidadeVisitante } from "../repositorios/repositorio-visitantes.js";

// Visitantes novos por IP: cada um é uma conta temporária. O IP entra na chave só como hash.
const LIMITE_VISITANTES_POR_IP = { janelaSegundos: 3600, maximo: 10 };

const respostaAnonimaSchema = z.object({ user: z.object({ id: z.string().min(1) }) });

function responder(resposta: FastifyReply, status: number, erro: ErroApi) {
  return resposta.code(status).send(erro);
}

/**
 * CONVERSAR SEM CONTA pelo Link do Jaa: abre a sessão de VISITANTE.
 *
 * A sessão é a do Better Auth (plugin oficial `anonymous`, chamado aqui por dentro — a rota pública dele
 * fica desligada): mesmo cookie HttpOnly, mesma validação em cada requisição, mesmo encerramento.
 * O Jaa só acrescenta a identidade visitante (pessoal, com @usuario técnico e a marca de visitante) e
 * o limite por IP. Token e ids técnicos nunca vão para o corpo da resposta.
 */
export function registrarRotasVisitantes(servidor: FastifyInstance, { banco, autenticacao }: { banco: Banco; autenticacao: Autenticacao }) {
  servidor.post("/visitantes", async (requisicao, resposta) => {
    const entrada = criarVisitanteEntradaSchema.safeParse(requisicao.body ?? {});
    if (!entrada.success) {
      return responder(resposta, 400, { codigo: "DADOS_INVALIDOS", mensagem: entrada.error.issues[0]?.message ?? "Dados inválidos." });
    }

    const cabecalhos = fromNodeHeaders(requisicao.headers);
    const sessao = await autenticacao.api.getSession({ headers: cabecalhos });
    if (sessao) {
      // Já é visitante ativo: devolve o mesmo (repetir o toque não cria outro).
      const atual = await buscarVisitanteDoUsuario(banco, sessao.user.id);
      if (atual && situacaoDoVisitante(atual, new Date()) === "ativa") {
        const visitante: VisitanteAtual = { identidadeId: atual.identidadeId, nomeExibicao: atual.nomeExibicao, expiraEm: expiracaoDoVisitante(atual).toISOString() };
        return resposta.code(200).send(visitante);
      }
      // Conta de verdade não vira visitante.
      if (!ehSessaoAnonima(sessao)) {
        return responder(resposta, 409, { codigo: "DADOS_INVALIDOS", mensagem: "Você já está conectado. Saia para conversar como visitante." });
      }
      // Visitante VENCIDO voltando antes da rotina de limpeza: a sessão velha sai agora (o resto a rotina
      // limpa, preservando o histórico) e nasce um visitante novo — nada do antigo é herdado.
      await banco.delete(sessions).where(eq(sessions.userId, sessao.user.id));
      cabecalhos.delete("cookie");
    }

    const limite = await consumirLimiteDeUso(banco, `visitante-ip:${createHash("sha256").update(requisicao.ip).digest("hex")}`, LIMITE_VISITANTES_POR_IP);
    if (!limite.permitido) {
      return resposta
        .header("retry-after", String(limite.tenteNovamenteEmSegundos))
        .code(429)
        .send({ codigo: "LIMITE_DE_TENTATIVAS_ATINGIDO", mensagem: "Muitas tentativas. Aguarde um pouco ou crie sua conta." } satisfies ErroApi);
    }

    const respostaAutenticacao = await autenticacao.api.signInAnonymous({ headers: cabecalhos, asResponse: true });
    const corpo = respostaAnonimaSchema.safeParse(await respostaAutenticacao.clone().json().catch(() => null));
    if (!respostaAutenticacao.ok || !corpo.success) {
      return responder(resposta, 503, { codigo: "DADOS_INVALIDOS", mensagem: "Não foi possível começar agora. Tente novamente." });
    }
    const usuarioId = corpo.data.user.id;

    let visitante;
    try {
      visitante = await inserirIdentidadeVisitante(banco, { usuarioId, nomeExibicao: entrada.data.nomeExibicao ?? NOME_PADRAO_VISITANTE });
    } catch (erro) {
      // Sem identidade a conta temporária não serve para nada: sai agora (sessão em cascata), sem cookie.
      await banco.delete(users).where(and(eq(users.id, usuarioId), eq(users.isAnonymous, true)));
      throw erro;
    }

    const cookies = respostaAutenticacao.headers.getSetCookie();
    if (cookies.length > 0) resposta.header("set-cookie", cookies);
    const criado: VisitanteAtual = { identidadeId: visitante.identidadeId, nomeExibicao: visitante.nomeExibicao, expiraEm: expiracaoDoVisitante(visitante).toISOString() };
    return resposta.code(201).send(criado);
  });
}
