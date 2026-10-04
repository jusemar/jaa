import type { ParticipanteConversa, SituacaoBloqueio } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { MenuAcoes } from "@/components/ui/menu-acoes";
import { obterSituacaoBloqueio } from "../lib/api-bloqueios";

/*
 * AÇÕES DA CONVERSA — as mesmas da Web, no mesmo menu para a LISTA (toque longo na conversa) e para o
 * CABEÇALHO da conversa aberta:
 *
 * - Limpar conversa / Apagar conversa: estado SÓ de quem executa (o outro não perde nada);
 * - Bloquear/Desbloquear usuário: só com PESSOA. A opção vem do servidor ao abrir: "Desbloquear" só
 *   para quem criou o bloqueio.
 */
export type AcaoConversa = "limpar" | "apagar" | "bloquear" | "desbloquear";

export interface AlvoAcaoConversa {
  id: string;
  outraIdentidade: ParticipanteConversa;
}

export const ROTULO_ACAO: Record<AcaoConversa, string> = {
  limpar: "Limpar conversa",
  apagar: "Apagar conversa",
  bloquear: "Bloquear usuário",
  desbloquear: "Desbloquear usuário",
};

/** Quais ações cabem para esta conversa, dada a situação de bloqueio (null = ainda não sabida). */
export function acoesDisponiveis(tipoOutra: "pessoal" | "empresarial", situacao: SituacaoBloqueio | null): AcaoConversa[] {
  const acoes: AcaoConversa[] = ["limpar", "apagar"];
  if (tipoOutra !== "pessoal" || !situacao?.podeBloquear) return acoes;
  return [...acoes, situacao.euBloqueei ? "desbloquear" : "bloquear"];
}

const EXPLICACAO: Record<AcaoConversa, (nome: string, usuario: string) => { titulo: string; texto: string; botao: string }> = {
  limpar: (nome) => ({ titulo: `Limpar conversa com ${nome}?`, texto: "As mensagens somem só para você. A conversa continua na lista.", botao: "Limpar" }),
  apagar: (nome) => ({ titulo: `Apagar conversa com ${nome}?`, texto: "Ela sai da sua lista só para você. Pedidos e entregas não mudam.", botao: "Apagar" }),
  bloquear: (_, usuario) => ({
    titulo: `Bloquear @${usuario}?`,
    texto: "Vocês não poderão trocar mensagens. Isso não interfere em pedidos ou entregas existentes.",
    botao: "Bloquear",
  }),
  desbloquear: (_, usuario) => ({ titulo: `Desbloquear @${usuario}?`, texto: "Vocês voltam a poder trocar mensagens.", botao: "Desbloquear" }),
};

export function AcoesDaConversa({
  alvo,
  aberto,
  aoFechar,
  aoExecutar,
}: {
  alvo: AlvoAcaoConversa | null;
  aberto: boolean;
  aoFechar: () => void;
  // Executa no servidor; devolve a mensagem de erro, ou null.
  aoExecutar: (acao: AcaoConversa, alvo: AlvoAcaoConversa) => Promise<string | null>;
}) {
  const outra = alvo?.outraIdentidade ?? null;
  const [situacao, setSituacao] = useState<{ de: string; valor: SituacaoBloqueio } | null>(null);

  // A situação de bloqueio é lida ao ABRIR o menu (só com pessoa): nada de uma consulta por linha da lista.
  useEffect(() => {
    if (!aberto || !outra || outra.tipo !== "pessoal") return;
    let ativo = true;
    void obterSituacaoBloqueio(outra.identidadeId).then((resposta) => {
      if (ativo && resposta.ok) setSituacao({ de: outra.identidadeId, valor: resposta.dados });
    });
    return () => {
      ativo = false;
    };
  }, [aberto, outra]);

  if (!alvo || !outra) return null;
  const situacaoAtual = situacao?.de === outra.identidadeId ? situacao.valor : null;

  function confirmar(acao: AcaoConversa, item: AlvoAcaoConversa) {
    const { titulo, texto, botao } = EXPLICACAO[acao](item.outraIdentidade.nomeExibicao, item.outraIdentidade.nomeUsuario);
    Alert.alert(titulo, texto, [
      { text: "Cancelar", style: "cancel" },
      {
        text: botao,
        style: acao === "desbloquear" ? "default" : "destructive",
        onPress: () => {
          void aoExecutar(acao, item).then((erro) => {
            if (erro) Alert.alert("Não foi possível concluir", erro);
          });
        },
      },
    ]);
  }

  return (
    <MenuAcoes
      titulo={`Conversa com ${outra.nomeExibicao}`}
      aberto={aberto}
      aoFechar={aoFechar}
      acoes={acoesDisponiveis(outra.tipo, situacaoAtual).map((acao) => ({
        rotulo: ROTULO_ACAO[acao],
        perigosa: acao === "bloquear" || acao === "apagar",
        executar: () => confirmar(acao, alvo),
      }))}
    />
  );
}
