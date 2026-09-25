import { textoDaPrevia } from "../lib/respostas";

/*
 * Referência compacta à mensagem respondida (autor + trecho), usada dentro do balão e acima do
 * compositor. A prévia é limitada a duas linhas e nunca alarga o layout.
 *
 * Dentro de um balão PRÓPRIO (fundo jade) as cores se invertem: usar o jade da marca sobre o jade do
 * balão deixaria a citação ilegível, então ali ela vira um bloco translúcido claro.
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
          ? "border-marca-conteudo/70 bg-marca-conteudo/15"
          : "border-marca bg-marca/[0.07]"
      }`}
    >
      <p
        data-autor-referencia
        className={`truncate text-xs font-semibold ${emBalaoProprio ? "text-marca-conteudo" : "text-marca"}`}
      >
        {nomeAutor}
      </p>
      <p
        data-previa-referencia
        data-excluida={excluida || undefined}
        className={`line-clamp-2 whitespace-pre-wrap text-xs [overflow-wrap:anywhere] ${emBalaoProprio ? "text-marca-conteudo/85" : "text-conteudo-suave"} ${excluida ? "italic" : ""}`}
      >
        {excluida
          ? "Mensagem excluída"
          : textoDaPrevia({ previaConteudo, conteudoTruncado })}
      </p>
    </div>
  );
}
