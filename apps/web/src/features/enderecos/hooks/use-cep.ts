"use client";

import { enderecoDoCepSchema, type EnderecoDoCep } from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

/**
 * Preenchimento por CEP. O servidor consulta o provedor (ViaCEP, com BrasilAPI de reserva) — o
 * navegador nunca fala com ele direto, e o resultado é só SUGESTÃO de texto: CEP não confirma ponto
 * geográfico, que continua sendo a confirmação explícita no mapa.
 */
export type SituacaoCep = "ocioso" | "consultando" | "preenchido" | "nao-encontrado" | "indisponivel";

export const MENSAGEM_CEP: Record<SituacaoCep, string | null> = {
  ocioso: null,
  consultando: "Buscando endereço pelo CEP…",
  preenchido: "Endereço preenchido pelo CEP. Confira e complete o número.",
  "nao-encontrado": "CEP não encontrado. Confira o número ou preencha o endereço manualmente.",
  indisponivel: "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
};

type RequisitarCep = (digitos: string) => Promise<ResultadoApi<EnderecoDoCep>>;

const requisitarCepNaApi: RequisitarCep = (digitos) => requisitarApi(`/enderecos/cep/${digitos}`, enderecoDoCepSchema, {});

/**
 * Regra do hook, sem React (testável): só CEP com 8 dígitos consulta; o mesmo CEP não é consultado
 * de novo depois de RESPONDIDO (digitar, sair do campo, colar); falha de rede/provedor não "gasta"
 * o CEP — a próxima digitação ou saída do campo tenta outra vez, sem F5.
 */
export function criarConsultorCep({
  requisitar = requisitarCepNaApi,
  aoPreencher,
  aoMudarSituacao,
}: {
  requisitar?: RequisitarCep;
  aoPreencher: (endereco: EnderecoDoCep) => void;
  aoMudarSituacao: (situacao: SituacaoCep) => void;
}) {
  let ultimoConsultado: string | null = null;

  return async function consultar(cepDigitado: string) {
    const digitos = cepDigitado.replace(/\D/g, "");
    if (digitos.length !== 8) {
      aoMudarSituacao("ocioso");
      return;
    }
    if (ultimoConsultado === digitos) return;
    ultimoConsultado = digitos;

    aoMudarSituacao("consultando");
    const resultado = await requisitar(digitos);
    if (resultado.ok) {
      aoPreencher(resultado.dados);
      aoMudarSituacao("preenchido");
      return;
    }
    // Provedor fora do ar não "gasta" o CEP: digitar ou sair do campo de novo tenta outra vez.
    if (resultado.codigo !== "CEP_NAO_ENCONTRADO") ultimoConsultado = null;
    aoMudarSituacao(resultado.codigo === "CEP_NAO_ENCONTRADO" ? "nao-encontrado" : "indisponivel");
  };
}

export function useCep(aoPreencher: (endereco: EnderecoDoCep) => void) {
  const [situacao, setSituacao] = useState<SituacaoCep>("ocioso");
  const aoPreencherRef = useRef(aoPreencher);
  useEffect(() => {
    aoPreencherRef.current = aoPreencher;
  }, [aoPreencher]);

  // Um consultor por formulário montado (criado no primeiro uso): guarda o último CEP consultado.
  const consultorRef = useRef<ReturnType<typeof criarConsultorCep> | null>(null);
  const consultar = useCallback((cepDigitado: string) => {
    consultorRef.current ??= criarConsultorCep({ aoPreencher: (endereco) => aoPreencherRef.current(endereco), aoMudarSituacao: setSituacao });
    return consultorRef.current(cepDigitado);
  }, []);

  return { situacao, consultar };
}
