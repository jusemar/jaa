import type { Banco } from "@jaa/banco";
import { podeVer } from "@jaa/contratos";
import { buscarExcecao, buscarPerfil, ehContatoDe } from "../repositorios/repositorio-perfil.js";

/**
 * "Esta identidade pode ver a PRESENÇA daquela?"
 *
 * A decisão é do DONO da presença (as preferências dele) e é resolvida UMA vez, quando o observador
 * começa a observar a conversa. Quem não pode ver simplesmente não entra na sala de presença daquela
 * identidade — então nenhum evento futuro precisa ser filtrado de novo, e não há consulta ao banco a
 * cada mudança de presença.
 *
 * Invisível é absoluto: quem escolheu ficar invisível não aparece como online para ninguém.
 */
export async function presencaVisivelPara(banco: Banco, donoId: string, observadorId: string): Promise<boolean> {
  if (donoId === observadorId) return true;

  const dono = await buscarPerfil(banco, donoId);
  if (!dono) return false;
  if (dono.preferencias.statusEscolhido === "invisivel") return false;

  const visibilidade = dono.preferencias.visibilidadePresenca;
  // "todos" não depende da agenda: evita a consulta de contato no caso mais comum.
  if (visibilidade === "todos") return (await buscarExcecao(banco, donoId, observadorId)) !== "bloquear";

  const [ehContato, excecao] = await Promise.all([ehContatoDe(banco, donoId, observadorId), buscarExcecao(banco, donoId, observadorId)]);
  return podeVer({ visibilidade, ehContato, excecao });
}

/** Filtra, de uma vez, quem o observador pode ver. Conversa direta tem um participante só. */
export async function presencasVisiveis(banco: Banco, donosIds: string[], observadorId: string): Promise<string[]> {
  const decisoes = await Promise.all(donosIds.map(async (id) => ({ id, visivel: await presencaVisivelPara(banco, id, observadorId) })));
  return decisoes.filter((decisao) => decisao.visivel).map((decisao) => decisao.id);
}
