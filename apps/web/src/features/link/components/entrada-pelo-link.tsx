"use client";

import type { IdentidadePublica } from "@jaa/contratos";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Botao, Carregando } from "@/components/ui/primitivos";
import { FluxoAutenticacao } from "@/features/autenticacao/components/fluxo-autenticacao";
import { buscarIdentidadePublica } from "@/features/perfil/lib/api-perfil";
import { AvisosDeAcao } from "@/components/ui/avisos";
import { PaginaDoVisitante } from "./pagina-do-visitante";

/*
 * ENTRADA PELO LINK DO JAA (`/@usuario`).
 *
 * 1. Resolve o @usuario na consulta PÚBLICA (funciona sem sessão).
 * 2. Entrega ao fluxo de autenticação de sempre o DESTINO (a conversa com aquela identidade, com o
 *    cardápio se houver) e a página do visitante:
 *    - já autenticado → o app abre direto na conversa;
 *    - sem sessão → página pública JÁ com a entrada/cadastro de sempre à vista (sem botão no meio do
 *      caminho); ao concluir, o app abre no mesmo destino.
 */
type Estado = { fase: "carregando" } | { fase: "inexistente" } | { fase: "erro"; mensagem: string } | { fase: "pronta"; identidade: IdentidadePublica };

export function EntradaPeloLink({ nomeUsuario }: { nomeUsuario: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    void buscarIdentidadePublica(nomeUsuario).then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) setEstado({ fase: "pronta", identidade: resposta.dados });
      else if (resposta.status === 404) setEstado({ fase: "inexistente" });
      else setEstado({ fase: "erro", mensagem: resposta.mensagem });
    });
    return () => {
      ativo = false;
    };
  }, [nomeUsuario, tentativa]);

  if (estado.fase === "pronta") {
    const { identidade } = estado;
    return (
      <FluxoAutenticacao
        // O destino usa o @usuario CANÔNICO devolvido pelo servidor, não o texto do endereço.
        destino={{ nomeUsuario: identidade.nomeUsuario, nomeExibicao: identidade.nomeExibicao, abrirCardapio: identidade.temCardapio }}
        moldura={({ entrada, focarEntrada }) => (
          <>
            <PaginaDoVisitante identidade={identidade} entrada={entrada} aoPedirEntrada={focarEntrada} />
            {/* O visitante também precisa dos avisos: é por eles que o cardápio explica "fechada agora". */}
            <AvisosDeAcao />
          </>
        )}
      />
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-fundo px-4 py-10">
      <section aria-label="Link do Jaa" className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-bold text-marca">Jaa</h1>
        {estado.fase === "carregando" && <Carregando />}
        {estado.fase === "inexistente" && (
          <>
            <p data-link-inexistente className="text-sm text-conteudo-suave">
              Não encontramos <span className="font-bold text-conteudo">@{nomeUsuario}</span> no Jaa. Confira o endereço com quem enviou o link.
            </p>
            <Link href="/" className="text-sm font-medium text-marca underline">
              Ir para o Jaa
            </Link>
          </>
        )}
        {estado.fase === "erro" && (
          <>
            <p role="alert" className="text-sm text-perigo">
              {estado.mensagem}
            </p>
            <Botao
              onClick={() => {
                setEstado({ fase: "carregando" });
                setTentativa((atual) => atual + 1);
              }}
            >
              Tentar novamente
            </Botao>
          </>
        )}
      </section>
    </main>
  );
}
