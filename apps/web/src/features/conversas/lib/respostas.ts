import { PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO } from "@jaa/contratos";

// Regras de APRESENTAÇÃO da referência de resposta. A mensagem original nunca é alterada.

// Autor da mensagem citada: "Você" quando é a própria identidade; senão o nome público da identidade
// (vale igualmente para pessoas, grupos e identidades empresariais no futuro).
export function rotuloAutorResposta(remetenteIdentidadeId: string, nomeExibicao: string, identidadeAtualId: string): string {
  return remetenteIdentidadeId === identidadeAtualId ? "Você" : nomeExibicao;
}

// Mesma regra da API para a prévia do compositor, feita a partir da mensagem já carregada.
// Conta caracteres (code points), não unidades UTF-16, para não partir emojis ao meio.
export function resumirConteudoParaPrevia(conteudo: string): { previaConteudo: string; conteudoTruncado: boolean } {
  const caracteres = [...conteudo];
  const conteudoTruncado = caracteres.length > PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO;
  return {
    previaConteudo: conteudoTruncado ? caracteres.slice(0, PREVIA_MENSAGEM_RESPONDIDA_TAMANHO_MAXIMO).join("") : conteudo,
    conteudoTruncado,
  };
}

export function textoDaPrevia({ previaConteudo, conteudoTruncado }: { previaConteudo: string; conteudoTruncado: boolean }): string {
  return conteudoTruncado ? `${previaConteudo.trimEnd()}…` : previaConteudo;
}
