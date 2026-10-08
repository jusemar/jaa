/*
 * LINK PÚBLICO da identidade (pessoa ou empresa): `https://<site do Jaaa>/@usuario` — a MESMA regra
 * da Web (`link-do-jaa.ts`). É o endereço do PRÓPRIO perfil: abre a conversa com aquela identidade
 * no navegador. Não existe outro padrão de URL nem id interno no endereço.
 *
 * O app não tem "o site em que estou": o endereço do site vem de `EXPO_PUBLIC_JAA_SITE_URL` (valor
 * público). Em desenvolvimento local, sem a variável, usa o computador de onde o Metro serve o app,
 * na porta da Web — o mesmo critério da URL da API. Sem endereço conhecido não se inventa link.
 */
const PORTA_WEB_LOCAL = 3334;

export function caminhoDoLink(nomeUsuario: string): string {
  return `/@${nomeUsuario}`;
}

export function linkPublico(origem: string, nomeUsuario: string): string {
  return `${origem.replace(/\/+$/, "")}${caminhoDoLink(nomeUsuario)}`;
}

/** Endereço do site: configurado; senão (só em desenvolvimento) o host do bundler; senão null. */
export function origemDoSite({ configurada, emDesenvolvimento, hostDoBundler }: { configurada: string | undefined; emDesenvolvimento: boolean; hostDoBundler: string | null }): string | null {
  const limpa = configurada?.trim();
  if (limpa && /^https?:\/\/[^\s/]+/i.test(limpa)) return limpa.replace(/\/+$/, "");
  if (!emDesenvolvimento || !hostDoBundler) return null;
  return `http://${hostDoBundler}:${PORTA_WEB_LOCAL}`;
}
