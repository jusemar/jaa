import type { Empresa } from "@jaa/contratos";

// Interface TÉCNICA: empresas que a conta pode operar. Não é o design final.

const ROTULO_PAPEL: Record<Empresa["papel"], string> = { proprietario: "Proprietário" };

export function ListaEmpresas({ empresas, aoAbrir }: { empresas: Empresa[]; aoAbrir: (empresa: Empresa) => void }) {
  if (empresas.length === 0) return <p className="text-sm text-zinc-500">Você ainda não tem empresas.</p>;

  return (
    <ol aria-label="Empresas" className="flex flex-col divide-y divide-zinc-200 rounded border border-zinc-200 text-sm">
      {empresas.map((empresa) => (
        <li key={empresa.id} data-empresa-id={empresa.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate font-medium">{empresa.nome}</span>
            <span className="block truncate text-zinc-500">@{empresa.nomeUsuario}</span>
            <span data-endereco-loja className="block truncate text-xs text-zinc-500">
              /loja/{empresa.slug}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800">{ROTULO_PAPEL[empresa.papel]}</span>
            <button type="button" onClick={() => aoAbrir(empresa)} className="rounded border px-2 py-1 text-xs">
              Abrir
            </button>
          </span>
        </li>
      ))}
    </ol>
  );
}
