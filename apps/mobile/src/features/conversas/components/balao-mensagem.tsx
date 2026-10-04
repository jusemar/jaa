import { PREVIA_AUDIO, PREVIA_IMAGEM, type EstadoMensagem, type Mensagem } from "@jaa/contratos";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { CardPedido } from "@/features/pedidos/components/apresentacao-pedido";
import { formatarHorarioMensagem } from "../lib/horarios";
import { rotuloAutorResposta } from "../lib/respostas";
import { LARGURA_MAXIMA_IMAGEM } from "../lib/imagem-conversa";
import type { EstadoImagem } from "../lib/urls-imagens";
import { ImagemMensagem } from "./imagem-mensagem";
import { PlayerAudio } from "./player-audio";
import { ReferenciaResposta } from "./referencia-resposta";

/*
 * BALÃO no padrão da Web: cartão de cantos suaves com sombra curta, horário (e o estado ✓/✓✓, nas
 * próprias) numa linha alinhada à direita DENTRO do balão.
 *
 * Próprias em VERDE CLARO com texto escuro, recebidas em BRANCO. Rodapé discreto, como na Web:
 * horário em tom neutro e, nas próprias, ✓ enviada e ✓✓ entregue neutros; ✓✓ AZUL só quando LIDA
 * (o estado também vai no rótulo acessível — a cor nunca é o único sinal).
 *
 * As ações (responder, editar, apagar) abrem no TOQUE LONGO, numa folha por cima de tudo — o
 * equivalente de toque da seta que a Web mostra no canto do balão.
 */

// Largura útil para a foto: os 86% do balão, menos as margens da linha e a moldura do balão.
export function larguraDaImagemNoBalao(larguraDaTela: number): number {
  return Math.max(120, Math.min(LARGURA_MAXIMA_IMAGEM, Math.floor((larguraDaTela - 2 * Espaco.quatro) * 0.86) - 2 * Espaco.um));
}

const ROTULO_ESTADO: Record<EstadoMensagem, string> = { enviada: "Enviada", entregue: "Entregue", lida: "Lida" };

