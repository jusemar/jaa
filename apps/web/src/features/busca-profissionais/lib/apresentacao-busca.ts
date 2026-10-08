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
 * Os destinatários são escolhidos por quem pesquisa — um a um ou com "Selecionar todos". O TETO vale
 * nos dois casos e evita transformar a busca em disparo em massa (distribuição ampla será das
 * Oportunidades).
 */
export const MAXIMO_SELECIONADOS = 10;

export function alternarSelecionado(selecionados: readonly string[], identidadeId: string): string[] {
  if (selecionados.includes(identidadeId)) return selecionados.filter((id) => id !== identidadeId);
  if (selecionados.length >= MAXIMO_SELECIONADOS) return [...selecionados];
  return [...selecionados, identidadeId];
}

export type EstadoSelecionarTodos = "todos" | "alguns" | "nenhum";

/**
 * Estado do "Selecionar todos" para a lista EXIBIDA. "Todos" = tudo o que cabe está marcado: a lista
 * inteira ou, se ela passa do teto, o teto. Desmarcar um só já deixa de ser "todos".
 */
export function estadoSelecionarTodos(exibidos: readonly string[], selecionados: readonly string[]): EstadoSelecionarTodos {
  const marcados = exibidos.filter((id) => selecionados.includes(id)).length;
  if (marcados === 0) return "nenhum";
  return marcados >= Math.min(exibidos.length, MAXIMO_SELECIONADOS) ? "todos" : "alguns";
}

/**
 * Toque em "Selecionar todos": com tudo marcado, desmarca tudo; senão, mantém quem já estava marcado
 * e completa com os próximos da lista, na ordem exibida, ATÉ O TETO.
 */
export function alternarTodos(exibidos: readonly string[], selecionados: readonly string[]): string[] {
  if (estadoSelecionarTodos(exibidos, selecionados) === "todos") return [];
  const mantidos = exibidos.filter((id) => selecionados.includes(id));
  const restantes = exibidos.filter((id) => !selecionados.includes(id));
  return [...mantidos, ...restantes].slice(0, MAXIMO_SELECIONADOS);
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
