import { grupoDeEscolhaUnica, grupoObrigatorio, type GrupoOpcoesProduto } from "@jaa/contratos";

/**
 * A regra do grupo em palavras, a partir do mínimo e do máximo que a EMPRESA cadastrou — nenhum nome
 * de grupo é especial. Ex.: "Escolha única · Obrigatório", "Até 5 escolhas · Opcional".
 */
export function regraEmPalavras(grupo: Pick<GrupoOpcoesProduto, "minimoEscolhas" | "maximoEscolhas">): string {
  const obrigatoriedade = grupoObrigatorio(grupo) ? "Obrigatório" : "Opcional";
  if (grupoDeEscolhaUnica(grupo)) return `Escolha única · ${obrigatoriedade}`;
  if (grupo.minimoEscolhas === 0) return `Até ${grupo.maximoEscolhas} escolhas · Opcional`;
  if (grupo.minimoEscolhas === grupo.maximoEscolhas) return `Exatamente ${grupo.minimoEscolhas} escolhas · Obrigatório`;
  return `De ${grupo.minimoEscolhas} a ${grupo.maximoEscolhas} escolhas · Obrigatório`;
}
