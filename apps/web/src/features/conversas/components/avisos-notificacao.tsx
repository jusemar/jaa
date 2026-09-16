import type { EventoNotificacaoNovaMensagem } from "@jaa/contratos";
import { textoDaPrevia } from "../lib/respostas";

// Interface TÉCNICA: avisos in-app de nova mensagem, discretos, no canto da tela. Não é o design final.

export function AvisosNotificacao({
  avisos,
  aoAbrir,
  aoDispensar,
}: {
  avisos: EventoNotificacaoNovaMensagem[];
  aoAbrir: (aviso: EventoNotificacaoNovaMensagem) => void;
  aoDispensar: (mensagemId: string) => void;
}) {
  return (
    <div aria-label="Notificações" aria-live="polite" className="fixed bottom-4 right-4 z-20 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {avisos.map((aviso) => (
        <div key={aviso.mensagemId} data-notificacao={aviso.conversaId} role="status" className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-lg">
          <button type="button" onClick={() => aoAbrir(aviso)} className="min-w-0 flex-1 text-left">
            <span className="block truncate font-semibold">{aviso.remetente.nomeExibicao}</span>
            <span className="line-clamp-2 text-zinc-600 [overflow-wrap:anywhere]">{textoDaPrevia(aviso)}</span>
          </button>
          <button
            type="button"
            aria-label="Dispensar notificação"
            onClick={() => aoDispensar(aviso.mensagemId)}
            className="shrink-0 rounded px-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
