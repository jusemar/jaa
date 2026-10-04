import type { CoberturaEntrega } from "@jaa/contratos";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";

/**
 * TAXA DE ENTREGA prevista para o endereço escolhido, como o SERVIDOR informou (cobertura + frete
 * fixo da zona). O painel só exibe: não calcula frete nem o envia — na confirmação o servidor
 * resolve a zona de novo e o pedido criado traz os valores oficiais.
 */
export type FreteEntrega =
  | { estado: "sem-endereco" }
  | { estado: "consultando" }
  | { estado: "atendido"; freteCentavos: number }
  | { estado: "fora-da-area" }
  | { estado: "erro"; mensagem: string };

export function rotuloTaxaEntrega(frete: FreteEntrega): string {
  switch (frete.estado) {
    case "atendido":
      return frete.freteCentavos === 0 ? "Grátis" : formatarPrecoCentavos(frete.freteCentavos);
    case "consultando":
      return "Calculando…";
    case "sem-endereco":
      return "Escolha o endereço";
    default:
      return "Indisponível";
  }
}

/** Resposta da cobertura do servidor → estado exibido. Fora da área continua bloqueando o pedido. */
export function freteDaCobertura(resultado: { ok: true; dados: CoberturaEntrega } | { ok: false; mensagem: string }): FreteEntrega {
  if (!resultado.ok) return { estado: "erro", mensagem: resultado.mensagem };
  const { atendida, freteCentavos } = resultado.dados;
  return atendida && freteCentavos !== null ? { estado: "atendido", freteCentavos } : { estado: "fora-da-area" };
}
