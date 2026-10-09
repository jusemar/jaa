import * as SecureStore from "expo-secure-store";
import { criarCofre, type ArmazenamentoSeguro } from "./cofre-dispositivo";

/*
 * O armazenamento SEGURO do aparelho (Keystore/Keychain, via expo-secure-store) e o cofre das
 * credenciais de PIN e biometria, separadas por conta (`cofre-dispositivo.ts`).
 *
 * `protegido`: o valor é cifrado por uma chave do Android Keystore que só funciona depois de o aviso de
 * biometria do SISTEMA (biometria forte) aceitar a pessoa — é o que guarda o segredo da biometria.
 */

// Texto do aviso do sistema ao ler/gravar um valor protegido.
const AVISO_DO_SISTEMA = "Entrar no Jaaa";
const protegido = { requireAuthentication: true, authenticationPrompt: AVISO_DO_SISTEMA } as const;

export const armazenamentoSeguro: ArmazenamentoSeguro = {
  podeUsarBiometria: () => SecureStore.canUseBiometricAuthentication(),
  ler: (chave, exigeBiometria) => SecureStore.getItemAsync(chave, exigeBiometria ? protegido : {}),
  gravar: (chave, valor, exigeBiometria) => SecureStore.setItemAsync(chave, valor, exigeBiometria ? protegido : {}),
  async apagar(chave) {
    // O valor protegido vive sob outra chave do Keystore: apaga as duas formas.
    await SecureStore.deleteItemAsync(chave, protegido).catch(() => undefined);
    await SecureStore.deleteItemAsync(chave).catch(() => undefined);
  },
};

export const cofre = criarCofre(armazenamentoSeguro);
