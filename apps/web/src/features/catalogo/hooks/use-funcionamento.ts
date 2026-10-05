"use client";

import type { FuncionamentoPublico } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { obterFuncionamento } from "../lib/api-catalogo";

/*
 * ABERTA OU FECHADA, como o SERVIDOR diz. O navegador não compara horário nenhum: ele só pergunta de
 * novo de tempos em tempos (e quando a aba volta a ficar à vista), para a tela não continuar dizendo
 * "aberto" depois que a empresa fechou. Quem decide de verdade é a criação do pedido, no servidor.
 */
const INTERVALO_MS = 60_000;

export function useFuncionamento(identidadeEmpresaId: string | null): { funcionamento: FuncionamentoPublico | null; atualizar: () => void } {
  const [lido, setLido] = useState<{ identidadeId: string; funcionamento: FuncionamentoPublico } | null>(null);

  const atualizar = useCallback(() => {
    if (!identidadeEmpresaId) return;
    void obterFuncionamento(identidadeEmpresaId).then((resultado) => {
      // Falha de rede não apaga o último estado conhecido.
      if (resultado.ok) setLido({ identidadeId: identidadeEmpresaId, funcionamento: resultado.dados });
    });
  }, [identidadeEmpresaId]);

  useEffect(() => {
    if (!identidadeEmpresaId) return;
    atualizar();
    const relogio = window.setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [identidadeEmpresaId, atualizar]);

  // O estado de outra empresa nunca é mostrado como se fosse desta.
  return { funcionamento: lido && lido.identidadeId === identidadeEmpresaId ? lido.funcionamento : null, atualizar };
}
