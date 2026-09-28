import type { PerfilProfissionalDoDono, RespostaPerfilProfissional } from "@jaa/contratos";
import type { ResultadoApi } from "@/lib/api";

export interface OpcoesAplicar {
  // Mensagem de SUCESSO (toast). Ausente = ação sem aviso de sucesso (o erro sempre avisa).
  sucesso?: string;
  // Qual ação está em andamento: o botão dela mostra "Salvando…".
  chave?: string;
}

/**
 * Executa uma mutação do perfil e troca o estado da tela pela resposta do servidor (a autoridade).
 * Enquanto uma mutação roda, as outras ficam bloqueadas (sem envio duplicado). Devolve o perfil
 * atualizado, ou null se a API recusou.
 */
export type Aplicar = (requisicao: Promise<ResultadoApi<RespostaPerfilProfissional>>, opcoes?: OpcoesAplicar) => Promise<PerfilProfissionalDoDono | null>;

export interface PropsEtapa {
  perfil: PerfilProfissionalDoDono;
  aplicar: Aplicar;
  // Chave da ação em andamento (null = nenhuma).
  pendente: string | null;
}
