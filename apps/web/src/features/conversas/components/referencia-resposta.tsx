import { textoDaPrevia } from "../lib/respostas";

// Interface TÉCNICA: referência compacta à mensagem respondida (autor + trecho), usada dentro do
// balão e acima do compositor. A prévia é limitada a duas linhas e nunca alarga o layout.

export function ReferenciaResposta({
  nomeAutor,
  previaConteudo,
  conteudoTruncado,
  excluida = false,
}: {
  nomeAutor: string;
  previaConteudo: string;
  conteudoTruncado: boolean;
  excluida?: boolean;
}) {
  return (
    <div data-referencia-resposta className="min-w-0 rounded border-l-4 border-emerald-600 bg-black/5 px-2 py-1 text-left">
      <p data-autor-referencia className="truncate text-xs font-semibold text-emerald-800">
        {nomeAutor}
      </p>
      <p
        data-previa-referencia
        data-excluida={excluida || undefined}
        className={`line-clamp-2 whitespace-pre-wrap text-xs text-zinc-600 [overflow-wrap:anywhere] ${excluida ? "italic" : ""}`}
      >
        {excluida ? "Mensagem excluída" : textoDaPrevia({ previaConteudo, conteudoTruncado })}
      </p>
    </div>
  );
}
