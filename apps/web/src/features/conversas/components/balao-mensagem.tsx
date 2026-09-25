import type { EstadoMensagem, Mensagem } from "@jaa/contratos";
import {
  IconeCheck,
  IconeCheckDuplo,
  IconeVoltar as IconeResponder,
} from "@/components/ui/icones";
import {
  formatarDataHoraCompleta,
  formatarHorarioMensagem,
} from "../lib/horarios";
import { rotuloAutorResposta } from "../lib/respostas";
import { CardPedido } from "@/features/pedidos/components/apresentacao-pedido";
import { MenuMensagem, type AcaoMensagem } from "./menu-mensagem";
import { ReferenciaResposta } from "./referencia-resposta";

/*
 * BALÃO no padrão da referência de UI/UX aprovada: cartão de cantos suaves com sombra curta, horário
 * (e o estado ✓/✓✓, nas próprias) numa linha alinhada à direita DENTRO do balão.
 *
 * Próprias em VERDE CLARO com texto escuro, recebidas em BRANCO — como na referência. Verde claro em
 * vez de jade cheio porque texto escuro sobre fundo claro lê melhor em mensagem longa, e o estado
 * (✓✓) aparece em jade sem competir com o texto.
 *
 * As ações (responder, ⋯) ficam fora do balão e só aparecem no hover/foco da linha: na referência elas
 * não existiam, e deixá-las sempre visíveis polui uma tela que é, antes de tudo, de leitura.
 */

const ROTULO_ESTADO: Record<EstadoMensagem, string> = {
  enviada: "Enviada",
  entregue: "Entregue",
  lida: "Lida",
};

export function BalaoMensagem({
  mensagem,
  identidadeAtualId,
  nomeRemetente,
  aoResponder,
  aoEditar,
  aoExcluirParaMim,
  aoExcluirParaTodos,
  aoAbrirPedido,
  visaoCliente = false,
}: {
  mensagem: Mensagem;
  identidadeAtualId: string;
  nomeRemetente: string;
  aoResponder?: (mensagem: Mensagem) => void;
  aoEditar?: (mensagem: Mensagem) => void;
  aoExcluirParaMim?: (mensagem: Mensagem) => void;
  aoExcluirParaTodos?: (mensagem: Mensagem) => void;
  aoAbrirPedido?: (pedidoId: string) => void;
  visaoCliente?: boolean;
}) {
  const propria = mensagem.remetenteIdentidadeId === identidadeAtualId;
  const excluida = mensagem.excluidaEm !== null;
  const referencia = excluida ? null : mensagem.mensagemRespondida;
  // Só o autor edita ou exclui para todos; tombstone só pode ser escondido "para mim" (a API também impõe).
  const acoes: AcaoMensagem[] = [];
  const ehPedido = mensagem.tipo === "pedido" && mensagem.pedido !== null;
  // Card de pedido não é texto: não se edita nem se responde (o pedido em si tem sua própria tela).
  if (propria && !excluida && !ehPedido && aoEditar)
    acoes.push({ rotulo: "Editar", executar: () => aoEditar(mensagem) });
  if (aoExcluirParaMim)
    acoes.push({
      rotulo: "Excluir para mim",
      executar: () => aoExcluirParaMim(mensagem),
      perigosa: true,
    });
  if (propria && !excluida && aoExcluirParaTodos) {
    acoes.push({
      rotulo: "Excluir para todos",
      executar: () => aoExcluirParaTodos(mensagem),
      perigosa: true,
    });
  }
  const menu = <MenuMensagem acoes={acoes} />;

  const acaoResponder = aoResponder && !excluida && !ehPedido && (
    <button
      type="button"
      aria-label="Responder"
      title="Responder"
      onClick={() => aoResponder(mensagem)}
      className="grid h-8 w-8 shrink-0 self-center place-items-center rounded-jaa-compacto text-conteudo-suave/70 opacity-0 transition-opacity hover:bg-realce hover:text-conteudo focus-visible:opacity-100 group-hover:opacity-100"
    >
      <IconeResponder className="h-4 w-4" />
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
        // Raios como na referência: o balão próprio é um pouco mais arredondado que o recebido.
        className={`flex min-w-0 max-w-[86%] flex-col gap-1 px-4 py-3 text-sm leading-[1.45] shadow-balao sm:max-w-[min(72%,38rem)] ${
          propria
            ? "rounded-jaa bg-mensagem-enviada text-mensagem-enviada-conteudo"
            : "rounded-jaa-compacto bg-mensagem-recebida text-conteudo"
        }`}
      >
        <span className="sr-only">{propria ? "Você" : nomeRemetente}: </span>

        {referencia && (
          <div className="mb-1.5">
            <ReferenciaResposta
              nomeAutor={rotuloAutorResposta(
                referencia.remetente.identidadeId,
                referencia.remetente.nomeExibicao,
                identidadeAtualId,
              )}
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
          <CardPedido
            pedido={mensagem.pedido}
            aoAbrir={(pedidoId) => aoAbrirPedido?.(pedidoId)}
            visaoCliente={visaoCliente}
          />
        ) : (
          <span
            data-conteudo
            className="whitespace-pre-wrap [overflow-wrap:anywhere]"
          >
            {mensagem.conteudo}
          </span>
        )}

        {/* Rodapé do balão: horário à direita e, nas próprias, o estado em jade ao lado dele. */}
        <span
          data-rodape
          className={`flex items-center gap-1 self-end text-[10px] leading-none ${propria ? "text-marca" : "text-conteudo-suave"}`}
        >
          {mensagem.editadaEm && !excluida && (
            <span
              data-editada
              title={`Editada em ${formatarDataHoraCompleta(mensagem.editadaEm)}`}
              className="italic"
            >
              editada
            </span>
          )}
          <time
            dateTime={mensagem.criadoEm}
            title={formatarDataHoraCompleta(mensagem.criadoEm)}
          >
            {formatarHorarioMensagem(mensagem.criadoEm)}
          </time>
          {propria && !excluida && (
            <span
              data-estado={mensagem.estado}
              role="img"
              aria-label={ROTULO_ESTADO[mensagem.estado]}
              title={ROTULO_ESTADO[mensagem.estado]}
            >
              {mensagem.estado === "enviada" ? (
                <IconeCheck className="h-3 w-3" />
              ) : (
                <IconeCheckDuplo className="h-3.5 w-3.5" />
              )}
            </span>
          )}
        </span>
      </div>

      {!propria && acaoResponder}
      {!propria && menu}
    </li>
  );
}
