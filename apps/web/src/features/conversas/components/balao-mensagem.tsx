import { useState } from "react";
import type { EstadoMensagem, Mensagem } from "@jaa/contratos";
import {
  IconeCheck,
  IconeCheckDuplo,
  IconeLapis,
  IconeLixeira,
  IconeResponder,
} from "@/components/ui/icones";
import {
  formatarDataHoraCompleta,
  formatarHorarioMensagem,
} from "../lib/horarios";
import { rotuloAutorResposta } from "../lib/respostas";
import type { EstadoImagem } from "../lib/urls-imagens";
import { ImagemMensagem } from "./imagem-mensagem";
import { PlayerAudio } from "./player-audio";
import { CardPedido } from "@/features/pedidos/components/apresentacao-pedido";
import { MenuMensagem, type AcaoMensagem } from "./menu-mensagem";
import { ReferenciaResposta } from "./referencia-resposta";

/*
 * BALÃO no padrão da referência de UI/UX aprovada: cartão de cantos suaves com sombra curta, horário
 * (e o estado ✓/✓✓, nas próprias) numa linha alinhada à direita DENTRO do balão.
 *
 * Próprias em VERDE CLARO com texto escuro, recebidas em BRANCO — como na referência. Verde claro em
 * vez de jade cheio porque texto escuro sobre fundo claro lê melhor em mensagem longa.
 *
 * Rodapé discreto: horário em tom neutro e, nas próprias, o estado — ✓ enviada e ✓✓ entregue em tom
 * neutro; ✓✓ AZUL somente quando LIDA. A cor nunca é o único sinal: o estado também vai no rótulo.
 *
 * As ações (responder, editar, apagar) ficam num único menu aberto pela seta no canto superior direito
 * do próprio balão (`MenuMensagem`); nada aparece ao lado da mensagem.
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
  estadoImagem = { situacao: "carregando" },
  aoAbrirImagem,
  aoFalharImagem,
  aoCarregarImagem,
  estadoAudio = { situacao: "carregando" },
  aoFalharAudio,
  aoCarregarAudio,
  menuAberto = false,
}: {
  // Áudio: a URL privada vem do cache em memória da conversa (nunca da mensagem).
  estadoAudio?: EstadoImagem;
  aoFalharAudio?: (mensagem: Mensagem) => void;
  aoCarregarAudio?: (mensagem: Mensagem) => void;
  // Menu de ações já aberto (só para renderização estática; na tela quem abre é a seta).
  menuAberto?: boolean;
  mensagem: Mensagem;
  identidadeAtualId: string;
  nomeRemetente: string;
  aoResponder?: (mensagem: Mensagem) => void;
  aoEditar?: (mensagem: Mensagem) => void;
  aoExcluirParaMim?: (mensagem: Mensagem) => void;
  aoExcluirParaTodos?: (mensagem: Mensagem) => void;
  aoAbrirPedido?: (pedidoId: string) => void;
  visaoCliente?: boolean;
  // Imagem: a URL privada vem do cache em memória da conversa (nunca da mensagem).
  estadoImagem?: EstadoImagem;
  aoAbrirImagem?: (mensagem: Mensagem, url: string) => void;
  aoFalharImagem?: (mensagem: Mensagem) => void;
  aoCarregarImagem?: (mensagem: Mensagem) => void;
}) {
  const [menuNoAlto, setMenuNoAlto] = useState(menuAberto);
  const propria = mensagem.remetenteIdentidadeId === identidadeAtualId;
  const excluida = mensagem.excluidaEm !== null;
  const referencia = excluida ? null : mensagem.mensagemRespondida;
  // Só o autor edita ou apaga para todos; tombstone só pode ser escondido "para mim" (a API também impõe).
  const acoes: AcaoMensagem[] = [];
  const ehPedido = mensagem.tipo === "pedido" && mensagem.pedido !== null;
  const ehImagem = mensagem.tipo === "imagem";
  const ehAudio = mensagem.tipo === "audio";
  const anexo = ehImagem && !excluida && mensagem.anexo?.tipo === "imagem" ? mensagem.anexo : null;
  const anexoAudio = ehAudio && !excluida && mensagem.anexo?.tipo === "audio" ? mensagem.anexo : null;
  // Card de pedido não é texto: não se edita nem se responde (o pedido em si tem sua própria tela).
  // Imagem e áudio se respondem, mas não se editam.
  // Card de pedido não se responde (o pedido tem a sua própria tela); mensagem excluída também não.
  if (aoResponder && !excluida && !ehPedido) acoes.push({ id: "responder", rotulo: "Responder", Icone: IconeResponder, executar: () => aoResponder(mensagem) });
  if (propria && !excluida && !ehPedido && !ehImagem && !ehAudio && aoEditar) acoes.push({ id: "editar", rotulo: "Editar", Icone: IconeLapis, executar: () => aoEditar(mensagem) });
  if (aoExcluirParaMim) acoes.push({ id: "apagar-para-mim", rotulo: "Apagar para mim", Icone: IconeLixeira, executar: () => aoExcluirParaMim(mensagem), perigosa: true });
  if (propria && !excluida && aoExcluirParaTodos) {
    acoes.push({ id: "apagar-para-todos", rotulo: "Apagar para todos", Icone: IconeLixeira, executar: () => aoExcluirParaTodos(mensagem), perigosa: true });
  }

  return (
    <li
      data-mensagem-id={mensagem.id}
      data-propria={propria}
      data-resposta={referencia !== null}
      data-excluida={excluida}
      /*
       * Cada linha é um CONTEXTO DE EMPILHAMENTO próprio (a animação de entrada, com `both`, mantém
       * `opacity`/`transform` aplicados), e linhas irmãs são pintadas na ordem do documento: o menu
       * de uma mensagem ficava ATRÁS do balão seguinte, por maior que fosse o z-index dele lá dentro.
       * Com o menu aberto, a linha inteira sobe (`relative z-20`) acima das irmãs.
       */
      data-menu-aberto={menuNoAlto ? "" : undefined}
      className={`mensagem-entrando flex items-end gap-1 ${propria ? "justify-end" : "justify-start"} ${menuNoAlto ? "relative z-20" : ""}`}
    >
      <div
        // Raios como na referência: o balão próprio é um pouco mais arredondado que o recebido.
        // `group` + `relative`: a seta do menu vive no canto do balão e aparece ao passar o mouse NELE.
        className={`group relative flex min-w-0 max-w-[86%] flex-col gap-1 px-4 py-3 text-sm leading-[1.45] shadow-balao sm:max-w-[min(72%,38rem)] ${
          propria
            ? "rounded-jaa bg-mensagem-enviada text-mensagem-enviada-conteudo"
            : "rounded-jaa-compacto bg-mensagem-recebida text-conteudo"
        }`}
      >
        <MenuMensagem acoes={acoes} emBalaoProprio={propria} abertoInicialmente={menuAberto} aoMudarAberto={setMenuNoAlto} />
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
        ) : ehAudio ? (
          // Mensagem de voz: player próprio. Sem anexo ativo (fora do tombstone), "Áudio indisponível".
          <PlayerAudio
            estado={anexoAudio ? estadoAudio : { situacao: "indisponivel" }}
            duracaoMs={anexoAudio?.duracaoMs ?? 0}
            emBalaoProprio={propria}
            aoFalhar={() => aoFalharAudio?.(mensagem)}
            aoCarregar={() => aoCarregarAudio?.(mensagem)}
          />
        ) : ehImagem ? (
          <>
            {anexo ? (
              <ImagemMensagem
                largura={anexo.largura}
                altura={anexo.altura}
                estado={estadoImagem}
                descricao={mensagem.conteudo || `foto de ${propria ? "você" : nomeRemetente}`}
                aoAbrir={estadoImagem.situacao === "pronta" ? () => aoAbrirImagem?.(mensagem, estadoImagem.url) : undefined}
                aoFalhar={() => aoFalharImagem?.(mensagem)}
                aoCarregar={() => aoCarregarImagem?.(mensagem)}
              />
            ) : (
              // Imagem sem anexo ativo (não deveria acontecer fora do tombstone): nunca um espaço quebrado.
              <ImagemMensagem largura={0} altura={0} estado={{ situacao: "indisponivel" }} descricao="foto" />
            )}
            {mensagem.conteudo && (
              <span data-conteudo data-legenda className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                {mensagem.conteudo}
              </span>
            )}
          </>
        ) : (
          <span
            data-conteudo
            className="whitespace-pre-wrap [overflow-wrap:anywhere]"
          >
            {mensagem.conteudo}
          </span>
        )}

        {/* Rodapé do balão: horário discreto à direita e, nas próprias, o estado ao lado dele. */}
        <span
          data-rodape
          className="flex items-center gap-1 self-end text-[10px] leading-none text-conteudo-suave"
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
              // Azul SÓ quando lida; enviada e entregue ficam no tom neutro do rodapé.
              className={mensagem.estado === "lida" ? "text-leitura" : undefined}
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
    </li>
  );
}
