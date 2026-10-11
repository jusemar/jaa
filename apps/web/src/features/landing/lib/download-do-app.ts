/*
 * Download do aplicativo Android pela landing. Regra PURA (sem Next).
 *
 * O APK oficial fica no armazenamento público de arquivos do Jaaa (Cloudflare R2) e o navegador o
 * baixa DIRETO de lá: nenhum byte passa pela Web. O nome do arquivo salvo (`jaaa.apk`) não é decidido
 * aqui — um link para outro domínio ignora o atributo `download` —, e sim pelo armazenamento, que
 * entrega o objeto com esse nome (publicação em `apps/api/scripts/publicar-apk.ts`).
 */

/** Endereço oficial do APK (`NEXT_PUBLIC_APP_DOWNLOAD_URL`): só HTTPS completo; ausente ou inválido = sem download. */
export function urlOficialDoApk(valor: string | undefined): string | null {
  if (!valor) return null;
  try {
    return new URL(valor).protocol === "https:" ? valor : null;
  } catch {
    return null;
  }
}
