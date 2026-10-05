import { DIAS_SEMANA, ROTULO_DIA_SEMANA, horariosDoDiaEmTexto, type DiaSemana, type FuncionamentoPublico } from "@jaa/contratos";

/*
 * ABERTA OU FECHADA no app: só APRESENTAÇÃO do que o servidor informou.
 *
 * O Mobile não compara horário nem monta frase: `estado.resumo` ("Fechado · abre amanhã às 08:00") e
 * `estado.aviso` ("Esta empresa está fechada agora. Abre amanhã às 08:00.") vêm prontos da regra
 * central (`calcularFuncionamento`, que roda no servidor com o fuso da empresa). Aqui só se decide o
 * que mostrar e o que um toque faz.
 */

/** Por que não dá para pedir agora — ou null quando dá (aberta, sem controle de horário ou ainda sem resposta). */
export function motivoDoBloqueio(funcionamento: FuncionamentoPublico | null | undefined): string | null {
  if (!funcionamento || funcionamento.estado.abertoAgora) return null;
  return funcionamento.estado.aviso ?? "Esta empresa está fechada agora.";
}

/** A linha do topo do cardápio. Empresa que não controla horário não mostra nada. */
export function selo(funcionamento: FuncionamentoPublico | null | undefined): { aberto: boolean; texto: string } | null {
  if (!funcionamento || !funcionamento.estado.controlado || !funcionamento.estado.resumo) return null;
  return { aberto: funcionamento.estado.abertoAgora, texto: funcionamento.estado.resumo };
}

export interface LinhaDaSemana {
  dia: DiaSemana;
  rotulo: string;
  // "08:00–14:00 · 18:00–23:00" ou "Fechado".
  horarios: string;
  fechado: boolean;
  hoje: boolean;
}

/** Segunda a domingo, com os períodos de cada dia como a empresa cadastrou. */
export function semanaDeFuncionamento(funcionamento: FuncionamentoPublico): LinhaDaSemana[] {
  return DIAS_SEMANA.map((dia) => {
    const horarios = horariosDoDiaEmTexto(funcionamento.semana, dia);
    return { dia, rotulo: ROTULO_DIA_SEMANA[dia], horarios, fechado: horarios === "Fechado", hoje: dia === funcionamento.hoje };
  });
}

/** Por que não dá para pedir agora, e como mostrar isso a quem tocar na ação. */
export interface BloqueioDePedido {
  motivo: string;
  aoExplicar: () => void;
}

/**
 * AÇÃO INDISPONÍVEL QUE EXPLICA. Com bloqueio, o toque chama a explicação e a ação real não roda; sem
 * ele, executa. O botão não fica `disabled` (um botão desabilitado engole o toque e a pessoa não sabe
 * por quê): ele só PARECE indisponível.
 */
export function acaoOuExplicacao(bloqueio: BloqueioDePedido | null | undefined, acao: () => void): () => void {
  return bloqueio ? bloqueio.aoExplicar : acao;
}

/** A recusa do servidor ao confirmar: a empresa fechou entre montar o carrinho e confirmar. */
export function ehEmpresaFechada(resultado: { ok: boolean; codigo?: string | null }): boolean {
  return !resultado.ok && resultado.codigo === "EMPRESA_FECHADA";
}
