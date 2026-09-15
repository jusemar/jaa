import { createAuthClient } from "better-auth/client";
import { phoneNumberClient } from "better-auth/client/plugins";
import { URL_API } from "@/lib/configuracao";

// Cliente oficial do Better Auth apontando para a API do Jaa.
// A sessão fica em cookie HttpOnly emitido pela API; o web nunca lê nem guarda o token.
export const clienteAutenticacao = createAuthClient({
  baseURL: URL_API,
  basePath: "/api/auth",
  plugins: [phoneNumberClient()],
});
