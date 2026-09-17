import type { ParticipanteConversa } from "@jaa/contratos";
import type { ReactNode } from "react";
import { AvatarIdentidade } from "@/components/avatar-identidade";

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
  const descricaoPresenca = presenca === "online" ? "Disponível agora" : presenca === "offline" ? "Sem conexão agora" : null;

  return (
    <header
      aria-label="Cabeçalho da conversa"
      className="flex min-h-[4.5rem] shrink-0 items-center gap-3 border-b border-borda bg-superficie/95 px-3 py-2 backdrop-blur md:px-5"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      {aoVoltar && (
        <button
          type="button"
          data-voltar-conversas
          aria-label="Voltar para conversas"
          onClick={aoVoltar}
          className="-ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-conteudo-suave hover:bg-superficie-suave md:hidden"
        >
          <span aria-hidden>←</span>
        </button>
      )}

      <span className="relative shrink-0">
        <AvatarIdentidade identidade={outraIdentidade} />
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

      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="flex items-center gap-2 truncate">
          <span className="fonte-display truncate text-base font-semibold">{outraIdentidade.nomeExibicao}</span>
          {outraIdentidade.tipo === "empresarial" && (
            <span
              data-tipo-participante="empresarial"
              className="shrink-0 rounded-full border border-ouro/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-aviso"
            >
              Empresa
            </span>
          )}
        </h2>
        <p
          data-atividade={digitando ? "digitando" : (presenca ?? "desconhecida")}
          aria-live="polite"
          className={`min-h-4 truncate text-xs ${digitando || presenca === "online" ? "text-marca" : "text-conteudo-suave"}`}
        >
          {digitando ? "digitando…" : descricaoPresenca ? (presenca === "online" ? "online agora" : "sem conexão") : `@${outraIdentidade.nomeUsuario}`}
        </p>
      </div>

      {acoes && <div className="flex shrink-0 items-center gap-1">{acoes}</div>}
    </header>
  );
}
