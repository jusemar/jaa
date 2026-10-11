/*
 * Variáveis PÚBLICAS que o build de PRODUÇÃO da Web precisa ter. `NEXT_PUBLIC_*` é embutida no
 * JavaScript na hora do build: sem ela o site é publicado "funcionando", mas com o valor de
 * desenvolvimento — foi assim que produção ficou sem os mapas do Mapbox (token ausente no build) enquanto
 * o localhost, com o `.env.local`, mostrava tudo. Os VALORES ficam na hospedagem, nunca no Git.
 */
export type VariaveisDeBuild = Record<string, string | undefined>;

function urlHttpsPublica(valor: string): boolean {
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

/** Lista o que falta (só NOMES e motivos; nunca valores). Vazia = pronto para produção. */
export function problemasDoAmbienteDeProducao(variaveis: VariaveisDeBuild): string[] {
  const problemas: string[] = [];
  const api = variaveis.NEXT_PUBLIC_API_URL?.trim() ?? "";
  const mapbox = variaveis.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";

  if (!urlHttpsPublica(api)) {
    problemas.push("NEXT_PUBLIC_API_URL: informe o endereço HTTPS público da API (sem ela o site chamaria http://localhost:3333).");
  }
  // Só token PÚBLICO (pk.): o secreto (sk.) ficaria exposto no JavaScript do navegador.
  if (!mapbox.startsWith("pk.")) {
    problemas.push("NEXT_PUBLIC_MAPBOX_TOKEN: informe o token público (pk.) do Mapbox (sem ele os mapas de rota e de entrega não aparecem).");
  }
  return problemas;
}

/** Recusa o build de produção incompleto; a publicação anterior continua no ar. */
export function exigirAmbienteDeProducao(variaveis: VariaveisDeBuild): void {
  // VERCEL_ENV é definida pela hospedagem: "production" só no build que vai para o domínio oficial.
  if (variaveis.VERCEL_ENV !== "production") return;
  const problemas = problemasDoAmbienteDeProducao(variaveis);
  if (problemas.length > 0) {
    throw new Error(`Build de produção recusado — variáveis de ambiente ausentes ou inválidas (veja apps/web/.env.example):\n- ${problemas.join("\n- ")}`);
  }
}
