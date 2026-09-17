import type { EstadoMensagem, Mensagem } from "@jaa/contratos";
import { formatarDataHoraCompleta, formatarHorarioMensagem } from "../lib/horarios";
import { rotuloAutorResposta } from "../lib/respostas";
import { CardPedido } from "@/features/pedidos/components/apresentacao-pedido";
import { MenuMensagem, type AcaoMensagem } from "./menu-mensagem";
import { ReferenciaResposta } from "./referencia-resposta";

/*
 * BALÃO no padrão da referência de UI/UX aprovada: cantos arredondados com UM canto "preso" do lado
 * de quem falou, horário dentro do balão no canto inferior direito e, nas próprias, o estado (✓/✓✓)
 * ao lado do horário. Enviadas em jade; recebidas em branco.
 *
 * As ações (responder, ⋯) ficam fora do balão e só aparecem no hover/foco da linha: no protótipo elas
 * não existiam, e deixá-las sempre visíveis polui uma tela que é, antes de tudo, de leitura.
 */

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
      className="shrink-0 self-center rounded-full px-2 py-1 text-sm text-conteudo-suave/60 opacity-0 transition-opacity hover:bg-superficie-suave hover:text-conteudo focus-visible:opacity-100 group-hover:opacity-100"
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
      className={`mensagem-entrando group flex items-end gap-1 ${propria ? "justify-end" : "justify-start"}`}
    >
      {propria && menu}
      {propria && acaoResponder}

      <div
        className={`relative min-w-0 max-w-[82%] px-3.5 pb-5 pt-2.5 text-[0.91rem] leading-[1.45] shadow-balao md:max-w-[min(68%,38rem)] ${
          propria
            ? "rounded-[1.15rem_1.15rem_0.3rem_1.15rem] bg-mensagem-enviada text-mensagem-enviada-conteudo"
            : "rounded-[1.15rem_1.15rem_1.15rem_0.3rem] bg-mensagem-recebida text-conteudo"
        }`}
      >
        <span className="sr-only">{propria ? "Você" : nomeRemetente}: </span>

        {referencia && (
          <div className="mb-1.5">
            <ReferenciaResposta
              nomeAutor={rotuloAutorResposta(referencia.remetente.identidadeId, referencia.remetente.nomeExibicao, identidadeAtualId)}
              previaConteudo={referencia.previaConteudo}
              conteudoTruncado={referencia.conteudoTruncado}
              excluida={referencia.excluida}
              emBalaoProprio={propria}
            />
          </div>
        )}

        {excluida ? (
          <span data-conteudo-excluido className="italic opacity-70">
            Mensagem excluída
          </span>
        ) : ehPedido && mensagem.pedido ? (
          <CardPedido pedido={mensagem.pedido} aoAbrir={(pedidoId) => aoAbrirPedido?.(pedidoId)} />
        ) : (
          <span data-conteudo className="whitespace-pre-wrap [overflow-wrap:anywhere]">
            {mensagem.conteudo}
          </span>
        )}

        <span data-rodape className="absolute bottom-1.5 right-3 flex items-center gap-1 text-[0.61rem] leading-none opacity-70">
          {mensagem.editadaEm && !excluida && (
            <span data-editada title={`Editada em ${formatarDataHoraCompleta(mensagem.editadaEm)}`} className="italic">
              editada
            </span>
          )}
          <time dateTime={mensagem.criadoEm} title={formatarDataHoraCompleta(mensagem.criadoEm)}>
            {formatarHorarioMensagem(mensagem.criadoEm)}
          </time>
          {propria && !excluida && (
            <span data-estado={mensagem.estado} role="img" aria-label={ROTULO_ESTADO[mensagem.estado]} title={ROTULO_ESTADO[mensagem.estado]} className={mensagem.estado === "lida" ? "opacity-100" : undefined}>
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
