import type { Variante } from "./variante";

/*
 * Texto da seção "Sobre" (Perfil): o suficiente para sabermos o que está instalado no aparelho de um
 * testador, sem despejar detalhe técnico em quem só usa o app. Em produção aparece só a primeira linha
 * (e a autoria). A variante continua sendo lida do binário — só não é escrita na tela.
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

// Autoria do aplicativo, exibida junto da versão. Texto fixo: permanece nas próximas versões.
export const AUTORIA_DO_APP = "Desenvolvido por: @Junior";

export function rotuloVersao(instalada: VersaoInstalada, formatarData: (data: Date) => string): { principal: string; detalhe: string | null } {
  const principal = [`Jaaa ${instalada.versao ?? "—"}`, instalada.build ? `Build ${instalada.build}` : null].filter(Boolean).join(" · ");
  if (instalada.variante === "production") return { principal, detalhe: null };
  // A data do update é como conferimos, no aparelho do testador, se a publicação chegou.
  // O nome do ambiente não é mostrado a quem usa (o app de desenvolvimento já se chama "Jaa Dev").
  return { principal, detalhe: instalada.atualizadoEm ? `Atualizado em ${formatarData(instalada.atualizadoEm)}` : null };
}
