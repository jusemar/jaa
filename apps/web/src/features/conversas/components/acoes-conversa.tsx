"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ParticipanteConversa, SituacaoBloqueio } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { obterSituacaoBloqueio } from "../lib/api-bloqueios";

/*
 * AÇÕES DA CONVERSA: um MENU só, acessível (Radix: foco, teclado, Esc, leitor de tela), usado na
 * LISTA (botão "⋯" e BOTÃO DIREITO sobre a conversa) e no CABEÇALHO da conversa aberta — o mesmo
 * componente, as mesmas ações, a mesma confirmação.
 *
 * - Limpar conversa / Apagar conversa: estado SÓ de quem executa (o outro não perde nada);
 * - Bloquear/Desbloquear usuário: só com PESSOA (bloqueio de empresa não existe no domínio). A opção
 *   vem do servidor ao abrir: "Desbloquear" só para quem criou o bloqueio — o bloqueio do outro não é
 *   seu para desfazer (nesse caso continua valendo criar o seu).
 */

export type AcaoConversa = "limpar" | "apagar" | "bloquear" | "desbloquear";

// O que as ações precisam saber da conversa (serve ao item da lista e à conversa aberta).
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

export function MenuAcoesConversa({
  item,
  aberto,
  aoMudarAberto,
  aoEscolher,
}: {
  item: AlvoAcaoConversa;
  // Controlado por fora: o botão direito sobre a linha abre ESTE mesmo menu.
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  aoEscolher: (acao: AcaoConversa) => void;
}) {
  const outra = item.outraIdentidade;
  const [situacao, setSituacao] = useState<{ de: string; valor: SituacaoBloqueio } | null>(null);

  /*
   * A situação de bloqueio é lida SEMPRE que o menu fica aberto — por qualquer caminho ("⋯", botão
   * direito ou cabeçalho). Antes ela só era lida no `onOpenChange` do Radix, que não roda quando o menu
   * é aberto por fora (botão direito): o menu abria sem saber do bloqueio e escondia "Bloquear".
   * Só com PESSOA, e só ao abrir: nada de uma consulta por linha da lista.
   */
  useEffect(() => {
    if (!aberto || outra.tipo !== "pessoal") return;
    let ativo = true;
    void obterSituacaoBloqueio(outra.identidadeId).then((resposta) => {
      if (ativo && resposta.ok) setSituacao({ de: outra.identidadeId, valor: resposta.dados });
    });
    return () => {
      ativo = false;
    };
  }, [aberto, outra.identidadeId, outra.tipo]);

  const situacaoAtual = situacao?.de === outra.identidadeId ? situacao.valor : null;
  const carregando = aberto && outra.tipo === "pessoal" && situacaoAtual === null;

  return (
    <DropdownMenu.Root open={aberto} onOpenChange={aoMudarAberto} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-opcoes-conversa={item.id}
          aria-label={`Opções da conversa com ${outra.nomeExibicao}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-base leading-none text-conteudo-suave hover:bg-realce focus-visible:outline-2"
        >
          ⋯
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          data-menu-conversa={item.id}
          className="z-[1100] min-w-44 rounded-jaa border border-borda bg-superficie p-1 text-sm shadow-suave"
        >
          {acoesDisponiveis(outra.tipo, situacaoAtual).map((acao) => (
            <DropdownMenu.Item
              key={acao}
              data-acao-conversa={acao}
              onSelect={() => aoEscolher(acao)}
              className={`cursor-pointer rounded-jaa-compacto px-3 py-2 outline-none data-[highlighted]:bg-realce ${acao === "bloquear" || acao === "apagar" ? "text-perigo" : "text-conteudo"}`}
            >
              {ROTULO_ACAO[acao]}
            </DropdownMenu.Item>
          ))}
          {carregando && (
            <DropdownMenu.Item disabled className="px-3 py-2 text-xs text-conteudo-suave">
              Carregando…
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
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

export function ConfirmarAcaoConversa({
  acao,
  item,
  ocupado,
  erro,
  aoConfirmar,
  aoCancelar,
}: {
  acao: AcaoConversa;
  item: AlvoAcaoConversa;
  ocupado: boolean;
  erro: string | null;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const { titulo, texto, botao } = EXPLICACAO[acao](item.outraIdentidade.nomeExibicao, item.outraIdentidade.nomeUsuario);
  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/30 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="titulo-acao-conversa" data-confirmar-acao={acao} className="flex w-full max-w-sm flex-col gap-3 rounded-jaa border border-borda bg-superficie p-4 shadow-suave">
        <p id="titulo-acao-conversa" className="font-semibold text-conteudo">
          {titulo}
        </p>
        <p className="text-sm text-conteudo-suave">{texto}</p>
        {erro && (
          <p role="alert" className="text-xs text-perigo">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={ocupado} onClick={aoCancelar} className="rounded-full border border-borda px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            type="button"
            data-confirmar-acao-sim
            disabled={ocupado}
            onClick={aoConfirmar}
            className={`rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${acao === "desbloquear" || acao === "limpar" ? "bg-marca" : "bg-perigo"}`}
          >
            {ocupado ? "Aguarde…" : botao}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * MENU + CONFIRMAÇÃO prontos para qualquer lugar (lista e cabeçalho). Quem executa é `aoExecutar`, a
 * MESMA função do mensageiro para todos os pontos de entrada — as regras ficam no servidor.
 * `aberto`/`aoMudarAberto` permitem abrir por fora (botão direito na lista); sem eles, o próprio "⋯".
 */
export function AcoesDaConversa({
  alvo,
  aoExecutar,
  aberto,
  aoMudarAberto,
}: {
  alvo: AlvoAcaoConversa;
  aoExecutar: (acao: AcaoConversa, alvo: AlvoAcaoConversa) => Promise<string | null>;
  aberto?: boolean | undefined;
  aoMudarAberto?: ((aberto: boolean) => void) | undefined;
}) {
  const [abertoInterno, setAbertoInterno] = useState(false);
  const [confirmacao, setConfirmacao] = useState<AcaoConversa | null>(null);
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!confirmacao) return;
    setExecutando(true);
    const falha = await aoExecutar(confirmacao, alvo);
    setExecutando(false);
    setErro(falha);
    if (!falha) setConfirmacao(null);
  }

  return (
    <>
      <MenuAcoesConversa
        item={alvo}
        aberto={aberto ?? abertoInterno}
        aoMudarAberto={aoMudarAberto ?? setAbertoInterno}
        aoEscolher={(acao) => {
          setErro(null);
          setConfirmacao(acao);
        }}
      />
      {confirmacao && (
        <ConfirmarAcaoConversa
          acao={confirmacao}
          item={alvo}
          ocupado={executando}
          erro={erro}
          aoConfirmar={() => void confirmar()}
          aoCancelar={() => setConfirmacao(null)}
        />
      )}
    </>
  );
}
