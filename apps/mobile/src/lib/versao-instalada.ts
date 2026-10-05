import Constants from "expo-constants";
import type { VersaoInstalada } from "./rotulo-versao";
import { varianteDeclarada, varianteDoPacote } from "./variante";

/*
 * O que está INSTALADO no aparelho. `expo-application` e `expo-updates` são módulos nativos carregados
 * SOB DEMANDA e com proteção (mesmo cuidado do expo-audio): um Development Build gerado antes deles
 * não tem o código nativo, e importar no topo derrubaria o app inteiro. Sem os módulos, sobra o que a
 * configuração do JavaScript em execução declara.
 */
function carregar<Modulo>(importar: () => Modulo): Modulo | null {
  try {
    return importar();
  } catch {
    return null;
  }
}

export function lerVersaoInstalada(): VersaoInstalada {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const aplicacao = carregar(() => require("expo-application") as typeof import("expo-application"));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const updates = carregar(() => require("expo-updates") as typeof import("expo-updates"));
  // Dentro do Development Client o expo-updates fica desligado: a data não significa nada.
  const comUpdates = updates?.isEnabled ? updates : null;

  return {
    versao: aplicacao?.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
    build: aplicacao?.nativeBuildVersion ?? null,
    // O pacote instalado é a verdade do binário; a configuração é o que resta num build sem o módulo.
    variante: varianteDoPacote(aplicacao?.applicationId) ?? varianteDeclarada(Constants.expoConfig?.extra?.variante) ?? "development",
    atualizadoEm: comUpdates && !comUpdates.isEmbeddedLaunch ? comUpdates.createdAt : null,
  };
}
