import type { BaseEmpresa, BaseProfissionalDoDono, EnderecoCliente, IdentidadeOperavel } from "@jaa/contratos";
import type { ResultadoApi } from "@/lib/api";
import { localSalvoDaBaseEmpresa, locaisSalvosParaPesquisa, type LocalSalvo } from "./apresentacao-busca";

/*
 * Locais já cadastrados que podem abrir o LOCAL DA PESQUISA, conforme QUEM está pesquisando:
 * - agindo como PESSOA (atuante null): base do perfil profissional + endereços confirmados da agenda;
 * - agindo como EMPRESA: a base confirmada DAQUELA empresa (a mesma de Logística → Operação da base).
 *
 * O servidor é a autoridade nos dois passos da empresa: ele confirma que a conta opera a identidade
 * (e diz qual é a empresa dela) e só devolve a base a quem tem permissão naquela empresa. Nenhum
 * `empresaId` vem de escolha do cliente, e as fontes das duas identidades nunca se misturam.
 */

export interface FontesLocais {
  listarEnderecos: () => Promise<ResultadoApi<{ enderecos: EnderecoCliente[] }>>;
  buscarPerfilProfissional: () => Promise<ResultadoApi<{ perfil: { base: BaseProfissionalDoDono | null } | null }>>;
  verificarIdentidadeOperavel: (identidadeId: string) => Promise<ResultadoApi<IdentidadeOperavel>>;
  obterBaseEmpresa: (empresaId: string) => Promise<ResultadoApi<BaseEmpresa>>;
}

export async function carregarLocaisDaPesquisa(identidadeAtuanteId: string | null, fontes: FontesLocais): Promise<LocalSalvo[]> {
  if (identidadeAtuanteId === null) {
    const [enderecos, perfil] = await Promise.all([fontes.listarEnderecos(), fontes.buscarPerfilProfissional()]);
    return locaisSalvosParaPesquisa(enderecos.ok ? enderecos.dados.enderecos : [], perfil.ok ? (perfil.dados.perfil?.base ?? null) : null);
  }
  const identidade = await fontes.verificarIdentidadeOperavel(identidadeAtuanteId);
  if (!identidade.ok || identidade.dados.tipo !== "empresarial") return [];
  // Empresa sem base (404) ou sem ponto confirmado: nenhum local — a pessoa digita ou usa o GPS.
  const base = await fontes.obterBaseEmpresa(identidade.dados.empresa.id);
  return localSalvoDaBaseEmpresa(base.ok ? base.dados : null, identidade.dados.nomeExibicao);
}
