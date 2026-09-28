import {
  paginaProfissionaisEncontradosSchema,
  respostaIntencoesProfissionaisSchema,
  sugestaoLocalizacaoSchema,
  type Coordenadas,
  type IntencaoProfissional,
  type LocalizarEnderecoPesquisaEntrada,
  type PaginaProfissionaisEncontrados,
  type RespostaIntencoesProfissionais,
  type SugestaoLocalizacao,
} from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";
import { cabecalhosIdentidadeAtuante } from "@/lib/identidade-atuante";

// Busca de profissionais: quem pesquisa é sempre a sessão; o local é só parâmetro (nada é gravado).

export function listarIntencoesProfissionais(termo: string): Promise<ResultadoApi<RespostaIntencoesProfissionais>> {
  return requisitarApi(`/profissionais/intencoes?termo=${encodeURIComponent(termo)}`, respostaIntencoesProfissionaisSchema, { headers: cabecalhosIdentidadeAtuante() });
}

export function buscarProfissionais(
  intencao: Pick<IntencaoProfissional, "servicoId" | "especialidadeId" | "opcaoId">,
  local: Coordenadas,
  raioKm: number,
  pagina: number,
): Promise<ResultadoApi<PaginaProfissionaisEncontrados>> {
  const parametros = new URLSearchParams({
    servicoId: intencao.servicoId,
    latitude: String(local.latitude),
    longitude: String(local.longitude),
    raioKm: String(raioKm),
    pagina: String(pagina),
  });
  if (intencao.especialidadeId) parametros.set("especialidadeId", intencao.especialidadeId);
  if (intencao.opcaoId) parametros.set("opcaoId", intencao.opcaoId);
  return requisitarApi(`/profissionais/busca?${parametros}`, paginaProfissionaisEncontradosSchema, { headers: cabecalhosIdentidadeAtuante() });
}

// Palpite para ABRIR o mapa perto do endereço digitado; a pessoa ainda confirma o ponto.
export function localizarEnderecoDaPesquisa(endereco: LocalizarEnderecoPesquisaEntrada): Promise<ResultadoApi<SugestaoLocalizacao>> {
  return requisitarApi("/profissionais/busca/localizar-endereco", sugestaoLocalizacaoSchema, {
    method: "POST",
    headers: cabecalhosIdentidadeAtuante(),
    body: JSON.stringify(endereco),
  });
}
