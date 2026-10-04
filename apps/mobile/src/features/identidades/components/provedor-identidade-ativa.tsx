import { identidadeOperavelRecebidaSchema, type IdentidadeOperavelRecebida } from "@jaa/contratos";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useContextoConta } from "@/features/conta/components/provedor-contexto-conta";
import { requisitarApi } from "@/lib/api";
import { definirIdentidadeAtuante } from "@/lib/identidade-atuante";
import { gravarPreferenciaIdentidade, lerPreferenciaIdentidade, resolverIdentidadeAtiva } from "../lib/selecao-identidade";

/*
 * IDENTIDADE ATIVA do app — o `useIdentidadeAtiva` da Web. As identidades operáveis vêm do contexto
 * central da conta (o servidor decide quais são); aqui fica só a ESCOLHA da pessoa, que é intenção de
 * interface: o cabeçalho `x-jaa-identidade` e o handshake do realtime a levam, e a API autoriza.
 */
interface ValorIdentidadeAtiva {
  operaveis: readonly IdentidadeOperavelRecebida[];
  pessoal: IdentidadeOperavelRecebida | null;
  ativa: IdentidadeOperavelRecebida | null;
  erro: string | null;
  selecionar: (identidadeId: string) => Promise<void>;
}

const ContextoIdentidadeAtiva = createContext<ValorIdentidadeAtiva | null>(null);

const SEM_IDENTIDADES: readonly IdentidadeOperavelRecebida[] = [];

// A pessoal vai SEM cabeçalho (é o padrão do servidor); só a empresarial é pedida explicitamente.
const intencaoDe = (identidade: IdentidadeOperavelRecebida | null) => (identidade && identidade.tipo !== "pessoal" ? identidade.identidadeId : null);

export function ProvedorIdentidadeAtiva({ children }: { children: ReactNode }) {
  const { contexto, recarregar } = useContextoConta();
  const operaveis = contexto?.identidadesOperaveis ?? SEM_IDENTIDADES;
  const pessoalId = contexto?.identidadePessoal?.id ?? null;
  // `undefined` = a preferência guardada ainda não foi lida (nada é pedido à API antes disso).
  const [preferidaId, setPreferidaId] = useState<string | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!pessoalId) return;
    let ativo = true;
    void lerPreferenciaIdentidade(pessoalId).then((guardada) => {
      if (!ativo) return;
      // A intenção é definida ANTES de as telas montarem: a primeira requisição já sai como a identidade certa.
      definirIdentidadeAtuante(intencaoDe(resolverIdentidadeAtiva(operaveis, guardada)));
      setPreferidaId(guardada);
    });
    return () => {
      ativo = false;
    };
    // Só na troca de conta: as operáveis mudando depois são tratadas pela derivação abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoalId]);

  const ativa = preferidaId === undefined ? null : resolverIdentidadeAtiva(operaveis, preferidaId);
  const ativaId = ativa?.identidadeId ?? null;

  // A preferida deixou de ser operável (vínculo removido): a intenção volta junto para a pessoal.
  useEffect(() => {
    if (preferidaId !== undefined) definirIdentidadeAtuante(intencaoDe(ativa));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativaId, preferidaId]);

  // Sair da conta: nenhuma intenção de identidade sobrevive à sessão.
  useEffect(() => () => definirIdentidadeAtuante(null), []);

  const selecionar = useCallback(
    async (identidadeId: string) => {
      if (!pessoalId) return;
      // Confirma no servidor antes de trocar, como a Web (`GET /identidades/operaveis/:id`).
      const verificada = await requisitarApi(`/identidades/operaveis/${encodeURIComponent(identidadeId)}`, identidadeOperavelRecebidaSchema);
      if (!verificada.ok) {
        setErro("Você não pode agir como esta identidade.");
        await recarregar();
        return;
      }
      setErro(null);
      await gravarPreferenciaIdentidade(pessoalId, verificada.dados.identidadeId);
      definirIdentidadeAtuante(intencaoDe(verificada.dados));
      setPreferidaId(verificada.dados.identidadeId);
    },
    [pessoalId, recarregar],
  );

  const valor = useMemo<ValorIdentidadeAtiva>(
    () => ({ operaveis, pessoal: operaveis.find((identidade) => identidade.tipo === "pessoal") ?? null, ativa, erro, selecionar }),
    [operaveis, ativa, erro, selecionar],
  );

  return <ContextoIdentidadeAtiva.Provider value={valor}>{children}</ContextoIdentidadeAtiva.Provider>;
}

export function useIdentidadeAtiva(): ValorIdentidadeAtiva {
  const valor = useContext(ContextoIdentidadeAtiva);
  if (!valor) throw new Error("useIdentidadeAtiva precisa estar dentro de <ProvedorIdentidadeAtiva>.");
  return valor;
}
