"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Botao, Cartao } from "@/components/ui/primitivos";

/*
 * CAPACIDADES DA SESSÃO — o MESMO aplicativo para quem tem conta e para o VISITANTE do Link do Jaa.
 *
 * Não existe "interface de visitante": o AppJaa é um só, e o que muda é o que a sessão pode fazer.
 * O visitante conversa, pesquisa pessoas e vê tudo o que é público; o que depende de conta permanente
 * (perfil, empresas, perfil profissional, pedido...) continua À VISTA, e tentar usar mostra
 * "Criar conta / Entrar".
 *
 * Isto é só APRESENTAÇÃO: o servidor recusa com CONTA_NECESSARIA de qualquer forma. Aqui apenas se
 * evita a chamada inútil e se explica o motivo no lugar certo.
 */
export interface CapacidadesSessao {
  // Sessão temporária do Link do Jaa (sem conta permanente).
  visitante: boolean;
  // Mostra "Crie sua conta para usar este recurso." com Criar conta / Entrar.
  exigirConta: (motivo?: string) => void;
  criarConta: () => void;
  entrar: () => void;
}

const CONTA_COMUM: CapacidadesSessao = {
  visitante: false,
  exigirConta: () => undefined,
  criarConta: () => undefined,
  entrar: () => undefined,
};

const ContextoCapacidades = createContext<CapacidadesSessao>(CONTA_COMUM);

export const ProvedorCapacidades = ContextoCapacidades.Provider;

export function useCapacidadesSessao(): CapacidadesSessao {
  return useContext(ContextoCapacidades);
}

export const TITULO_CONTA_NECESSARIA = "Crie sua conta para usar este recurso.";

/**
 * Um recurso que o visitante CONHECE mas só usa com conta: o que ele faz e, ao lado, Criar conta / Entrar.
 * No lugar do conteúdo que dependeria de conta — nunca escondendo a área inteira.
 */
export function RecursoComConta({ titulo, descricao, children }: { titulo: string; descricao: string; children?: ReactNode }) {
  const { criarConta, entrar } = useCapacidadesSessao();
  return (
    <div data-recurso-com-conta>
      <Cartao className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">{titulo}</p>
          <p className="text-sm text-conteudo-suave">{descricao}</p>
        </div>
        {children}
        <p className="text-sm">{TITULO_CONTA_NECESSARIA}</p>
        <div className="flex flex-wrap gap-2">
          <Botao data-recurso-criar-conta onClick={criarConta}>
            Criar conta
          </Botao>
          <Botao aparencia="secundario" data-recurso-entrar onClick={entrar}>
            Entrar
          </Botao>
        </div>
      </Cartao>
    </div>
  );
}
