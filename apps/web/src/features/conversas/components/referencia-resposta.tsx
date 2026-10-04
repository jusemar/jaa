import { textoDaPrevia } from "../lib/respostas";

/*
 * Referência compacta à mensagem respondida (autor + trecho), usada dentro do balão e acima do
 * compositor. A prévia é limitada a duas linhas e nunca alarga o layout.
 *
 * O texto citado é sempre ESCURO e legível, no balão próprio (verde claro) e no recebido (branco): o
 * bloco só se diferencia do balão por um fundo levemente mais escuro e pela barra lateral da marca.
 * O nome de quem foi citado mantém o destaque da marca.
 */
export function ReferenciaResposta({
  nomeAutor,
  previaConteudo,
  conteudoTruncado,
  excluida = false,
  emBalaoProprio = false,
}: {
  nomeAutor: string;
  previaConteudo: string;
  conteudoTruncado: boolean;
  excluida?: boolean;
  emBalaoProprio?: boolean;
}) {
  return (
    <div
      data-referencia-resposta
      className={`min-w-0 rounded-[0.2rem] border-l-2 px-2 py-1 text-left ${
        emBalaoProprio
          ? "border-marca bg-mensagem-enviada-conteudo/[0.08]"
          : "border-marca bg-marca/[0.07]"
      }`}
    >
      <p
        data-autor-referencia
        className="truncate text-xs font-semibold text-marca"
      >
        {nomeAutor}
      </p>
      <p
        data-previa-referencia
        data-excluida={excluida || undefined}
        className={`line-clamp-2 whitespace-pre-wrap text-xs [overflow-wrap:anywhere] ${emBalaoProprio ? "text-mensagem-enviada-conteudo/80" : "text-conteudo-suave"} ${excluida ? "italic" : ""}`}
      >
        {excluida
          ? "Mensagem excluída"
          : textoDaPrevia({ previaConteudo, conteudoTruncado })}
      </p>
    </div>
  );
}
