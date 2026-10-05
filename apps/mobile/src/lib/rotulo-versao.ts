import type { Variante } from "./variante";

/*
 * Texto da seção "Sobre" (Perfil): o suficiente para sabermos o que está instalado no aparelho de um
 * testador, sem despejar detalhe técnico em quem só usa o app. Em produção aparece só a primeira linha.
 */
export type VersaoInstalada = {
  versao: string | null;
  /** versionCode do binário Android instalado. */
  build: string | null;
  /** Ambiente do BINÁRIO (não é `__DEV__`: o APK Development distribuído é release e é development). */
  variante: Variante;
  /** Quando o update OTA em execução foi publicado; null se o app roda o JS que veio no binário. */
  atualizadoEm: Date | null;
};

export function rotuloVersao(instalada: VersaoInstalada, formatarData: (data: Date) => string): { principal: string; detalhe: string | null } {
  const principal = [`Jaa ${instalada.versao ?? "—"}`, instalada.build ? `Build ${instalada.build}` : null].filter(Boolean).join(" · ");
  if (instalada.variante === "production") return { principal, detalhe: null };
  // A data do update é como conferimos, no aparelho do testador, se a publicação chegou.
  const detalhe = ["Development", instalada.atualizadoEm ? `atualizado em ${formatarData(instalada.atualizadoEm)}` : null].filter(Boolean).join(" · ");
  return { principal, detalhe };
}
