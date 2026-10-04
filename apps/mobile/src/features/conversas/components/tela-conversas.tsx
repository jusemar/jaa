import type { ItemListaConversas, TipoIdentidade } from "@jaa/contratos";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BarraTopo } from "@/components/navegacao/barra-topo";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { PesquisaJaa } from "@/features/contatos/components/pesquisa-jaa";
import { useAppVisivel } from "@/lib/use-app-visivel";
import { useAbrirConversa } from "../hooks/use-abrir-conversa";
import { useConfirmacaoRecebimento } from "../hooks/use-confirmacao-recebimento";
import { useListaConversas } from "../hooks/use-lista-conversas";
import { rotaDaConversa } from "../lib/abrir-conversa";
import { confirmarRecebimentos } from "../lib/confirmar-recebimentos";
import { executarAcaoConversaNoServidor } from "../lib/executar-acao-conversa";
import { assinarConversaEmLeitura, obterConversaEmLeitura } from "../lib/conversa-em-leitura";
import { FILTROS_CONVERSAS, ROTULO_FILTRO_CONVERSAS, contarConversasNaoLidas, filtrarConversas, type FiltroConversas } from "../lib/lista-conversas";
import { AcoesDaConversa, type AcaoConversa, type AlvoAcaoConversa } from "./acoes-conversa";
import { ListaConversas } from "./lista-conversas";

/*
 * CONVERSAS — a tela principal do Jaa, porta do `MensageiroTecnico` da Web no formato de celular: a
 * lista ocupa a tela e abrir uma conversa a substitui (com "voltar" no cabeçalho dela).
 *
 * Nada da mecânica muda: inbox por identidade ATUANTE, realtime, confirmação de recebimento, leitura e
 * ações (limpar, apagar, bloquear) são as mesmas rotas e os mesmos contratos.
 */

// `identidadeId` = identidade ATUANTE (pessoal ou empresa operada). A inbox é carregada pela API para ela.
export function TelaConversas({ identidadeId }: { identidadeId: string; tipoIdentidade: TipoIdentidade }) {
  const router = useRouter();
  const lista = useListaConversas();
  const appVisivel = useAppVisivel();
  useConfirmacaoRecebimento(identidadeId);

  // A prévia da lista exibe a última mensagem de cada conversa: ela foi recebida por este cliente.
  useEffect(() => {
    confirmarRecebimentos(
      identidadeId,
      lista.itens.flatMap((item) => (item.ultimaMensagem ? [item.ultimaMensagem] : [])),
    );
  }, [identidadeId, lista.itens]);

  // Voltar de uma conversa (ou de outra aba): a lista confere o que mudou enquanto estava coberta.
  const recarregar = lista.recarregarPrimeiraPagina;
  useFocusEffect(
    useCallback(() => {
      void recarregar();
    }, [recarregar]),
  );

  const conversaAbertaId = useSyncExternalStore(assinarConversaEmLeitura, obterConversaEmLeitura, () => null);
  const conversaEmLeituraId = appVisivel ? conversaAbertaId : null;

  const { abrirCom, abrindo, erro } = useAbrirConversa(identidadeId);
  const [atualizando, setAtualizando] = useState(false);
  const [alvoAcoes, setAlvoAcoes] = useState<ItemListaConversas | null>(null);
  // Recorte de leitura da inbox (Todas / Não lidas / Empresas), derivado da lista que já veio.
  const [filtro, setFiltro] = useState<FiltroConversas>("todas");
  const itensVisiveis = filtrarConversas(lista.itens, filtro, conversaEmLeituraId);
  const conversasNaoLidas = contarConversasNaoLidas(lista.itens, conversaEmLeituraId);

  // Ações do menu da conversa (toque longo): executa no servidor e reflete na lista.
  async function executarAcaoConversa(acao: AcaoConversa, item: AlvoAcaoConversa): Promise<string | null> {
    const falha = await executarAcaoConversaNoServidor(acao, item);
    if (falha) return falha;
    if (acao === "limpar" || acao === "apagar") lista.registrarEstadoPessoal({ conversaId: item.id, acao: acao === "limpar" ? "limpa" : "apagada" });
    else void lista.recarregarPrimeiraPagina();
    return null;
  }

  return (
    <View accessibilityLabel="Mensageiro" style={estilos.tela}>
      <BarraTopo />

      <View style={estilos.buscaEFiltros}>
        {/* Uma busca só: pessoas e empresas, contatos primeiro. Tocar no resultado abre a conversa. */}
        <PesquisaJaa aoAbrirConversa={(nomeUsuario) => void abrirCom(nomeUsuario)} />

        <View accessibilityRole="tablist" accessibilityLabel="Filtrar conversas" style={estilos.filtros}>
          {FILTROS_CONVERSAS.map((opcao) => {
            const ativo = filtro === opcao;
            return (
              <Pressable key={opcao} accessibilityRole="tab" accessibilityState={{ selected: ativo }} onPress={() => setFiltro(opcao)} style={[estilos.filtro, ativo && estilos.filtroAtivo]}>
                <Texto variante="pequenoMedio" cor={ativo ? "marcaConteudo" : "conteudoSuave"}>
                  {ROTULO_FILTRO_CONVERSAS[opcao]}
                </Texto>
                {opcao === "nao-lidas" && conversasNaoLidas > 0 && (
                  <View style={[estilos.contadorFiltro, ativo && estilos.contadorFiltroAtivo]}>
                    <Texto variante="miniForte" cor="marcaConteudo">
                      {conversasNaoLidas}
                    </Texto>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {abrindo && (
          <Texto variante="pequeno" cor="conteudoSuave">
            Abrindo conversa…
          </Texto>
        )}
        {erro && (
          <Texto cor="perigo" accessibilityRole="alert">
            {erro}
          </Texto>
        )}
      </View>

      <ListaConversas
        identidadeId={identidadeId}
        itens={itensVisiveis}
        carregando={!lista.primeiraPaginaCarregada && !lista.erro}
        erro={lista.erro}
        // Paginar só faz sentido na lista completa: o filtro é recorte do que já está carregado.
        temMais={filtro === "todas" && lista.proximoCursor !== null}
        carregandoMais={lista.carregandoMais}
        conversaEmLeituraId={conversaEmLeituraId}
        atualizando={atualizando}
        aoAtualizar={() => {
          setAtualizando(true);
          void lista.recarregarPrimeiraPagina().finally(() => setAtualizando(false));
        }}
        aoAbrir={(item) => router.push(rotaDaConversa(item.id, item.outraIdentidade))}
        aoCarregarMais={() => void lista.carregarMais()}
        aoPedirAcoes={setAlvoAcoes}
      />

      <AcoesDaConversa alvo={alvoAcoes} aberto={alvoAcoes !== null} aoFechar={() => setAlvoAcoes(null)} aoExecutar={executarAcaoConversa} />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { backgroundColor: Cores.superficie, flex: 1 },
  buscaEFiltros: { borderBottomColor: Cores.borda, borderBottomWidth: 1, gap: Espaco.tres, padding: Espaco.quatro },
  filtros: { flexDirection: "row", gap: Espaco.dois },
  filtro: { alignItems: "center", borderRadius: Raio.total, flexDirection: "row", gap: 6, minHeight: 32, paddingHorizontal: Espaco.tres },
  filtroAtivo: { backgroundColor: Cores.marca },
  contadorFiltro: { backgroundColor: Cores.marca, borderRadius: Raio.total, paddingHorizontal: 6, paddingVertical: 2 },
  contadorFiltroAtivo: { backgroundColor: "rgba(255,255,255,0.2)" },
});
