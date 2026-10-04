import { PREVIA_AUDIO, PREVIA_IMAGEM, type ItemListaConversas } from "@jaa/contratos";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { AvatarIdentidade } from "@/components/ui/avatar";
import { Icone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { rotuloNaoLidas } from "../lib/lista-conversas";

/*
 * LISTA DE CONVERSAS no padrão da Web: três colunas — avatar, bloco de texto (nome, tipo e prévia) e,
 * à direita, o horário sobre o contador de não lidas.
 *
 * Como na Web, não há bolinha de presença por linha: o Jaa só conhece a presença da conversa ABERTA.
 */

/*
 * Formatadores criados A CADA USO, e não uma vez no carregamento do módulo: um `Intl.DateTimeFormat`
 * guarda o fuso do aparelho do momento em que nasce, e o fuso pode mudar com o app aberto (viagem,
 * ajuste do sistema). O balão da conversa já formata assim (`horarios.ts`); a lista precisa concordar.
 */
const formatoHora = () => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const formatoDiaSemana = () => new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const formatoData = () => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Hoje → hora; ontem → "ontem"; nos últimos 7 dias → dia da semana; antes disso → data. */
export function formatarHorarioDaLista(iso: string, agora = new Date()): string {
  const data = new Date(iso);
  const dia = (valor: Date) => new Date(valor.getFullYear(), valor.getMonth(), valor.getDate()).getTime();
  const diferencaEmDias = Math.round((dia(agora) - dia(data)) / 86_400_000);

  if (diferencaEmDias <= 0) return formatoHora().format(data);
  if (diferencaEmDias === 1) return "ontem";
  if (diferencaEmDias < 7) return formatoDiaSemana().format(data).replace(".", "");
  return formatoData().format(data);
}

export function ListaConversas(props: {
  identidadeId: string;
  itens: ItemListaConversas[];
  carregando: boolean;
  erro: string | null;
  temMais: boolean;
  carregandoMais: boolean;
  // Conversa aberta e visível: está sendo lida agora, então o contador não é exibido nela.
  conversaEmLeituraId?: string | null;
  atualizando: boolean;
  aoAtualizar: () => void;
  aoAbrir: (item: ItemListaConversas) => void;
  aoCarregarMais: () => void;
  // Toque longo: o mesmo menu de ações do cabeçalho da conversa.
  aoPedirAcoes?: (item: ItemListaConversas) => void;
}) {
  return (
    <FlatList
      data={props.itens}
      keyExtractor={(item) => item.id}
      style={estilos.lista}
      contentContainerStyle={estilos.conteudo}
      keyboardShouldPersistTaps="handled"
      refreshing={props.atualizando}
      onRefresh={props.aoAtualizar}
      accessibilityLabel="Conversas"
      ListHeaderComponent={
        props.carregando ? (
          <Texto cor="conteudoSuave" style={estilos.estado}>
            Carregando conversas…
          </Texto>
        ) : null
      }
      ListEmptyComponent={
        !props.carregando && !props.erro ? (
          <View style={estilos.vazio}>
            <Texto variante="corpoForte">Nenhuma conversa ainda</Texto>
            <Texto cor="conteudoSuave" style={estilos.textoVazio}>
              Use a busca acima para encontrar uma pessoa ou empresa pelo nome ou @usuario e começar a conversar.
            </Texto>
          </View>
        ) : null
      }
      ListFooterComponent={
        <>
          {props.temMais && (
            <Pressable accessibilityRole="button" disabled={props.carregandoMais} onPress={props.aoCarregarMais} style={({ pressed }) => [estilos.carregarMais, pressed && estilos.pressionada]}>
              <Texto cor="conteudoSuave">{props.carregandoMais ? "Carregando…" : "Carregar mais conversas"}</Texto>
            </Pressable>
          )}
          {props.erro && (
            <Texto cor="perigo" accessibilityRole="alert" style={estilos.estado}>
              {props.erro}
            </Texto>
          )}
        </>
      }
      renderItem={({ item }) => {
        const { outraIdentidade, ultimaMensagem } = item;
        const autor = ultimaMensagem?.remetenteIdentidadeId === props.identidadeId ? "Você: " : "";
        const mostrarNaoLidas = item.naoLidas > 0 && item.id !== props.conversaEmLeituraId;

        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => props.aoAbrir(item)}
            onLongPress={props.aoPedirAcoes ? () => props.aoPedirAcoes?.(item) : undefined}
            style={({ pressed }) => [estilos.linha, pressed && estilos.pressionada]}>
            <AvatarIdentidade identidade={outraIdentidade} />

            <View style={estilos.texto}>
              <View style={estilos.nome}>
                <Texto variante="corpoForte" numberOfLines={1} style={estilos.encolhe}>
                  {outraIdentidade.nomeExibicao}
                </Texto>
                {item.comunicacaoBloqueada && <Icone nome="bloqueio" tamanho={14} cor="perigo" />}
              </View>
              {/* Linha de TIPO: o Jaa só diz o que sabe — "Empresa"; para pessoa, nada. */}
              {outraIdentidade.tipo === "empresarial" && (
                <Texto variante="pequenoMedio" cor="aviso" numberOfLines={1}>
                  Empresa
                </Texto>
              )}
              {/* Não lida: a prévia sai do tom suave e ganha peso — além do número, não só a cor. */}
              <Texto variante="pequeno" cor={mostrarNaoLidas ? "conteudo" : "conteudoSuave"} numberOfLines={1} style={[estilos.previa, mostrarNaoLidas && estilos.previaNaoLida]}>
                {!ultimaMensagem ? (
                  <Texto variante="pequeno" cor="conteudoSuave" style={estilos.italico}>
                    Sem mensagens
                  </Texto>
                ) : ultimaMensagem.excluidaEm ? (
                  <Texto variante="pequeno" cor="conteudoSuave" style={estilos.italico}>
                    Mensagem excluída
                  </Texto>
                ) : ultimaMensagem.tipo === "pedido" ? (
                  `${autor}Pedido`
                ) : ultimaMensagem.tipo === "imagem" ? (
                  // Só o rótulo, como na Web: nada de legenda, URL ou miniatura da imagem privada.
                  `${autor}${PREVIA_IMAGEM}`
                ) : ultimaMensagem.tipo === "audio" ? (
                  // Só o rótulo: nada de duração, formato, URL ou arquivo do áudio privado.
                  `${autor}${PREVIA_AUDIO}`
                ) : (
                  `${autor}${ultimaMensagem.conteudo}`
                )}
              </Texto>
            </View>

            <View style={estilos.lateral}>
              {ultimaMensagem && (
                <Texto variante="mini" cor={mostrarNaoLidas ? "marca" : "conteudoSuave"} style={mostrarNaoLidas && estilos.horarioNaoLido}>
                  {formatarHorarioDaLista(ultimaMensagem.criadoEm)}
                </Texto>
              )}
              {mostrarNaoLidas && (
                <View accessibilityLabel={`${item.naoLidas} ${item.naoLidas === 1 ? "mensagem não lida" : "mensagens não lidas"}`} style={estilos.contador}>
                  <Texto variante="miniForte" cor="marcaConteudo">
                    {rotuloNaoLidas(item.naoLidas)}
                  </Texto>
                </View>
              )}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const estilos = StyleSheet.create({
  lista: { backgroundColor: Cores.superficie, flex: 1 },
  conteudo: { flexGrow: 1, paddingBottom: 96, paddingVertical: Espaco.dois },
  estado: { paddingHorizontal: Espaco.quatro, paddingVertical: Espaco.tres },
  vazio: { alignItems: "center", gap: 6, paddingHorizontal: Espaco.cinco, paddingVertical: 40 },
  textoVazio: { maxWidth: 256, textAlign: "center" },
  linha: { flexDirection: "row", gap: Espaco.tres, paddingHorizontal: Espaco.quatro, paddingVertical: Espaco.tres },
  pressionada: { backgroundColor: Cores.superficieSuave },
  texto: { flex: 1, minWidth: 0 },
  nome: { alignItems: "center", flexDirection: "row", gap: 6 },
  encolhe: { flexShrink: 1 },
  previa: { marginTop: Espaco.um },
  previaNaoLida: { fontWeight: "600" },
  italico: { fontStyle: "italic" },
  lateral: { alignItems: "flex-end", gap: Espaco.dois },
  horarioNaoLido: { fontWeight: "700" },
  contador: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.total, height: 20, justifyContent: "center", minWidth: 20, paddingHorizontal: Espaco.um },
  carregarMais: { alignItems: "center", borderRadius: Raio.compacto, justifyContent: "center", marginHorizontal: Espaco.quatro, marginTop: Espaco.dois, minHeight: 44 },
});
