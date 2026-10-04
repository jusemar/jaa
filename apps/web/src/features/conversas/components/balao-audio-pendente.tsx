import type { EstadoImagem } from "../lib/urls-imagens";
import { PlayerAudio } from "./player-audio";

/*
 * Áudio EM ENVIO (ou que falhou), como balão próprio no fim da conversa: toca do arquivo LOCAL enquanto
 * a API não respondeu. Não é uma mensagem — some quando a mensagem oficial chega. Reenviar usa a MESMA
 * tentativa (mesmo idCliente, mesmo áudio): nunca duplica.
 */
export function BalaoAudioPendente({
  previaUrl,
  duracaoMs,
  situacao,
  aoReenviar,
  aoDescartar,
}: {
  previaUrl: string;
  duracaoMs: number;
  situacao: "enviando" | "falhou";
  aoReenviar: () => void;
  aoDescartar: () => void;
}) {
  const estado: EstadoImagem = { situacao: "pronta", url: previaUrl };
  return (
    <li data-audio-pendente={situacao} className="flex items-end justify-end gap-1">
      <div className="flex min-w-0 max-w-[86%] flex-col gap-1 rounded-jaa bg-mensagem-enviada px-4 py-3 text-sm leading-[1.45] text-mensagem-enviada-conteudo shadow-balao sm:max-w-[min(72%,38rem)]">
        <span className="sr-only">Você: áudio </span>
        <PlayerAudio estado={estado} duracaoMs={duracaoMs} emBalaoProprio />
        {situacao === "enviando" ? (
          <span role="status" className="self-end text-[10px] leading-none text-conteudo-suave">
            Enviando…
          </span>
        ) : (
          <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <span role="alert" className="text-perigo">
              Não enviado
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
