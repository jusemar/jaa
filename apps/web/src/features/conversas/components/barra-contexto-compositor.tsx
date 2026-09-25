// Interface TÉCNICA: contexto da próxima ação do compositor (ex.: edição), acima do campo. X cancela.

export function BarraContextoCompositor({
  titulo,
  texto,
  aoCancelar,
  rotuloCancelar,
}: {
  titulo: string;
  texto: string;
  aoCancelar: () => void;
  rotuloCancelar: string;
}) {
  return (
    <div
      aria-label={titulo}
      className="flex items-start gap-2 rounded-jaa border border-borda bg-superficie p-1.5 shadow-suave"
    >
      <div className="min-w-0 flex-1 rounded border-l-4 border-ouro/60 bg-marca/5 px-2 py-1">
        <p className="text-xs font-semibold text-aviso">{titulo}</p>
        <p className="line-clamp-2 whitespace-pre-wrap text-xs text-conteudo-suave [overflow-wrap:anywhere]">
          {texto}
        </p>
      </div>
      <button
        type="button"
        aria-label={rotuloCancelar}
        title={rotuloCancelar}
        onClick={aoCancelar}
        className="shrink-0 rounded px-2 py-1 text-sm text-conteudo-suave hover:bg-borda hover:text-conteudo"
      >
        ✕
      </button>
    </div>
  );
}
