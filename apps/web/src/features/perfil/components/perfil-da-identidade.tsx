"use client";

import type { IdentidadeVisivel, PerfilPublico } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Folha } from "@/components/ui/folha";
import { Aviso } from "@/components/ui/primitivos";
import { LinkDoJaa } from "@/features/link/components/link-do-jaa";
import { buscarPerfilDe } from "../lib/api-perfil";
import { ApresentacaoIdentidade, BlocoDoPerfil } from "./apresentacao-identidade";

/*
 * PERFIL DE OUTRA IDENTIDADE, aberto ao tocar no nome ou na foto no cabeçalho da conversa — numa
 * FOLHA adaptativa (`Folha`): sobe de baixo no celular/tablet e é painel lateral na janela larga.
 *
 * Usa a rota de perfil que já existe (`GET /identidades/:id/perfil`), consultada como a identidade
 * ATUANTE: é o servidor que decide o que ela pode ver (foto, frase de status). O Recado só aparece
 * quando a privacidade do dono permite; escondido e não preenchido são indistinguíveis. Enquanto
 * carrega, a pessoa já vê o que a conversa conhece (nome, @usuario, foto) — sem tela vazia.
 */
export function PerfilDaIdentidade({ identidade, aoFechar }: { identidade: IdentidadeVisivel; aoFechar: () => void }) {
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void buscarPerfilDe(identidade.identidadeId).then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) setPerfil(resposta.dados);
      else setErro(resposta.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, [identidade.identidadeId]);

  // Resposta de outra identidade (troca rápida de conversa) nunca é exibida.
  const carregado = perfil && perfil.identidadeId === identidade.identidadeId ? perfil : null;

  return (
    <Folha rotulo={`Perfil de ${identidade.nomeExibicao}`} aoFechar={aoFechar}>
      <div data-perfil-da-identidade className="flex flex-col gap-4 pb-2 pt-6">
        <ApresentacaoIdentidade destaque identidade={carregado ?? identidade} fraseStatus={carregado?.fraseStatus ?? null} sobre={carregado?.sobre ?? null}>
          <BlocoDoPerfil id="link" titulo="Link do Jaa">
            {/* Já estamos na conversa desta identidade: abrir o link é só fechar o perfil. */}
            <LinkDoJaa nomeUsuario={identidade.nomeUsuario} aoAbrir={aoFechar} />
          </BlocoDoPerfil>
        </ApresentacaoIdentidade>
        {!carregado && !erro && (
          <p role="status" className="text-center text-xs text-conteudo-suave">
            Carregando perfil…
          </p>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Folha>
  );
}
