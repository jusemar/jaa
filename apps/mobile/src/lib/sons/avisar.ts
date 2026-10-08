import { criarMemoriaDeEventos, type NomeDoSom } from "./identidade-sonora";
import { tocarSom } from "./tocar-som";

// Uma memória por som, para o app inteiro: sobrevive à troca de tela, ao rerender e à reconexão.
const memorias = new Map<NomeDoSom, ReturnType<typeof criarMemoriaDeEventos>>();

/**
 * Toca o som de um ACONTECIMENTO no máximo uma vez. `id` identifica o acontecimento (a mensagem, o
 * pedido, a parada): chamar de novo com o mesmo id não toca. Devolve true quando tocou agora.
 */
export function avisarUmaVez(nome: NomeDoSom, id: string): boolean {
  let memoria = memorias.get(nome);
  if (!memoria) {
    memoria = criarMemoriaDeEventos();
    memorias.set(nome, memoria);
  }
  if (!memoria.registrar(id)) return false;
  tocarSom(nome);
  return true;
}