export function BalaoMensagem({
  mensagem,
  identidadeAtualId,
  nomeRemetente,
  aoPedirAcoes,
  aoAbrirPedido,
  visaoCliente = false,
  estadoImagem = { situacao: "carregando" },
  aoAbrirImagem,
  aoFalharImagem,
  aoCarregarImagem,
  estadoAudio = { situacao: "carregando" },
  aoFalharAudio,
  aoCarregarAudio,
}: {
  // Áudio: a URL privada vem do cache em memória da conversa (nunca da mensagem).
  estadoAudio?: EstadoImagem;
  aoFalharAudio?: (mensagem: Mensagem) => void;
  aoCarregarAudio?: (mensagem: Mensagem) => void;
  // Imagem: a URL privada vem do cache em memória da conversa (nunca da mensagem).
  estadoImagem?: EstadoImagem;
  aoAbrirImagem?: (mensagem: Mensagem, url: string) => void;
  aoFalharImagem?: (mensagem: Mensagem) => void;
  aoCarregarImagem?: (mensagem: Mensagem) => void;
  mensagem: Mensagem;
  identidadeAtualId: string;
  nomeRemetente: string;
  aoPedirAcoes?: (mensagem: Mensagem) => void;
  aoAbrirPedido?: (pedidoId: string) => void;
  visaoCliente?: boolean;
}) {
  const propria = mensagem.remetenteIdentidadeId === identidadeAtualId;
  const excluida = mensagem.excluidaEm !== null;
  const referencia = excluida ? null : mensagem.mensagemRespondida;
  const ehPedido = mensagem.tipo === "pedido" && mensagem.pedido !== null;
  // Tombstone vem sem anexo: mensagem excluída nunca mostra área de imagem.
  const anexo = mensagem.tipo === "imagem" && !excluida && mensagem.anexo?.tipo === "imagem" ? mensagem.anexo : null;
  // Mensagem de voz: player próprio no balão. Sem anexo ativo (fora do tombstone), "Áudio indisponível".
  const ehAudio = mensagem.tipo === "audio" && !excluida;
  const anexoAudio = ehAudio && mensagem.anexo?.tipo === "audio" ? mensagem.anexo : null;
  const { width } = useWindowDimensions();

  return (
    <View style={[estilos.linha, propria ? estilos.direita : estilos.esquerda]}>
      <Pressable
        accessibilityLabel={`${propria ? "Você" : nomeRemetente}: ${excluida ? "Mensagem excluída" : ehPedido ? "Pedido" : mensagem.conteudo || (anexo ? PREVIA_IMAGEM : ehAudio ? PREVIA_AUDIO : "")}`}
        accessibilityHint={aoPedirAcoes ? "Toque e segure para ver as ações" : undefined}
        onLongPress={aoPedirAcoes ? () => aoPedirAcoes(mensagem) : undefined}
        delayLongPress={350}
        // Raios como na Web: o balão próprio é um pouco mais arredondado que o recebido.
        style={[estilos.balao, propria ? estilos.propria : estilos.recebida, anexo && estilos.comImagem]}>
        {referencia && (
          <View style={[estilos.referencia, anexo && estilos.dentroDaImagem]}>
            <ReferenciaResposta
              nomeAutor={rotuloAutorResposta(referencia.remetente.identidadeId, referencia.remetente.nomeExibicao, identidadeAtualId)}
              previaConteudo={referencia.previaConteudo}
              conteudoTruncado={referencia.conteudoTruncado}
              excluida={referencia.excluida}
              emBalaoProprio={propria}
            />
          </View>
        )}

        {excluida ? (
          <Texto cor="conteudoSuave" style={estilos.italico}>
            Mensagem excluída
          </Texto>
        ) : ehPedido && mensagem.pedido ? (
          <CardPedido pedido={mensagem.pedido} aoAbrir={(pedidoId) => aoAbrirPedido?.(pedidoId)} visaoCliente={visaoCliente} />
        ) : ehAudio ? (
          <PlayerAudio
            estado={anexoAudio ? estadoAudio : { situacao: "indisponivel" }}
            duracaoMs={anexoAudio?.duracaoMs ?? 0}
            aoFalhar={aoFalharAudio ? () => aoFalharAudio(mensagem) : undefined}
            aoCarregar={aoCarregarAudio ? () => aoCarregarAudio(mensagem) : undefined}
          />
        ) : anexo ? (
          <>
            <ImagemMensagem
              anexo={anexo}
              estado={estadoImagem}
              larguraMaxima={larguraDaImagemNoBalao(width)}
              descricao={mensagem.conteudo || "foto"}
              aoAbrir={aoAbrirImagem ? (url) => aoAbrirImagem(mensagem, url) : undefined}
              aoFalhar={aoFalharImagem ? () => aoFalharImagem(mensagem) : undefined}
              aoCarregar={aoCarregarImagem ? () => aoCarregarImagem(mensagem) : undefined}
              aoPedirAcoes={aoPedirAcoes ? () => aoPedirAcoes(mensagem) : undefined}
            />
            {/* Legenda abaixo da foto, no mesmo balão. Sem legenda, só a imagem. */}
            {mensagem.conteudo !== "" && (
              <Texto cor={propria ? "mensagemEnviadaConteudo" : "conteudo"} style={[estilos.conteudo, estilos.dentroDaImagem]}>
                {mensagem.conteudo}
              </Texto>
            )}
          </>
        ) : (
          <Texto cor={propria ? "mensagemEnviadaConteudo" : "conteudo"} style={estilos.conteudo}>
            {mensagem.conteudo}
          </Texto>
        )}

        {/* Rodapé do balão: horário discreto à direita e, nas próprias, o estado ao lado dele. */}
        <View style={[estilos.rodape, anexo && estilos.dentroDaImagem]}>
          {mensagem.editadaEm && !excluida && (
            <Texto variante="miniForte" cor="conteudoSuave" style={estilos.editada}>
              editada
            </Texto>
          )}
          <Texto variante="miniForte" cor="conteudoSuave" style={estilos.horario}>
            {formatarHorarioMensagem(mensagem.criadoEm)}
          </Texto>
          {propria && !excluida && (
            <View accessibilityLabel={ROTULO_ESTADO[mensagem.estado]}>
              <Icone nome={mensagem.estado === "enviada" ? "check" : "checkDuplo"} tamanho={mensagem.estado === "enviada" ? 12 : 14} cor={mensagem.estado === "lida" ? "leitura" : "conteudoSuave"} />
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: "row", paddingHorizontal: Espaco.quatro },
  direita: { justifyContent: "flex-end" },
  esquerda: { justifyContent: "flex-start" },
  balao: {
    elevation: 1,
    gap: Espaco.um,
    maxWidth: "86%",
    paddingHorizontal: Espaco.quatro,
    paddingVertical: Espaco.tres,
    shadowColor: "#232C2D",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 2,
  },
  propria: { backgroundColor: Cores.mensagemEnviada, borderRadius: Raio.bloco },
  recebida: { backgroundColor: Cores.mensagemRecebida, borderRadius: Raio.compacto },
  referencia: { marginBottom: 6 },
  conteudo: { lineHeight: 20.3 },
  italico: { fontStyle: "italic" },
  // Balão de foto: moldura fina em volta da imagem; legenda e rodapé recuperam o recuo do texto.
  comImagem: { paddingHorizontal: Espaco.um, paddingVertical: Espaco.um },
  dentroDaImagem: { paddingHorizontal: Espaco.dois },
  rodape: { alignItems: "center", alignSelf: "flex-end", flexDirection: "row", gap: Espaco.um },
  horario: { fontWeight: "400" },
  editada: { fontStyle: "italic", fontWeight: "400" },
});
