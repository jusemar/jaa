import Constants from "expo-constants";
import { origemDoSite } from "./link-publico";

// Lido uma vez: o endereço do site não muda com o app aberto. A regra (pura) está em `link-publico`.
export const ORIGEM_DO_SITE = origemDoSite({
  configurada: process.env.EXPO_PUBLIC_JAA_SITE_URL,
  emDesenvolvimento: __DEV__,
  hostDoBundler: Constants.expoConfig?.hostUri?.split(":")[0] ?? null,
});
