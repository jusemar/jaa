"use client";

import { enderecoDoCepSchema, type EnderecoDoCep } from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { requisitarApi } from "@/lib/api";

/**
 * Preenchimento por CEP. O servidor consulta o provedor (ViaCEP) — o navegador nunca fala com ele
 * direto, e o resultado é só SUGESTÃO de texto: CEP não confirma ponto geográfico, que continua
 * sendo a confirmação explícita no mapa.
 */
export type SituacaoCep = "ocioso" | "consultando" | "preenchido" | "nao-encontrado" | "indisponivel";

export const MENSAGEM_CEP: Record<SituacaoCep, string | null> = {
  ocioso: null,
  consultando: "Buscando endereço pelo CEP…",
  preenchido: "Endereço preenchido pelo CEP. Confira e complete o número.",
  "nao-encontrado": "CEP não encontrado. Confira o número ou preencha o endereço manualmente.",
  indisponivel: "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
};

export function useCep(aoPreencher: (endereco: EnderecoDoCep) => void) {
  const [situacao, setSituacao] = useState<SituacaoCep>("ocioso");
  // Evita repetir a consulta do mesmo CEP (digitar, sair do campo, colar de novo).
  const ultimoConsultado = useRef<string | null>(null);
  const aoPreencherRef = useRef(aoPreencher);
  useEffect(() => {
    aoPreencherRef.current = aoPreencher;
  }, [aoPreencher]);

  const consultar = useCallback(async (cepDigitado: string) => {
    const digitos = cepDigitado.replace(/\D/g, "");
    if (digitos.length !== 8) {
      setSituacao("ocioso");
      return;
    }
    if (ultimoConsultado.current === digitos) return;
    ultimoConsultado.current = digitos;

    setSituacao("consultando");
    const resultado = await requisitarApi(`/enderecos/cep/${digitos}`, enderecoDoCepSchema, {});
    if (resultado.ok) {
      aoPreencherRef.current(resultado.dados);
      setSituacao("preenchido");
      return;
    }
    setSituacao(resultado.codigo === "CEP_NAO_ENCONTRADO" ? "nao-encontrado" : "indisponivel");
  }, []);

  return { situacao, consultar };
}
