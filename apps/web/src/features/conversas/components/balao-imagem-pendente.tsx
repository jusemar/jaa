import { espacoDaImagem } from "../lib/imagem-conversa";

/*
 * Foto EM ENVIO (ou que falhou), como balão próprio no fim da conversa: usa a prévia LOCAL enquanto a
 * API não respondeu. Não é uma mensagem — some quando a mensagem oficial chega (reconciliada pela
 * resposta do envio). Reenviar usa a MESMA tentativa (mesmo idCliente): nunca duplica.
 */
export function BalaoImagemPendente({
  previaUrl,
  legenda,
  situacao,
  aoReenviar,
  aoDescartar,
}: {
  previaUrl: string;
  legenda: string;
  situacao: "enviando" | "falhou";
  aoReenviar: () => void;
  aoDescartar: () => void;
}) {
  // Sem dimensões reais ainda (só o servidor as conhece depois de processar): área quadrada padrão.
  const espaco = espacoDaImagem(0, 0);
  return (
    <li data-imagem-pendente={situacao} className="flex items-end justify-end gap-1">
      <div className="flex min-w-0 max-w-[86%] flex-col gap-1 rounded-jaa bg-mensagem-enviada px-4 py-3 text-sm leading-[1.45] text-mensagem-enviada-conteudo shadow-balao sm:max-w-[min(72%,38rem)]">
        <span className="sr-only">Você: </span>
        <div style={{ width: espaco.largura, maxWidth: "100%" }} className="relative overflow-hidden rounded-jaa-compacto bg-conteudo/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previaUrl} alt="Foto em envio" className={`block max-h-[22.5rem] w-full object-cover ${situacao === "enviando" ? "opacity-70" : "opacity-50"}`} />
        </div>
        {legenda && <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{legenda}</span>}
        {situacao === "enviando" ? (
          <span role="status" className="self-end text-[10px] leading-none text-marca">
            Enviando…
          </span>
        ) : (
          <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <span role="alert" className="text-perigo">
              Não enviada
            </span>
            <button type="button" onClick={aoReenviar} className="rounded-full bg-marca px-3 py-1 font-medium text-marca-conteudo hover:bg-marca/90">
              Reenviar
            </button>
            <button type="button" onClick={aoDescartar} className="rounded px-2 py-1 text-conteudo-suave hover:bg-borda hover:text-conteudo">
              Descartar
            </button>
          </span>
        )}
      </div>
    </li>
  );
}
