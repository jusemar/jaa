import type { IdentidadeOperavel } from "@jaa/contratos";

// Interface TÉCNICA: "Agindo como". Separa visualmente a identidade pessoal das empresariais.
// A escolha é intenção de interface; o servidor autoriza cada ação. Não é o design final.

export function SeletorIdentidade({
  operaveis,
  ativa,
  erro,
  aoSelecionar,
}: {
  operaveis: IdentidadeOperavel[];
  ativa: IdentidadeOperavel | null;
  erro: string | null;
  aoSelecionar: (identidadeId: string) => void;
}) {
  const pessoais = operaveis.filter((identidade) => identidade.tipo === "pessoal");
  const empresariais = operaveis.filter((identidade) => identidade.tipo === "empresarial");

  return (
    <section aria-label="Identidade ativa" className="flex flex-col gap-1.5 rounded border border-zinc-200 p-3 text-sm">
      <label className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Agindo como:</span>
        <select
          name="identidadeAtiva"
          value={ativa?.identidadeId ?? ""}
          onChange={(evento) => aoSelecionar(evento.target.value)}
          className="min-w-0 rounded border border-zinc-300 px-2 py-1"
        >
          <optgroup label="Pessoa">
            {pessoais.map((identidade) => (
              <option key={identidade.identidadeId} value={identidade.identidadeId}>
                {identidade.nomeExibicao} (@{identidade.nomeUsuario})
              </option>
            ))}
          </optgroup>
          {empresariais.length > 0 && (
            <optgroup label="Empresas">
              {empresariais.map((identidade) => (
                <option key={identidade.identidadeId} value={identidade.identidadeId}>
                  {identidade.nomeExibicao} (@{identidade.nomeUsuario})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {ativa && (
          <span data-tipo-identidade-ativa={ativa.tipo} className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
            {ativa.tipo === "pessoal" ? "Pessoa" : "Empresa"}
          </span>
        )}
      </label>
      {ativa?.tipo === "empresarial" && (
        <p role="note" className="text-xs text-amber-700">
          Mensageiro da empresa: conversas e respostas saem como {ativa.nomeExibicao}. Suas conversas pessoais não aparecem aqui.
        </p>
      )}
      {erro && (
        <p role="alert" className="text-xs text-red-600">
          {erro}
        </p>
      )}
    </section>
  );
}
