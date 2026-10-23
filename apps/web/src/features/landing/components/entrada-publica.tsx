"use client";

import dynamic from "next/dynamic";
import { createContext, useEffect, useState, type ReactNode } from "react";
import { buscarContaAtual } from "@/features/autenticacao/lib/api-conta";
import type { DestinoDoLink } from "@/features/link/lib/link-do-jaa";

// O aplicativo operacional só é carregado quando há sessão. A landing já vem no HTML do servidor.
const Fluxo = dynamic<{
  iniciarCadastro?: boolean;
  aoSairParaPaginaPublica?: () => void;
  destino?: DestinoDoLink | undefined;
}>(
  () =>
    import("@/features/autenticacao/components/fluxo-autenticacao").then(
      (m) => m.FluxoAutenticacao,
    ),
  {
    loading: () => (
      <p role="status" className="p-8 text-center">
        Abrindo seu Jaaa…
      </p>
    ),
  },
);
const Realtime = dynamic(() =>
  import("@/components/indicador-realtime").then((m) => m.IndicadorRealtime),
);

/*
 * ENTRADA DE VISITANTE PELA HOME: quem escolhe na landing com quem conversar recebe o MESMO caminho do
 * Link do Jaa (`/@usuario`) — FluxoAutenticacao com aquele destino, sessão de visitante reaproveitada ou
 * aberta, e o AppJaa já na conversa. Sem nova página, sem login no meio. Fora da Home (sem provedor),
 * quem escolhe vai para o próprio Link do Jaa.
 */
export const ComecarConversaNaHome = createContext<((destino: DestinoDoLink) => void) | null>(null);

export function EntradaPublica({ children }: { children: ReactNode }) {
  const [temSessao, setTemSessao] = useState(false);
  const [destino, setDestino] = useState<DestinoDoLink | null>(null);
  useEffect(() => {
    let ativo = true;
    void buscarContaAtual().then((resultado) => {
      if (ativo && resultado.ok) setTemSessao(true);
    });
    return () => {
      ativo = false;
    };
  }, []);
  if (temSessao || destino) {
    return (
      // `data-entrando-no-jaa`: a landing dá lugar ao app com um esmaecer curto (desligado com movimento reduzido).
      <div data-entrando-no-jaa={destino ? true : undefined} className={destino ? "lp-entrar-no-jaa" : undefined}>
        <Realtime />
        <Fluxo
          {...(destino ? { destino } : {})}
          aoSairParaPaginaPublica={() => {
            setDestino(null);
            setTemSessao(false);
          }}
        />
      </div>
    );
  }
  return <ComecarConversaNaHome.Provider value={setDestino}>{children}</ComecarConversaNaHome.Provider>;
}
