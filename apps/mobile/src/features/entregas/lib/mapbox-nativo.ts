import { NativeModules } from "react-native";
import { TOKEN_PUBLICO_MAPBOX } from "./mapa-rota";

/*
 * Ligação com o SDK NATIVO do Mapbox (`@rnmapbox/maps`), carregado SOB DEMANDA e com proteção: um
 * Development Build anterior à inclusão do SDK não tem a parte nativa, e importar no topo derrubaria
 * a área de entregas inteira. Sem ela — ou sem o token público — o resto da tela continua funcionando
 * e o mapa explica o que falta.
 */
type ModuloMapbox = typeof import("@rnmapbox/maps");

let carregado: ModuloMapbox | null | undefined;

export type SituacaoDoMapa = "pronto" | "sem_sdk" | "sem_token";

export function obterMapbox(): ModuloMapbox | null {
  if (carregado !== undefined) return carregado;
  if (!TOKEN_PUBLICO_MAPBOX || (NativeModules as Record<string, unknown>).RNMBXModule == null) {
    carregado = null;
    return carregado;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const modulo = require("@rnmapbox/maps") as ModuloMapbox;
    void modulo.default.setAccessToken(TOKEN_PUBLICO_MAPBOX);
    // O Jaa não envia telemetria de uso do mapa.
    modulo.default.setTelemetryEnabled(false);
    carregado = modulo;
  } catch {
    carregado = null;
  }
  return carregado;
}

export function situacaoDoMapa(): SituacaoDoMapa {
  if (!TOKEN_PUBLICO_MAPBOX) return "sem_token";
  return obterMapbox() ? "pronto" : "sem_sdk";
}

/*
 * O token público pode ter RESTRIÇÃO POR URL no painel do Mapbox (feito para sites). O app não envia
 * endereço de origem, então o Mapbox recusa os blocos do mapa (403) e a tela ficaria em branco, sem
 * explicação. Uma conferência por sessão diz o que está acontecendo. Sem rede, não conclui nada.
 */
let conferencia: Promise<"aceito" | "recusado" | "indefinido"> | null = null;

export function conferirTokenDoMapa(): Promise<"aceito" | "recusado" | "indefinido"> {
  conferencia ??= fetch(`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8.json?secure&access_token=${encodeURIComponent(TOKEN_PUBLICO_MAPBOX)}`)
    .then((resposta) => (resposta.ok ? ("aceito" as const) : resposta.status === 401 || resposta.status === 403 ? ("recusado" as const) : ("indefinido" as const)))
    .catch(() => {
      // Sem rede agora: a próxima abertura do mapa confere de novo.
      conferencia = null;
      return "indefinido" as const;
    });
  return conferencia;
}

export const MENSAGEM_TOKEN_RECUSADO = "O mapa não pôde ser carregado: o token público do Mapbox configurado no app não está autorizado para uso em aplicativo (restrição por URL).";

export const MENSAGEM_MAPA_INDISPONIVEL: Record<Exclude<SituacaoDoMapa, "pronto">, string> = {
  sem_sdk: "Esta versão do app ainda não tem o mapa da rota. Instale a versão mais recente do Jaaa para vê-lo.",
  sem_token: "Mapa indisponível: falta configurar o token público do Mapbox no app.",
};
