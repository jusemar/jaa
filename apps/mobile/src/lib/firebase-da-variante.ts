import { IDENTIDADE_DA_VARIANTE, type Variante } from "./variante.ts";

/*
 * QUAL `google-services.json` (Firebase/FCM, para o push) entra no binário de cada variante. Módulo PURO,
 * lido pelo `app.config.ts`. O arquivo é CONFIGURAÇÃO do app (vai no APK), não segredo — o segredo é a
 * chave da conta de serviço do FCM, que fica só no EAS e nunca é lida por aqui.
 *
 * - `GOOGLE_SERVICES_JSON`: caminho dado pelo EAS (variável de ambiente do tipo arquivo) — vale para as
 *   duas variantes, desde que o arquivo seja do pacote certo;
 * - development, sem a variável: o arquivo local da raiz do repositório (fora do Git), se existir;
 * - production NUNCA usa o arquivo local (ele é do app de desenvolvimento).
 *
 * Arquivo de outro pacote é ERRO de build: o app de produção jamais sobe com o Firebase do Dev.
 * Sem arquivo, o build segue válido — só não haverá token de push (o app avisa e segue sem push).
 */
export function escolherGoogleServices({
  variante,
  caminhoDoEas,
  caminhoLocal,
  pacotesDoArquivo,
}: {
  variante: Variante;
  caminhoDoEas: string | undefined;
  caminhoLocal: string;
  // Pacotes Android declarados no arquivo (null = arquivo inexistente).
  pacotesDoArquivo: (caminho: string) => readonly string[] | null;
}): string | null {
  const candidato = caminhoDoEas ? caminhoDoEas : variante === "development" ? caminhoLocal : null;
  if (!candidato) return null;
  const pacotes = pacotesDoArquivo(candidato);
  if (pacotes === null) {
    if (candidato === caminhoDoEas) throw new Error(`GOOGLE_SERVICES_JSON aponta para um arquivo que não existe (${candidato}).`);
    return null;
  }
  const pacote = IDENTIDADE_DA_VARIANTE[variante].pacote;
  if (!pacotes.includes(pacote)) {
    throw new Error(`O google-services.json (${candidato}) não é do app ${pacote} (contém: ${pacotes.join(", ") || "nenhum"}). Use o arquivo do Firebase deste app.`);
  }
  return candidato;
}

/** Pacotes Android de um google-services.json já lido (formato do Firebase: client[].client_info.android_client_info). */
export function pacotesDoGoogleServices(conteudo: unknown): string[] {
  if (typeof conteudo !== "object" || conteudo === null || !("client" in conteudo) || !Array.isArray(conteudo.client)) return [];
  return conteudo.client.flatMap((cliente: unknown) => {
    if (typeof cliente !== "object" || cliente === null || !("client_info" in cliente)) return [];
    const info: unknown = cliente.client_info;
    if (typeof info !== "object" || info === null || !("android_client_info" in info)) return [];
    const android: unknown = info.android_client_info;
    return typeof android === "object" && android !== null && "package_name" in android && typeof android.package_name === "string" ? [android.package_name] : [];
  });
}
