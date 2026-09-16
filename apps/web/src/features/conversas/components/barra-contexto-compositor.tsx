// Interface TÉCNICA: contexto da próxima ação do compositor (ex.: edição), acima do campo. X cancela.

export function BarraContextoCompositor({ titulo, texto, aoCancelar, rotuloCancelar }: { titulo: string; texto: string; aoCancelar: () => void; rotuloCancelar: string }) {
  return (
    <div aria-label={titulo} className="flex items-start gap-2 rounded-lg bg-zinc-50 p-1.5">
      <div className="min-w-0 flex-1 rounded border-l-4 border-amber-500 bg-black/5 px-2 py-1">
        <p className="text-xs font-semibold text-amber-800">{titulo}</p>
        <p className="line-clamp-2 whitespace-pre-wrap text-xs text-zinc-600 [overflow-wrap:anywhere]">{texto}</p>
      </div>
      <button
        type="button"
        aria-label={rotuloCancelar}
        title={rotuloCancelar}
        onClick={aoCancelar}
        className="shrink-0 rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
      >
        ✕
      </button>
    </div>
  );
}
