import type { EstadoMensagem, Mensagem } from "@jaa/contratos";
import { formatarDataHoraCompleta, formatarHorarioMensagem } from "../lib/horarios";
import { rotuloAutorResposta } from "../lib/respostas";
import { CardPedido } from "@/features/pedidos/components/apresentacao-pedido";
import { MenuMensagem, type AcaoMensagem } from "./menu-mensagem";
import { ReferenciaResposta } from "./referencia-resposta";

// Interface TÉCNICA: cada mensagem carrega o SEU horário (criadoEm do servidor) no canto inferior
// direito do balão; nas próprias, o estado fica junto ao horário. Respostas mostram a referência
// compacta no topo do balão, com os dados vindos da API (sem depender da original estar carregada).

const ROTULO_ESTADO: Record<EstadoMensagem, string> = { enviada: "Enviada", entregue: "Entregue", lida: "Lida" };

export function BalaoMensagem({
  mensagem,
  identidadeAtualId,
  nomeRemetente,
  aoResponder,
  aoEditar,
  aoExcluirParaMim,
  aoExcluirParaTodos,
  aoAbrirPedido,
}: {
  mensagem: Mensagem;
  identidadeAtualId: string;
  nomeRemetente: string;
  aoResponder?: (mensagem: Mensagem) => void;
  aoEditar?: (mensagem: Mensagem) => void;
  aoExcluirParaMim?: (mensagem: Mensagem) => void;
  aoExcluirParaTodos?: (mensagem: Mensagem) => void;
  aoAbrirPedido?: (pedidoId: string) => void;
}) {
  const propria = mensagem.remetenteIdentidadeId === identidadeAtualId;
  const excluida = mensagem.excluidaEm !== null;
  const referencia = excluida ? null : mensagem.mensagemRespondida;
  // Só o autor edita ou exclui para todos; tombstone só pode ser escondido "para mim" (a API também impõe).
  const acoes: AcaoMensagem[] = [];
  const ehPedido = mensagem.tipo === "pedido" && mensagem.pedido !== null;
  // Card de pedido não é texto: não se edita nem se responde (o pedido em si tem sua própria tela).
  if (propria && !excluida && !ehPedido && aoEditar) acoes.push({ rotulo: "Editar", executar: () => aoEditar(mensagem) });
  if (aoExcluirParaMim) acoes.push({ rotulo: "Excluir para mim", executar: () => aoExcluirParaMim(mensagem), perigosa: true });
  if (propria && !excluida && aoExcluirParaTodos) {
    acoes.push({ rotulo: "Excluir para todos", executar: () => aoExcluirParaTodos(mensagem), perigosa: true });
  }
  const menu = <MenuMensagem acoes={acoes} />;

  const acaoResponder = aoResponder && !excluida && !ehPedido && (
    <button
      type="button"
      aria-label="Responder"
      title="Responder"
      onClick={() => aoResponder(mensagem)}
      className="shrink-0 self-center rounded px-1.5 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus:text-zinc-700"
    >
      ↩
    </button>
  );

  return (
    <li
      data-mensagem-id={mensagem.id}
      data-propria={propria}
      data-resposta={referencia !== null}
      data-excluida={excluida}
      className={`flex items-end gap-1 ${propria ? "justify-end" : "justify-start"}`}
    >
      {propria && menu}
      {propria && acaoResponder}
      <div className={`min-w-0 max-w-[80%] rounded-lg px-3 py-1.5 ${propria ? "bg-emerald-100" : "bg-zinc-100"}`}>
        <span className="sr-only">{propria ? "Você" : nomeRemetente}: </span>
        {referencia && (
          <div className="mb-1">
            <ReferenciaResposta
              nomeAutor={rotuloAutorResposta(referencia.remetente.identidadeId, referencia.remetente.nomeExibicao, identidadeAtualId)}
              previaConteudo={referencia.previaConteudo}
              conteudoTruncado={referencia.conteudoTruncado}
              excluida={referencia.excluida}
            />
          </div>
        )}
        {excluida ? (
          <span data-conteudo-excluido className="italic text-zinc-500">
            Mensagem excluída
          </span>
        ) : ehPedido && mensagem.pedido ? (
          <CardPedido pedido={mensagem.pedido} aoAbrir={(pedidoId) => aoAbrirPedido?.(pedidoId)} />
        ) : (
          <span data-conteudo className="whitespace-pre-wrap [overflow-wrap:anywhere]">
            {mensagem.conteudo}
          </span>
        )}
        <span data-rodape className="float-right ml-3 mt-1.5 inline-flex items-center gap-1 text-[11px] leading-none text-zinc-500">
          {mensagem.editadaEm && !excluida && (
            <span data-editada title={`Editada em ${formatarDataHoraCompleta(mensagem.editadaEm)}`} className="italic">
              editada
            </span>
          )}
          <time dateTime={mensagem.criadoEm} title={formatarDataHoraCompleta(mensagem.criadoEm)}>
            {formatarHorarioMensagem(mensagem.criadoEm)}
          </time>
          {propria && !excluida && (
            <span
              data-estado={mensagem.estado}
              role="img"
              aria-label={ROTULO_ESTADO[mensagem.estado]}
              title={ROTULO_ESTADO[mensagem.estado]}
              className={mensagem.estado === "lida" ? "text-blue-600" : undefined}
            >
              {mensagem.estado === "enviada" ? "✓" : "✓✓"}
            </span>
          )}
        </span>
      </div>
      {!propria && acaoResponder}
      {!propria && menu}
    </li>
  );
}
