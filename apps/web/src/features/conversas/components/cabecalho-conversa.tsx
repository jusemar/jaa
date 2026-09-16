import type { ParticipanteConversa } from "@jaa/contratos";
import type { ReactNode } from "react";

// Interface TÉCNICA: cabeçalho da conversa aberta. Só dados da pessoa e atividade atual;
// prévia e horário da última mensagem pertencem à lista de conversas, não a este cabeçalho.

export function CabecalhoConversa({
  outraIdentidade,
  presenca,
  digitando,
  acoes,
}: {
  outraIdentidade: ParticipanteConversa;
  presenca: "online" | "offline" | null;
  digitando: boolean;
  acoes?: ReactNode;
}) {
  const atividade = digitando ? "digitando..." : presenca === "online" ? "Online" : presenca === "offline" ? "Offline" : "";

  return (
    <header aria-label="Cabeçalho da conversa" className="flex flex-col border-b border-zinc-200 pb-2">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">
          {outraIdentidade.nomeExibicao}
          {outraIdentidade.tipo === "empresarial" && (
            <span data-tipo-participante="empresarial" className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 align-middle text-xs font-normal text-zinc-600">
              Empresa
            </span>
          )}
        </h2>
        {acoes}
      </div>
      <p className="text-sm text-zinc-500">@{outraIdentidade.nomeUsuario}</p>
      <p
        data-atividade={digitando ? "digitando" : (presenca ?? "desconhecida")}
        aria-live="polite"
        className={`min-h-5 text-sm ${digitando || presenca === "online" ? "text-emerald-700" : "text-zinc-500"}`}
      >
        {atividade}
      </p>
    </header>
  );
}
