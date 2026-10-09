import { biometriaAtivadaSchema } from "@jaa/contratos";
import { Platform } from "react-native";
import { armazenamentoSeguro, cofre } from "./armazenamento-seguro";
import { criarBiometria } from "./biometria";
import { clienteAutenticacao } from "./cliente-autenticacao";
import { lerCredencialDoDispositivo } from "./pin-dispositivo";

/*
 * BIOMETRIA DO APARELHO — a ligação com o Android e com a API (as regras estão em `biometria.ts`).
 *
 * Quem protege o segredo é o próprio expo-secure-store com `requireAuthentication`
 * (`armazenamento-seguro.ts`): o valor é cifrado
 * por uma chave do Android Keystore que só funciona depois de o aviso de biometria do SISTEMA
 * (BiometricPrompt, biometria forte) aceitar a pessoa. Por isso não há expo-local-authentication aqui:
 * uma checagem "sim/não" na frente de um valor aberto não protegeria nada.
 */

async function chamar(caminho: string, corpo: Record<string, string>) {
  return clienteAutenticacao.$fetch<unknown>(caminho, { method: "POST", body: corpo, timeout: 15_000 });
}

const semResposta = (erro: unknown) => typeof erro !== "object" || erro === null || !(erro as { status?: unknown }).status;

export const biometria = criarBiometria({
  android: Platform.OS === "android",
  lerCredencial: lerCredencialDoDispositivo,
  // Segredo e marcas são sempre os da conta ATIVA neste aparelho.
  chaves: () => cofre.chavesAtivas(),
  armazenamento: armazenamentoSeguro,
  servidor: {
    async ativar(credencial) {
      try {
        const { data, error } = await chamar("/pin/biometria/ativar", { credencial });
        if (error) return { ok: false, semConexao: semResposta(error) };
        const ativada = biometriaAtivadaSchema.safeParse(data);
        return ativada.success ? { ok: true, segredo: ativada.data.segredo } : { ok: false, semConexao: false };
      } catch {
        return { ok: false, semConexao: true };
      }
    },
    async entrar(credencial, segredo) {
      try {
        const { error } = await chamar("/pin/biometria/entrar", { credencial, segredo });
        if (!error) return "ok";
        return semResposta(error) ? "sem-conexao" : "recusada";
      } catch {
        return "sem-conexao";
      }
    },
    async desativar(credencial) {
      await chamar("/pin/biometria/desativar", { credencial });
    },
  },
});
