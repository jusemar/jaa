import Constants from "expo-constants";
import { conferirVarianteDoBinario } from "./variante";

/*
 * Guarda Development × Production, executada na CARGA deste módulo — antes de qualquer tela, sessão ou
 * chamada à API. Se o JavaScript não for do ambiente do binário instalado, o app para aqui.
 *
 * Com o expo-updates isso é o que descarta um update publicado no canal errado: o erro acontece na
 * abertura, antes de o update ser dado como bom, e o aplicativo volta para o JavaScript anterior.
 *
 * `expo-application` é carregado sob proteção, como em `versao-instalada.ts`: um Development Build
 * antigo, sem o módulo nativo, não tem como informar o pacote e segue como sempre.
 */
function pacoteInstalado(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("expo-application") as typeof import("expo-application")).applicationId ?? null;
  } catch {
    return null;
  }
}

const resultado = conferirVarianteDoBinario(pacoteInstalado(), Constants.expoConfig?.extra?.variante);
if (!resultado.ok) throw new Error(`Jaaa bloqueado: ambiente incompatível. ${resultado.motivo}`);
