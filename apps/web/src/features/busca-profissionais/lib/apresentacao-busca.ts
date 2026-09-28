import { formatarEnderecoResumido, type BaseEmpresa, type BaseProfissionalDoDono, type Coordenadas, type EnderecoCliente, rotuloEndereco } from "@jaa/contratos";

/*
 * Regras de APRESENTAÇÃO da busca de profissionais (puras, sem rede): qual modo o campo usa, quais
 * locais já cadastrados podem abrir a pesquisa, textos de horário e a seleção explícita.
 */

// "@joao" = pessoas/empresas (busca de sempre); sem @ = também tenta o catálogo profissional.
export type ModoPesquisa = "usuario" | "livre";

export function modoDaPesquisa(termo: string): ModoPesquisa {
  return termo.trim().startsWith("@") ? "usuario" : "livre";
}

/**
 * LOCAL DA PESQUISA reaproveitado: só lugares da PRÓPRIA pessoa que já têm ponto CONFIRMADO — a base
 * do perfil profissional e os endereços da agenda. Nada é copiado nem gravado: a pesquisa só usa o
 * texto exibível e a coordenada. Sem regra de precedência entre eles, a pessoa escolhe.
 */
export interface LocalSalvo {
  chave: string;
  rotulo: string;
  descricao: string;
  coordenadas: Coordenadas;
}

export function locaisSalvosParaPesquisa(enderecos: readonly EnderecoCliente[], base: BaseProfissionalDoDono | null): LocalSalvo[] {
  const locais: LocalSalvo[] = [];
  if (base?.coordenadas) {
    locais.push({
      chave: "base-profissional",
      rotulo: "Base do perfil profissional",
      descricao: `${formatarEnderecoResumido(base)} – ${base.cidade}`,
      coordenadas: base.coordenadas,
    });
  }
  for (const endereco of enderecos) {
    if (endereco.latitude === null || endereco.longitude === null) continue;
    locais.push({
      chave: `endereco-${endereco.id}`,
      rotulo: rotuloEndereco(endereco),
      descricao: `${formatarEnderecoResumido(endereco)} – ${endereco.cidade}`,
      coordenadas: { latitude: endereco.latitude, longitude: endereco.longitude },
    });
  }
  return locais;
}

// "Atendendo agora" / "Fechado agora": informação, nunca filtro. null = sem horário consultado.
export function rotuloHorario(atendeNoHorario: boolean | null): string | null {
  if (atendeNoHorario === null) return null;
  return atendeNoHorario ? "Atendendo agora" : "Fechado agora";
}

/*
 * Cada destinatário é escolhido À MÃO (não existe "selecionar todos": distribuição ampla será das
 * Oportunidades). O teto evita transformar a busca em disparo em massa.
 */
export const MAXIMO_SELECIONADOS = 10;

export function alternarSelecionado(selecionados: readonly string[], identidadeId: string): string[] {
  if (selecionados.includes(identidadeId)) return selecionados.filter((id) => id !== identidadeId);
  if (selecionados.length >= MAXIMO_SELECIONADOS) return [...selecionados];
  return [...selecionados, identidadeId];
}

/**
 * Agindo como EMPRESA, o local já cadastrado é a BASE da empresa (a de Logística → Operação da base),
 * e só com o ponto confirmado. Nunca os locais pessoais de quem opera.
 */
export function localSalvoDaBaseEmpresa(base: BaseEmpresa | null, nomeEmpresa: string): LocalSalvo[] {
  if (!base || base.latitude === null || base.longitude === null || base.localizacaoConfirmadaEm === null) return [];
  return [
    {
      chave: "base-empresa",
      rotulo: `Base de ${nomeEmpresa}`,
      descricao: `${formatarEnderecoResumido(base)} – ${base.bairro}, ${base.cidade}/${base.uf}`,
      coordenadas: { latitude: base.latitude, longitude: base.longitude },
    },
  ];
}
