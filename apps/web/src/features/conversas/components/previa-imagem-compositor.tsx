// Imagem escolhida, acima do campo: a prévia é LOCAL (object URL); o campo de texto vira a legenda.

export function PreviaImagemCompositor({ previaUrl, nomeArquivo, aoRemover }: { previaUrl: string; nomeArquivo: string; aoRemover: () => void }) {
  return (
    <div aria-label="Foto a enviar" data-previa-imagem className="flex items-center gap-2 rounded-jaa border border-borda bg-superficie p-1.5 shadow-suave">
      {/* <img> puro: é um object URL local, não há o que otimizar. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previaUrl} alt="Prévia da foto escolhida" className="h-16 w-16 shrink-0 rounded-jaa-compacto object-cover" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-marca">Foto</p>
        <p className="truncate text-xs text-conteudo-suave">{nomeArquivo}</p>
        <p className="text-[11px] text-conteudo-suave">Escreva uma legenda, se quiser, e envie.</p>
      </div>
      <button
        type="button"
        aria-label="Remover foto"
        title="Remover foto"
        onClick={aoRemover}
        className="shrink-0 rounded px-2 py-1 text-sm text-conteudo-suave hover:bg-borda hover:text-conteudo"
      >
        ✕
      </button>
    </div>
  );
}
