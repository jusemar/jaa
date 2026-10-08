"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { buscarContaAtual } from "@/features/autenticacao/lib/api-conta";

// O aplicativo operacional só é carregado quando há sessão. A landing já vem no HTML do servidor.
const Fluxo = dynamic<{
  iniciarCadastro?: boolean;
  aoSairParaPaginaPublica?: () => void;
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

export function EntradaPublica({ children }: { children: ReactNode }) {
  const [temSessao, setTemSessao] = useState(false);
  useEffect(() => {
    let ativo = true;
    void buscarContaAtual().then((resultado) => {
      if (ativo && resultado.ok) setTemSessao(true);
    });
    return () => {
      ativo = false;
    };
  }, []);
  return temSessao ? (
    <>
      <Realtime />
      <Fluxo aoSairParaPaginaPublica={() => setTemSessao(false)} />
    </>
  ) : (
    children
  );
}
