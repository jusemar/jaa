import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { URL_API } from "@/lib/configuracao";
import { IDENTIDADE_DA_VARIANTE, varianteDeclarada } from "@/lib/variante";
import { CAMINHO_ENTRAR_COM_SENHA, mensagemFalhaEntrar, montarEntradaComSenha } from "./entrar-com-senha";

/**
 * MESMA autenticação do Web: Better Auth, conta por CELULAR + OTP, sem senha. O que muda é só onde a
 * sessão fica guardada — no navegador é cookie HttpOnly; aqui, o armazenamento seguro do aparelho.
 *
 * Não existe login paralelo no Mobile: a conta, a identidade pessoal e os vínculos com empresas são
 * exatamente os mesmos (uma pessoa que também entrega continua sendo uma pessoa comum do Jaa).
 */
export const clienteAutenticacao = createAuthClient({
  baseURL: URL_API,
  basePath: "/api/auth",
  plugins: [
    phoneNumberClient(),
    expoClient({
      // O scheme da variante em execução (`jaa-dev` ou `jaa`), o mesmo do app.config.ts; a API precisa
      // confiar nele (trustedOrigins).
      scheme: IDENTIDADE_DA_VARIANTE[varianteDeclarada(Constants.expoConfig?.extra?.variante) ?? "production"].scheme,
      storagePrefix: "jaa",
      storage: SecureStore,
    }),
  ],
});

/**
 * ENTRAR COM CELULAR OU @USUARIO + SENHA pela rota do Jaa (`POST /autenticacao/entrar`), que traduz o
 * identificador e delega ao Better Auth. Vai pelo `$fetch` DESTE cliente de propósito: é o plugin do
 * Expo que manda `expo-origin`, lê o cookie da resposta e o guarda no SecureStore — a mesma sessão do
 * OTP, sem mecanismo paralelo. O limite de tempo evita a tela presa quando a API não é alcançável.
 */
export async function entrarComSenha(identificador: string, senha: string): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const montagem = montarEntradaComSenha(identificador, senha);
  if (!montagem.ok) return montagem;
  try {
    const { error } = await clienteAutenticacao.$fetch(`${URL_API}${CAMINHO_ENTRAR_COM_SENHA}`, {
      method: "POST",
      body: montagem.corpo,
      timeout: 15_000,
    });
    return error ? { ok: false, mensagem: mensagemFalhaEntrar(error) } : { ok: true };
  } catch {
    return { ok: false, mensagem: mensagemFalhaEntrar(null) };
  }
}

/**
 * Cabeçalho de sessão para as chamadas do Jaa feitas com `fetch` direto (a API de entregas).
 * O plugin do Expo guarda o cookie da sessão; aqui ele é reaproveitado, nunca recriado.
 */
export async function cabecalhoSessao(): Promise<Record<string, string>> {
  const cookie = await clienteAutenticacao.getCookie();
  return cookie ? { Cookie: cookie } : {};
}
