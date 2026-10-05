import Constants from "expo-constants";
import { validarUrlApi, varianteDeclarada } from "./variante";

/**
 * Endereço da API do Jaa. Valor PÚBLICO (nunca contém segredo), vindo de `EXPO_PUBLIC_JAA_API_URL`.
 *
 * DESENVOLVIMENTO LOCAL (Development Client servido pelo Metro, `__DEV__`): em aparelho FÍSICO,
 * `localhost` é o próprio celular — não o computador. Por isso:
 * - defina a variável com o endereço do computador (ex.: http://127.0.0.1:3333 com adb reverse);
 * - sem ela, o app usa o host de onde o bundler está servindo (funciona no emulador e, na mesma rede,
 *   também no aparelho), caindo para localhost só no último caso.
 *
 * APP DISTRIBUÍDO (APK Development para testadores e produção): não existe bundler nem computador. A
 * variável vem do ambiente do EAS e é embutida no JavaScript no build e em cada update; precisa ser
 * HTTPS pública e estável. NÃO há fallback: um binário distribuído apontando para localhost abriria e
 * falharia em silêncio no aparelho de outra pessoa.
 */
const PORTA_API = 3333;

function hostDoBundler(): string | null {
  const alvo = Constants.expoConfig?.hostUri ?? null;
  const host = alvo?.split(":")[0];
  return host ? `http://${host}:${PORTA_API}` : null;
}

function resolverUrlApi(): string {
  const configurada = process.env.EXPO_PUBLIC_JAA_API_URL;
  if (__DEV__) return configurada ?? hostDoBundler() ?? `http://localhost:${PORTA_API}`;

  const variante = varianteDeclarada(Constants.expoConfig?.extra?.variante) ?? "production";
  const resultado = validarUrlApi(configurada, { variante, local: false });
  // Inalcançável pelos scripts de distribuição (eles validam antes de publicar). Falhar na abertura
  // faz o expo-updates descartar um update defeituoso e voltar ao anterior.
  if (!resultado.ok) throw new Error(`Jaa distribuído sem URL válida da API: ${resultado.motivo}`);
  return resultado.url;
}

export const URL_API = resolverUrlApi();
