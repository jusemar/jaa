
import { enderecoTemLocalizacaoConfirmada, type EnderecoCliente } from "@jaa/contratos";
import { useCallback, useRef, useState } from "react";
import { validarCoberturaEntrega } from "@/features/enderecos/lib/api-enderecos";
import { freteDaCobertura, type FreteEntrega } from "../lib/frete-entrega";

/**
 * Taxa de entrega do endereço ESCOLHIDO, perguntada ao servidor a cada seleção ou troca (mesma
 * cobertura usada na escolha do endereço, agora com o frete da zona). Só a última consulta vale:
 * trocar de endereço rápido nunca deixa a taxa de um endereço aparecer no outro.
 */
export function useFreteEntrega(empresaIdentidadeId: string) {
  const [frete, setFrete] = useState<FreteEntrega>({ estado: "sem-endereco" });
  const ultimaConsulta = useRef(0);

  const consultar = useCallback(
    async (endereco: EnderecoCliente | null) => {
      const consulta = ++ultimaConsulta.current;
      if (!endereco || !enderecoTemLocalizacaoConfirmada(endereco)) {
        setFrete({ estado: "sem-endereco" });
        return;
      }
      setFrete({ estado: "consultando" });
      const resultado = await validarCoberturaEntrega(empresaIdentidadeId, {
        latitude: endereco.latitude as number,
        longitude: endereco.longitude as number,
      });
      if (consulta === ultimaConsulta.current) setFrete(freteDaCobertura(resultado));
    },
    [empresaIdentidadeId],
  );

  return { frete, consultar };
}
