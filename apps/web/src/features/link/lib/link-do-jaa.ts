import { nomeUsuarioSchema } from "@jaa/contratos";

/*
 * LINK DO JAA de uma identidade: `https://<site do Jaa>/@usuario`.
 *
 * O @usuario é o endereço público que a identidade já tem (único entre pessoas e empresas, e sem rota
 * que o altere), então o link não precisa de tabela nova nem expõe id interno. O link é só o CAMINHO
 * `/@usuario` no próprio site: nenhum parâmetro de "voltar para", logo não há como apontá-lo para fora.
 */
export function caminhoDoLink(nomeUsuario: string): string {
  return `/@${nomeUsuario}`;
}

export function linkDoJaa(origem: string, nomeUsuario: string): string {
  return `${origem.replace(/\/+$/, "")}${caminhoDoLink(nomeUsuario)}`;
}

/**
 * Segmento do endereço (`@pizzaria`, ou `%40pizzaria` como alguns aplicativos enviam) → @usuario
 * canônico. Qualquer coisa que não seja exatamente "@" + um @usuario válido devolve null: endereço
 * de outro site, caminho com barra, id interno, etc. não viram destino.
 */
export function nomeUsuarioDoSegmento(segmento: string): string | null {
  let texto: string;
  try {
    texto = decodeURIComponent(segmento);
  } catch {
    return null;
  }
  if (!texto.startsWith("@") || texto.slice(1).includes("@")) return null;
  const nomeUsuario = nomeUsuarioSchema.safeParse(texto.slice(1));
  return nomeUsuario.success ? nomeUsuario.data : null;
}

/** Para onde a pessoa vai DEPOIS de entrar: sempre uma conversa do próprio Jaa, nunca um endereço. */
export interface DestinoDoLink {
  nomeUsuario: string;
  // Nome para a frase da entrada ("continue com Pizzaria X"); o destino em si é só o @usuario.
  nomeExibicao?: string;
  // Empresa com cardápio: a conversa abre já com o cardápio à mostra.
  abrirCardapio: boolean;
}
