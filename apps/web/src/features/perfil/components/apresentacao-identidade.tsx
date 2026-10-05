import type { ParticipanteConversa } from "@jaa/contratos";
import type { ReactNode } from "react";
import { AvatarIdentidade } from "@/components/avatar-identidade";
import { blocosDoPerfil } from "../lib/apresentacao-perfil";

/**
 * Uma identidade apresentada a OUTRA pessoa: foto (ou iniciais), nome, @usuario, o recado curto
 * (frase de status) e o "sobre". A mesma apresentação no perfil aberto pelo cabeçalho da conversa e
 * na página do Link do Jaa. Só exibe o que recebeu: a privacidade já foi aplicada pelo servidor.
 *
 * `destaque`: a FOTO grande no alto e as informações abaixo (perfil). Sem ele, uma linha compacta
 * (cartão da página do link). Em qualquer largura o texto quebra dentro da coluna, nunca a estoura.
 */
export function ApresentacaoIdentidade({
  identidade,
  fraseStatus,
  sobre,
  destaque = false,
  children,
}: {
  identidade: Pick<ParticipanteConversa, "identidadeId" | "nomeExibicao" | "nomeUsuario" | "tipo"> & { fotoUrl?: string | null };
  fraseStatus: string | null;
  sobre: string | null;
  destaque?: boolean;
  // Blocos extras ao final (ex.: o Link do Jaa), no mesmo ritmo dos blocos de texto.
  children?: ReactNode;
}) {
  const blocos = blocosDoPerfil({ tipo: identidade.tipo, fraseStatus, sobre });
  return (
    <div data-apresentacao-identidade={destaque ? "destaque" : "linha"} className="flex min-w-0 flex-col gap-4">
      <div className={destaque ? "flex flex-col items-center gap-3 text-center" : "flex items-center gap-4"}>
        <AvatarIdentidade identidade={identidade} tamanho={destaque ? "destaque" : "grande"} />
        <div className={`flex min-w-0 flex-col gap-1 ${destaque ? "max-w-full items-center" : ""}`}>
          <p className={`flex flex-wrap items-center gap-2 ${destaque ? "justify-center" : ""}`}>
            <span className={`fonte-display font-bold [overflow-wrap:anywhere] ${destaque ? "text-xl" : "text-lg"}`}>{identidade.nomeExibicao}</span>
            {identidade.tipo === "empresarial" && (
              <span className="shrink-0 rounded-full bg-ouro/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-aviso">Empresa</span>
            )}
          </p>
          <p className="max-w-full truncate text-sm text-conteudo-suave">@{identidade.nomeUsuario}</p>
        </div>
      </div>
      {blocos.map((bloco) => (
        <BlocoDoPerfil key={bloco.id} id={bloco.id} titulo={bloco.titulo}>
          <p className="whitespace-pre-line text-sm [overflow-wrap:anywhere]">{bloco.texto}</p>
        </BlocoDoPerfil>
      ))}
      {children}
    </div>
  );
}

export function BlocoDoPerfil({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <div data-perfil-bloco={id} className="flex min-w-0 flex-col gap-1">
      <p className="text-xs font-bold uppercase tracking-wide text-conteudo-suave">{titulo}</p>
      {children}
    </div>
  );
}
