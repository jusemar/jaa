import type { CapacidadeConta } from "@jaa/contratos";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { buscarContextoConta } from "../lib/api-contexto";
import type { ContextoContaInterpretado } from "../lib/contexto-conta";

/*
 * FONTE ÚNICA do contexto da conta no app. Carrega ao abrir, ao voltar ao primeiro plano (só se havia
 * sessão) e quando alguém pede `recarregar()` (ex.: login concluído). Sem polling, sem socket e sem
 * cópia persistida: o servidor é a fonte, e nada aqui autoriza coisa nenhuma.
 */

export interface ValorContextoConta {
  contexto: ContextoContaInterpretado | null;
  // Atalho para `contexto.capacidades` (só as conhecidas por esta versão).
  capacidades: readonly CapacidadeConta[];
  carregando: boolean;
  semSessao: boolean;
  erro: string | null;
  // Quando a última resposta chegou (o diagnóstico mostra, para conferir que recarregou de verdade).
  carregadoEm: Date | null;
  recarregar: () => Promise<void>;
}

interface Estado {
  contexto: ContextoContaInterpretado | null;
  carregando: boolean;
  semSessao: boolean;
  erro: string | null;
  carregadoEm: Date | null;
}

const ContextoDaConta = createContext<ValorContextoConta | null>(null);

const SEM_CAPACIDADES: readonly CapacidadeConta[] = [];

export function ProvedorContextoConta({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ contexto: null, carregando: true, semSessao: false, erro: null, carregadoEm: null });
  // Só a resposta da ÚLTIMA busca vale (duas buscas seguidas não se atropelam).
  const ultimaBusca = useRef(0);
  const semSessao = useRef(false);

  const recarregar = useCallback(async () => {
    const busca = ++ultimaBusca.current;
    setEstado((atual) => ({ ...atual, carregando: true, erro: null }));
    const resultado = await buscarContextoConta();
    if (busca !== ultimaBusca.current) return;
    semSessao.current = resultado.tipo === "sem_sessao";
    setEstado((atual) => {
      const carregadoEm = new Date();
      if (resultado.tipo === "pronto") return { contexto: resultado.contexto, carregando: false, semSessao: false, erro: null, carregadoEm };
      if (resultado.tipo === "sem_sessao") return { contexto: null, carregando: false, semSessao: true, erro: null, carregadoEm };
      // Erro momentâneo (rede): mantém o último contexto válido na tela e mostra o erro.
      return { ...atual, carregando: false, erro: resultado.mensagem, carregadoEm };
    });
  }, []);

  useEffect(() => {
    void recarregar();
    const assinatura = AppState.addEventListener("change", (situacao) => {
      // Sem sessão, voltar ao app não dispara chamada: o login avisa com `recarregar()`.
      if (situacao === "active" && !semSessao.current) void recarregar();
    });
    return () => assinatura.remove();
  }, [recarregar]);

  const valor = useMemo<ValorContextoConta>(
    () => ({ ...estado, capacidades: estado.contexto?.capacidades ?? SEM_CAPACIDADES, recarregar }),
    [estado, recarregar],
  );

  return <ContextoDaConta.Provider value={valor}>{children}</ContextoDaConta.Provider>;
}

export function useContextoConta(): ValorContextoConta {
  const valor = useContext(ContextoDaConta);
  if (!valor) throw new Error("useContextoConta precisa estar dentro de <ProvedorContextoConta>.");
  return valor;
}
