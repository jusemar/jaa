import type { Avisador } from "@/components/ui/avisos";
import type { ResultadoApi } from "@/lib/api";

/**
 * Executa uma mutação e dá o FEEDBACK certo: sucesso só quando há mensagem (ação importante
 * concluída), erro sempre. Sem resposta do servidor (status 0) a mensagem diz isso de forma curta.
 * O avisador é injetado: a regra é testável sem navegador.
 */
export async function executarComFeedback<T>(requisicao: Promise<ResultadoApi<T>>, sucesso: string | undefined, avisador: Avisador): Promise<ResultadoApi<T>> {
  const resposta = await requisicao;
  if (resposta.ok) {
    if (sucesso) avisador.sucesso(sucesso);
  } else {
    avisador.erro(resposta.status === 0 ? "Sem conexão. Tente de novo." : resposta.mensagem);
  }
  return resposta;
}
