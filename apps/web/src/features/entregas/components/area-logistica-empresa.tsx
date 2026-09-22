"use client";

import { useState } from "react";
import { AreaSaidasEmpresa } from "./area-saidas-empresa";
import { AreaZonasEmpresa } from "./area-zonas-empresa";
import { PainelOperacionalEmpresa } from "./painel-operacional";
import { QuadroEntregadores } from "./quadro-entregadores";

const ABAS = [
  { id: "operacao", rotulo: "Operação" },
  { id: "entregadores", rotulo: "Entregadores" },
  { id: "zonas", rotulo: "Zonas e automação" },
] as const;

type AbaLogistica = (typeof ABAS)[number]["id"];

export function AreaLogisticaEmpresa({ empresaId, nomeEmpresa }: { empresaId: string; nomeEmpresa: string }) {
  const [aba, setAba] = useState<AbaLogistica>("operacao");

  return (
    <section aria-label="Logística da empresa" className="flex flex-col gap-4">
      <div role="tablist" aria-label="Áreas da logística" className="flex overflow-x-auto border-b border-borda">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`aba-logistica-${item.id}`}
            aria-selected={aba === item.id}
            aria-controls={`painel-logistica-${item.id}`}
            onClick={() => setAba(item.id)}
            className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${aba === item.id ? "border-marca text-marca" : "border-transparent text-conteudo-suave"}`}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`painel-logistica-${aba}`} aria-labelledby={`aba-logistica-${aba}`}>
        {aba === "operacao" && <AreaSaidasEmpresa empresaId={empresaId} nomeEmpresa={nomeEmpresa} />}
        {aba === "entregadores" && (
          <div className="flex flex-col gap-6">
            <QuadroEntregadores empresaId={empresaId} nomeEmpresa={nomeEmpresa} />
            <PainelOperacionalEmpresa empresaId={empresaId} nomeEmpresa={nomeEmpresa} />
          </div>
        )}
        {aba === "zonas" && <AreaZonasEmpresa empresaId={empresaId} nomeEmpresa={nomeEmpresa} />}
      </div>
    </section>
  );
}
