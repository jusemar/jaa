"use client";

import type { PerfilProfissionalDoDono } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { useCapacidadesSessao } from "@/components/navegacao/capacidades-sessao";
import { Botao, Cartao, Secao, Selo } from "@/components/ui/primitivos";
import { buscarPerfilProfissional } from "../lib/api-perfil-profissional";
import { ROTULO_SITUACAO } from "../lib/apresentacao-perfil-profissional";

/**
 * Entrada dentro de Perfil: "Ativar perfil profissional" ou, se já existe, a situação e "Abrir".
 * Visitante vê a mesma entrada (para conhecer o recurso); ativar pede "Criar conta / Entrar".
 */
export function EntradaPerfilProfissional({ aoAbrir }: { aoAbrir: () => void }) {
  const { visitante, exigirConta } = useCapacidadesSessao();
  // undefined = carregando (ou falhou: a entrada continua útil para abrir e tentar de novo lá dentro).
  const [perfil, setPerfil] = useState<PerfilProfissionalDoDono | null | undefined>(undefined);

  useEffect(() => {
    if (visitante) return;
    let ativo = true;
    void buscarPerfilProfissional().then((resposta) => ativo && resposta.ok && setPerfil(resposta.dados.perfil));
    return () => {
      ativo = false;
    };
  }, [visitante]);

  return (
    <Secao titulo="Perfil profissional">
      <Cartao className="flex flex-wrap items-center justify-between gap-3 p-4">
        {perfil ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-conteudo">{perfil.atividades.map((atividade) => atividade.nome).join(", ") || "Sem atividades"}</span>
            <Selo tom={perfil.situacao === "ativo" ? "marca" : perfil.situacao === "incompleto" ? "atencao" : "neutro"}>{ROTULO_SITUACAO[perfil.situacao]}</Selo>
          </div>
        ) : (
          <span className="text-sm text-conteudo-suave">Ofereça seus serviços pelo Jaaa</span>
        )}
        <Botao aparencia={perfil ? "secundario" : "principal"} data-ativar-perfil-profissional={perfil ? undefined : true} onClick={visitante ? () => exigirConta("Para oferecer seus serviços, você precisa de uma conta no Jaaa.") : aoAbrir}>
          {perfil ? "Abrir" : "Ativar perfil profissional"}
        </Botao>
      </Cartao>
    </Secao>
  );
}
