"use client";

import type { IdentidadeOperavel, VisitanteAtual } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { definirIdentidadeAtuante } from "@/lib/identidade-atuante";
import { listarIdentidadesOperaveis, verificarIdentidadeOperavel } from "../lib/api-identidades";
import { gravarPreferenciaIdentidade, lerPreferenciaIdentidade, resolverIdentidadeAtiva } from "../lib/selecao-identidade";

/**
 * Identidades que a conta pode operar (fonte: servidor) e a escolhida na interface (preferência local),
 * que também define em nome de quem o mensageiro opera.
 * Trocar a seleção pergunta ao servidor antes de aplicar; alterar o valor salvo no navegador não
 * concede nada, pois só ids presentes na lista do servidor são aceitos.
 *
 * VISITANTE (Link do Jaa): opera só a própria identidade temporária, que o servidor já informou em
 * `/usuarios/eu`; não há lista a pedir (a rota é de conta). O @usuario técnico dele nunca chega ao
 * cliente: aqui ele fica VAZIO, e quem mostra a identidade diz "sem conta" no lugar.
 */
export function identidadeDoVisitante(visitante: VisitanteAtual): IdentidadeOperavel {
  return { tipo: "pessoal", identidadeId: visitante.identidadeId, nomeExibicao: visitante.nomeExibicao, nomeUsuario: "", fotoUrl: null };
}

export function useIdentidadeAtiva(identidadePessoalId: string, visitante: VisitanteAtual | null = null) {
  const doVisitante = visitante ? identidadeDoVisitante(visitante) : null;
  const [operaveis, setOperaveis] = useState<IdentidadeOperavel[]>(doVisitante ? [doVisitante] : []);
  const [ativa, setAtivaNoEstado] = useState<IdentidadeOperavel | null>(doVisitante);

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

  const visitanteId = visitante?.identidadeId ?? null;
  useEffect(() => {
    // Visitante age só como ele mesmo: nenhuma preferência "Agindo como" de outra sessão vale aqui.
    if (visitanteId) {
      definirIdentidadeAtuante(null);
      return;
    }
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
  }, [identidadePessoalId, visitanteId, setAtiva]);

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
