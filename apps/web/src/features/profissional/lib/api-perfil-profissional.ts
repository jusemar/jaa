import {
  catalogoServicosSchema,
  listaMunicipiosSchema,
  respostaPerfilProfissionalSchema,
  sugestaoLocalizacaoSchema,
  type AreaAtuacaoEntrada,
  type CatalogoServicos,
  type Coordenadas,
  type EditarAreaAtuacaoEntrada,
  type HorariosAtendimentoEntrada,
  type MunicipioCatalogo,
  type RespostaPerfilProfissional,
  type SalvarBaseProfissionalEntrada,
  type SugestaoLocalizacao,
} from "@jaa/contratos";
import { requisitarApi, type ResultadoApi } from "@/lib/api";

/*
 * PERFIL PROFISSIONAL — cliente da API. Tudo age sobre o perfil da identidade PESSOAL da sessão (não
 * se envia identidade nem usuário). Toda mutação devolve o perfil atualizado: a tela troca o estado
 * inteiro pela resposta do servidor, que é a autoridade.
 */

type Metodo = "POST" | "PUT" | "PATCH" | "DELETE";
type RespostaPerfil = Promise<ResultadoApi<RespostaPerfilProfissional>>;

function mutar(caminho: string, metodo: Metodo, corpo?: unknown): RespostaPerfil {
  return requisitarApi(`/profissional/perfil${caminho}`, respostaPerfilProfissionalSchema, {
    method: metodo,
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

export const buscarPerfilProfissional = (): RespostaPerfil => requisitarApi("/profissional/perfil", respostaPerfilProfissionalSchema);

export const buscarCatalogoProfissional = (): Promise<ResultadoApi<CatalogoServicos>> => requisitarApi("/profissional/catalogo", catalogoServicosSchema);

export async function buscarMunicipios(busca: string): Promise<ResultadoApi<MunicipioCatalogo[]>> {
  const resposta = await requisitarApi(`/profissional/municipios?busca=${encodeURIComponent(busca)}`, listaMunicipiosSchema);
  return resposta.ok ? { ...resposta, dados: resposta.dados.municipios } : resposta;
}

export const ativarPerfilProfissional = () => mutar("", "POST");
export const tornarPerfilAtivo = () => mutar("/ativar", "POST");
export const pausarPerfil = () => mutar("/desativar", "POST");
export const salvarPreferencias = (recebeOportunidadesOutrasRegioes: boolean) => mutar("/preferencias", "PATCH", { recebeOportunidadesOutrasRegioes });

export const adicionarAtividade = (servicoId: string) => mutar("/atividades", "POST", { servicoId });
export const salvarEscolhasAtividade = (id: string, escolhas: { especialidadeIds: string[]; opcaoIds: string[] }) => mutar(`/atividades/${id}`, "PATCH", escolhas);
export const removerAtividade = (id: string) => mutar(`/atividades/${id}`, "DELETE");
export const salvarHorarios = (id: string, entrada: HorariosAtendimentoEntrada) => mutar(`/atividades/${id}/horarios`, "PUT", entrada);
export const salvarPermiteAgendamento = (id: string, permiteAgendamento: boolean) => mutar(`/atividades/${id}/configuracao`, "PATCH", { permiteAgendamento });

export const salvarBase = (entrada: SalvarBaseProfissionalEntrada) => mutar("/base", "PUT", entrada);
// `baseAtualizadaEm`: versão do endereço que a tela mostrava — endereço mudou depois disso = recusa.
export const confirmarPontoBase = (coordenadas: Coordenadas, baseAtualizadaEm: string) => mutar("/base/ponto", "PUT", { ...coordenadas, baseAtualizadaEm });
export const sugerirPontoBase = (): Promise<ResultadoApi<SugestaoLocalizacao>> =>
  requisitarApi("/profissional/perfil/base/sugestao-localizacao", sugestaoLocalizacaoSchema, { method: "POST" });

export const adicionarArea = (entrada: AreaAtuacaoEntrada) => mutar("/areas", "POST", entrada);
export const editarArea = (id: string, entrada: EditarAreaAtuacaoEntrada) => mutar(`/areas/${id}`, "PATCH", entrada);
export const removerArea = (id: string) => mutar(`/areas/${id}`, "DELETE");
