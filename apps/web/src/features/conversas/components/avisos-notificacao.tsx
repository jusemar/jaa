import type { EventoNotificacaoNovaMensagem } from "@jaa/contratos";
import { textoDaPrevia } from "../lib/respostas";

/*
 * Avisos in-app de nova mensagem, discretos, no canto da tela.
 *
 * No celular ficam ACIMA da barra de navegação inferior: um aviso escondido atrás do menu não é aviso.
 */

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
    <div aria-label="Notificações" aria-live="polite" className="fixed bottom-20 right-4 z-20 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 md:bottom-4">
      {avisos.map((aviso) => (
        <div key={aviso.mensagemId} data-notificacao={aviso.conversaId} role="status" className="flex items-start gap-2 rounded-jaa border border-borda bg-superficie p-3 text-sm shadow-suave">
          <button type="button" onClick={() => aoAbrir(aviso)} className="min-w-0 flex-1 text-left">
            <span className="block truncate font-semibold">{aviso.remetente.nomeExibicao}</span>
            <span className="line-clamp-2 text-conteudo-suave [overflow-wrap:anywhere]">{textoDaPrevia(aviso)}</span>
          </button>
          <button
            type="button"
            aria-label="Dispensar notificação"
            onClick={() => aoDispensar(aviso.mensagemId)}
            className="shrink-0 rounded px-1.5 text-conteudo-suave/70 hover:bg-superficie-suave hover:text-conteudo"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
