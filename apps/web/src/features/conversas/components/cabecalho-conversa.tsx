import type { ParticipanteConversa } from "@jaa/contratos";
import type { ReactNode } from "react";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { IconeVoltar } from "@/components/ui/icones";

/**
 * Cabeçalho da conversa: voltar (no celular), avatar, nome e a atividade atual.
 *
 * PRESENÇA é discreta — uma bolinha no avatar e uma linha curta abaixo do nome, não a palavra
 * "Online" gritando na tela. Como cor sozinha não comunica nada para quem usa leitor de tela (nem
 * para quem não distingue cores), a bolinha carrega o texto equivalente.
 *
 * Quando a presença não é conhecida (a outra pessoa pode tê-la restringido nas configurações de
 * privacidade), NADA é afirmado: sem bolinha e sem linha. Dizer "sem conexão" nesse caso seria
 * mentira, e é exatamente o que a privacidade quer evitar.
 */
export function CabecalhoConversa({
  outraIdentidade,
  presenca,
  digitando,
  acoes,
  aoVoltar,
}: {
  outraIdentidade: ParticipanteConversa;
  presenca: "online" | "offline" | null;
  digitando: boolean;
  acoes?: ReactNode;
  // Só no celular: a conversa ocupa a tela toda e precisa de um caminho de volta para a lista.
  aoVoltar?: () => void;
}) {
  const descricaoPresenca =
    presenca === "online"
      ? "Disponível agora"
      : presenca === "offline"
        ? "Sem conexão agora"
        : null;

  return (
    <header
      aria-label="Cabeçalho da conversa"
      /*
       * 72px e a MESMA superfície clara da navegação e das demais áreas (`bg-superficie`): o cinza
       * próprio daqui destacava esta barra como se fosse de outro sistema. Quem separa a barra do
       * papel de parede da conversa é a borda de baixo, não um tom diferente.
       */
      className="grid min-h-[4.5rem] shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-borda bg-superficie px-3 py-2 md:px-5"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {aoVoltar && (
          <button
            type="button"
            data-voltar-conversas
            aria-label="Voltar para conversas"
            onClick={aoVoltar}
            className="-ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-jaa-compacto text-conteudo-suave hover:bg-realce xl:hidden"
          >
            <IconeVoltar className="h-5 w-5" />
          </button>
        )}

        <span className="relative shrink-0">
          <AvatarIdentidade identidade={outraIdentidade} tamanho="medio" />
          {presenca && (
            <span
              data-presenca={presenca}
              title={descricaoPresenca ?? undefined}
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-superficie ${presenca === "online" ? "bg-marca" : "bg-conteudo-suave/50"}`}
            >
              <span className="sr-only">{descricaoPresenca}</span>
            </span>
          )}
        </span>

        <div className="flex min-w-0 flex-col">
          <h2 className="flex items-center gap-2 truncate">
            <span className="fonte-display truncate text-sm font-bold sm:text-base">
              {outraIdentidade.nomeExibicao}
            </span>
            {outraIdentidade.tipo === "empresarial" && (
              <span
                data-tipo-participante="empresarial"
                className="shrink-0 rounded-full bg-ouro/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-aviso"
              >
                Empresa
              </span>
            )}
          </h2>
          {/*
            Atividade em uma linha com a bolinha da referência. Quando a presença não é conhecida
            (privacidade), nada é afirmado: aparece só o @usuario, sem bolinha.
          */}
          <p
            data-atividade={
              digitando ? "digitando" : (presenca ?? "desconhecida")
            }
            aria-live="polite"
            className={`flex min-h-4 items-center gap-1.5 truncate text-xs ${digitando || presenca === "online" ? "text-marca" : "text-conteudo-suave"}`}
          >
            {(digitando || presenca === "online") && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-marca"
              />
            )}
            {digitando
              ? "digitando…"
              : descricaoPresenca
                ? presenca === "online"
                  ? "online agora"
                  : "sem conexão"
                : `@${outraIdentidade.nomeUsuario}`}
          </p>
        </div>
      </div>

      {acoes && <div className="flex shrink-0 items-center gap-1">{acoes}</div>}
    </header>
  );
}
