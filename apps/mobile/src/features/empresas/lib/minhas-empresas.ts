/*
 * Textos e a checagem mínima do formulário de "Minhas empresas". Papel e status vêm do servidor: aqui
 * só viram palavras. Valor que o app ainda não conhece é mostrado como veio.
 */
export const ROTULO_PAPEL: Record<string, string> = { proprietario: "Proprietário" };

export const ROTULO_STATUS_EMPRESA: Record<string, string> = { ativa: "Ativa" };

/** Os três campos preenchidos: o formato (do @usuario e do endereço) quem confere é o servidor. */
export function formularioEmpresaPronto({ nome, nomeUsuario, slug }: { nome: string; nomeUsuario: string; slug: string }): boolean {
  return nome.trim() !== "" && nomeUsuario.trim() !== "" && slug.trim() !== "";
}
