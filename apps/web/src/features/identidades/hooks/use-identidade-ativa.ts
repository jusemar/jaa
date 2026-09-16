"use client";

import type { IdentidadeOperavel } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { definirIdentidadeAtuante } from "@/lib/identidade-atuante";
import { listarIdentidadesOperaveis, verificarIdentidadeOperavel } from "../lib/api-identidades";
import { gravarPreferenciaIdentidade, lerPreferenciaIdentidade, resolverIdentidadeAtiva } from "../lib/selecao-identidade";

/**
 * Identidades que a conta pode operar (fonte: servidor) e a escolhida na interface (preferência local),
 * que também define em nome de quem o mensageiro opera.
 * Trocar a seleção pergunta ao servidor antes de aplicar; alterar o valor salvo no navegador não
 * concede nada, pois só ids presentes na lista do servidor são aceitos.
 */
export function useIdentidadeAtiva(identidadePessoalId: string) {
  const [operaveis, setOperaveis] = useState<IdentidadeOperavel[]>([]);
  const [ativa, setAtivaNoEstado] = useState<IdentidadeOperavel | null>(null);

  // A identidade escolhida passa a ser a INTENÇÃO usada pelo mensageiro (cabeçalho + realtime) antes de
  // a interface renderizar com ela. O servidor autoriza cada operação.
  const setAtiva = useCallback((identidade: IdentidadeOperavel | null) => {
    definirIdentidadeAtuante(identidade && identidade.tipo !== "pessoal" ? identidade.identidadeId : null);
    setAtivaNoEstado(identidade);
  }, []);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const resultado = await listarIdentidadesOperaveis();
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    setOperaveis(resultado.dados.identidades);
    setAtiva(resolverIdentidadeAtiva(resultado.dados.identidades, lerPreferenciaIdentidade(identidadePessoalId)));
  }, [identidadePessoalId, setAtiva]);

  useEffect(() => {
    let ativo = true;
    void listarIdentidadesOperaveis().then((resultado) => {
      if (!ativo) return;
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setOperaveis(resultado.dados.identidades);
      setAtiva(resolverIdentidadeAtiva(resultado.dados.identidades, lerPreferenciaIdentidade(identidadePessoalId)));
    });
    return () => {
      ativo = false;
    };
  }, [identidadePessoalId, setAtiva]);

  const selecionar = useCallback(
    async (identidadeId: string) => {
      const verificada = await verificarIdentidadeOperavel(identidadeId);
      if (!verificada.ok) {
        setErro("Você não pode agir como esta identidade.");
        await recarregar();
        return;
      }
      setErro(null);
      gravarPreferenciaIdentidade(identidadePessoalId, verificada.dados.identidadeId);
      setAtiva(verificada.dados);
    },
    [identidadePessoalId, recarregar, setAtiva],
  );

  return { operaveis, ativa, erro, selecionar, recarregar };
}
