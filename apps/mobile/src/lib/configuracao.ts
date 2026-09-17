import Constants from "expo-constants";

/**
 * Endereço da API do Jaa. Valor PÚBLICO (nunca contém segredo).
 *
 * Em aparelho FÍSICO, `localhost` é o próprio celular — não o computador. Por isso:
 * - defina `EXPO_PUBLIC_JAA_API_URL` com o IP do computador na rede local (ex.: http://192.168.0.10:3333);
 * - sem essa variável, o app usa o host de onde o bundler está servindo (funciona no emulador e, na
 *   mesma rede, também no aparelho), caindo para localhost só no último caso.
 */
const PORTA_API = 3333;

function hostDoBundler(): string | null {
  const alvo = Constants.expoConfig?.hostUri ?? null;
  const host = alvo?.split(":")[0];
  return host ? `http://${host}:${PORTA_API}` : null;
}

export const URL_API = process.env.EXPO_PUBLIC_JAA_API_URL ?? hostDoBundler() ?? `http://localhost:${PORTA_API}`;
