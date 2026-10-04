import { entrarComSenhaEntradaSchema, type EntrarComSenhaEntrada } from "@jaa/contratos";

/*
 * ENTRAR COM IDENTIFICADOR + SENHA — a parte PURA (sem React Native), testada com `node:test`.
 *
 * Quem decide se o identificador é celular ou @usuario, e se a senha confere, é o SERVIDOR
 * (`POST /autenticacao/entrar`, que delega ao Better Auth). Aqui só se monta o corpo do contrato e se
 * traduz a falha em texto para a pessoa — nunca com a senha dentro.
 */

export const CAMINHO_ENTRAR_COM_SENHA = "/autenticacao/entrar";

export type MontagemEntrada = { ok: true; corpo: EntrarComSenhaEntrada } | { ok: false; mensagem: string };

// Mesmo contrato do servidor: identificador aparado e não vazio; senha não vazia (e NÃO aparada).
export function montarEntradaComSenha(identificador: string, senha: string): MontagemEntrada {
  const lido = entrarComSenhaEntradaSchema.safeParse({ identificador, senha });
  if (!lido.success) return { ok: false, mensagem: lido.error.issues[0]?.message ?? "Informe usuário e senha." };
  return { ok: true, corpo: lido.data };
}

/**
 * Texto para a falha. Usa só `status` e a mensagem do SERVIDOR (textos fixos do Jaa/Better Auth);
 * nada do que a pessoa digitou volta para a tela.
 */
export function mensagemFalhaEntrar(erro: unknown): string {
  const dados = typeof erro === "object" && erro !== null ? (erro as Record<string, unknown>) : {};
  const status = typeof dados.status === "number" ? dados.status : 0;
  if (status === 0) return "Sem conexão com o Jaa.";
  if (status === 429) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  if (typeof dados.mensagem === "string" && dados.mensagem.length > 0) return dados.mensagem;
  if (status === 401) return "Celular/@usuario ou senha incorretos.";
  return "Não foi possível entrar agora.";
}
