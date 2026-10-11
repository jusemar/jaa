import {
  EVENTO_PEDIDO_NOVO,
  EVENTO_SAIDA_ATUALIZADA,
  ROTULO_FILTRO_PEDIDOS,
  ROTULO_PAGAMENTO_ENTREGA,
  entregadorPodeReceberAtribuicao,
  eventoSaidaAtualizadaSchema,
  filtroPedidosEmpresaSchema,
  type EntregaDoPedido,
  type EntregadorDaEmpresa,
  type FiltroPedidosEmpresa,
  type ListaPedidosEmpresa,
  type Pedido,
  type PedidoDaEmpresa,
  type SaidaEntrega,
} from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Aviso, Carregando, Cartao, EstadoVazio, Secao } from "@/components/ui/superficies";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { formatarHorarioMensagem } from "@/features/conversas/lib/horarios";
import { atribuirEntrega, listarEntregadores, listarSaidasDaEmpresa, obterEntregaDoPedido } from "@/features/entregas/lib/api-entregas-empresa";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import type { RespostaApi } from "@/lib/api";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { useStatusPedido } from "../hooks/use-status-pedido";
import { avancarStatusPedido, cancelarPedido, listarPedidosDaEmpresa, obterPedidoDaEmpresa } from "../lib/api-pedidos";
import { APRESENTACAO_STATUS_ENTREGA, ROTULO_STATUS_PEDIDO_NA_LISTA, adotarSaida, apresentacaoEntregaDoPedido, encontrarSaidaDoPedido, nomeDaRota, rotuloDeItens } from "../lib/gestao-pedidos";
import { CONSULTA_INICIAL, PEDIDOS_POR_PAGINA, cursorDaPagina, irParaAnterior, irParaProxima, paginaAtual, paginaFicouVazia, resumoDaPagina, trocarFiltro, type ConsultaPedidos, type ResumoDaPagina } from "../lib/paginacao-pedidos";
import { AcoesPedidoEmpresa, ConfirmarTransferencia, DetalhePedidoEmpresa, EntregaDoPedidoEmpresa } from "./detalhe-pedido-empresa";

/*
 * PEDIDOS DA EMPRESA no app — a mesma área da Web (`area-pedidos-empresa.tsx`), pelas mesmas rotas e
 * eventos. Toda ação é autorizada e validada pela API; a tela só mostra a próxima ação possível.
 *
 *   LISTA (filtros + página)  ── abrir ──▶  PEDIDO (só ele)  ── voltar ──▶  a MESMA lista
 *
 * O filtro e a página (`consulta`) não são tocados ao abrir um pedido, e a lista continua montada por
 * baixo: voltar devolve a pessoa exatamente aonde estava.
 */
type PaginaDePedidos = [RespostaApi<ListaPedidosEmpresa>, Awaited<ReturnType<typeof listarSaidasDaEmpresa>>];

const mensagemDe = (resposta: { status: number; mensagem: string }) => (resposta.status === 0 ? "Sem conexão. Tente de novo." : resposta.mensagem);

export function TelaPedidosEmpresa({ empresaId, nomeEmpresa, aoAbrirConversa }: { empresaId: string; nomeEmpresa: string; aoAbrirConversa: (nomeUsuario: string) => void }) {
  const [consulta, setConsulta] = useState<ConsultaPedidos>(CONSULTA_INICIAL);
  const [lista, setLista] = useState<ListaPedidosEmpresa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [aberto, setAberto] = useState<Pedido | null>(null);
  const [abrindoId, setAbrindoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Entrega do pedido aberto: quem está levando + histórico de atribuições.
  const [entrega, setEntrega] = useState<EntregaDoPedido | null>(null);
  const [entregadores, setEntregadores] = useState<EntregadorDaEmpresa[]>([]);
  const [saidas, setSaidas] = useState<SaidaEntrega[]>([]);
  // Atribuição pedindo confirmação: o pedido está numa saída que ainda não saiu.
  const [transferencia, setTransferencia] = useState<{ pedidoId: string; entregadorId: string } | null>(null);

  const filtro = consulta.filtro;
  const cursor = cursorDaPagina(consulta);
  const pedidos = lista?.pedidos ?? [];

  // Só a página pedida vem do servidor (10 por vez), com o total do filtro.
  const buscar = useCallback(
    (): Promise<PaginaDePedidos> => Promise.all([listarPedidosDaEmpresa(empresaId, { filtro, antesDe: cursor, limite: PEDIDOS_POR_PAGINA }), listarSaidasDaEmpresa(empresaId, false)]),
    [empresaId, filtro, cursor],
  );

  const adotar = useCallback(([resultado, rotas]: PaginaDePedidos) => {
    setCarregando(false);
    if (rotas.ok) setSaidas(rotas.dados.saidas);
    if (!resultado.ok) {
      setErro(mensagemDe(resultado));
      return;
    }
    setErro(null);
    // A página deixou de existir (os pedidos dela saíram do filtro): recua em vez de ficar vazia.
    setConsulta((atual) => (paginaFicouVazia(atual, resultado.dados.pedidos.length) ? irParaAnterior(atual) : atual));
    setLista(resultado.dados);
  }, []);

  // "Atualizar" e as releituras depois de uma ação: a MESMA página e o MESMO filtro.
  const carregar = useCallback(async () => adotar(await buscar()), [adotar, buscar]);

  useEffect(() => {
    let ativo = true;
    void buscar().then((pagina) => {
      if (ativo) adotar(pagina);
    });
    return () => {
      ativo = false;
    };
  }, [buscar, adotar]);

  const navegar = (proxima: ConsultaPedidos) => {
    if (proxima === consulta) return;
    setCarregando(true);
    setConsulta(proxima);
  };

  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizarSaida = (evento: unknown) => {
      const resultado = eventoSaidaAtualizadaSchema.safeParse(evento);
      if (resultado.success) setSaidas((atuais) => adotarSaida(atuais, resultado.data.saida));
    };
    socket.on(EVENTO_SAIDA_ATUALIZADA, aoAtualizarSaida);
    return () => {
      socket.off(EVENTO_SAIDA_ATUALIZADA, aoAtualizarSaida);
    };
  }, []);

  // PEDIDO NOVO sem recarregar: `pedido:novo` chega só à identidade da empresa. Reconectar também relê.
  useEffect(() => {
    const socket = obterClienteRealtime();
    const reler = () => void carregar();
    socket.on(EVENTO_PEDIDO_NOVO, reler);
    socket.on("connect", reler);
    return () => {
      socket.off(EVENTO_PEDIDO_NOVO, reler);
      socket.off("connect", reler);
    };
  }, [carregar]);

  // Status mudado aqui ou por outro operador: lista e pedido aberto acompanham.
  const abertoId = aberto?.id ?? null;
  useStatusPedido(
    useCallback(
      (evento) => {
        setLista((atual) => (atual ? { ...atual, pedidos: atual.pedidos.map((pedido) => (pedido.id === evento.pedido.id ? { ...pedido, status: evento.pedido.status } : pedido)) } : atual));
        // O detalhe (incluindo a linha do tempo) é relido do servidor, nunca remendado pelo evento.
        if (abertoId === evento.pedido.id) {
          void obterPedidoDaEmpresa(empresaId, evento.pedido.id).then((resultado) => {
            if (resultado.ok) setAberto(resultado.dados);
          });
        }
      },
      [abertoId, empresaId],
    ),
  );

  async function abrir(pedidoId: string) {
    setAbrindoId(pedidoId);
    try {
      // Sempre relê do servidor: a lista local não é autorização nem fonte da verdade.
      const [resultado, daEntrega, quadro] = await Promise.all([obterPedidoDaEmpresa(empresaId, pedidoId), obterEntregaDoPedido(empresaId, pedidoId), listarEntregadores(empresaId)]);
      if (!resultado.ok) {
        setErro(mensagemDe(resultado));
        return;
      }
      setErro(null);
      setAberto(resultado.dados);
      setEntrega(daEntrega.ok ? daEntrega.dados : null);
      // Só quem pode receber AGORA: vínculo ativo E disponível (o servidor confere de novo).
      setEntregadores(quadro.ok ? quadro.dados.entregadores.filter(entregadorPodeReceberAtribuicao) : []);
    } finally {
      setAbrindoId(null);
    }
  }

  async function atribuir(pedidoId: string, entregadorId: string, transferirDaSaida = false) {
    setOcupado(true);
    setAviso(null);
    try {
      const resultado = await atribuirEntrega(empresaId, pedidoId, entregadorId, entrega?.entregadorAtual?.id ?? null, transferirDaSaida);
      if (!resultado.ok) {
        // A saída do pedido ainda não saiu: a MESMA ação continua, depois de o gerente confirmar.
        if (resultado.codigo === "PEDIDO_EM_SAIDA_TRANSFERIVEL") {
          setErro(null);
          setTransferencia({ pedidoId, entregadorId });
          return;
        }
        // Atribuição concorrente (ou status mudado): relê para mostrar a situação real. O aviso vem
        // DEPOIS da releitura, porque `abrir` limpa o erro.
        await abrir(pedidoId);
        setErro(mensagemDe(resultado));
        return;
      }
      setErro(null);
      setTransferencia(null);
      setEntrega(resultado.dados);
      const nome = resultado.dados.entregadorAtual?.pessoa.nomeExibicao;
      setAviso(nome ? `Pedido atribuído a ${nome}.` : "Pedido atribuído.");
      // Saídas e lista mudam (o pedido pode ter saído de uma formação).
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function operar(executar: () => Promise<RespostaApi<Pedido>>) {
    setOcupado(true);
    setAviso(null);
    try {
      const resultado = await executar();
      if (!resultado.ok) {
        // Inclui o caso de outro operador ter mudado o pedido: recarrega para mostrar a situação real.
        if (aberto) await abrir(aberto.id);
        await carregar();
        setErro(mensagemDe(resultado));
        return;
      }
      setErro(null);
      setAberto(resultado.dados);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  const voltarParaPedidos = useCallback(() => {
    setErro(null);
    setAviso(null);
    setTransferencia(null);
    setAberto(null);
  }, []);

  // O "Voltar" do Android sai do pedido para a lista, não da área.
  const mostrandoPedido = aberto !== null;
  useEffect(() => {
    if (!mostrandoPedido) return;
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      voltarParaPedidos();
      return true;
    });
    return () => assinatura.remove();
  }, [mostrandoPedido, voltarParaPedidos]);

  const resumo = resumoDaPagina({ pagina: paginaAtual(consulta), quantidadeNaPagina: pedidos.length, total: lista?.total ?? 0, temProxima: Boolean(lista?.proximoCursor) });

  return (
    <View style={estilos.flex}>
      {/* A lista continua montada (só escondida) com o pedido aberto: voltar devolve a mesma altura. */}
      <View style={[estilos.flex, mostrandoPedido && estilos.escondida]}>
        <Tela
          atualizando={atualizando}
          aoAtualizar={() => {
            setAtualizando(true);
            void carregar().finally(() => setAtualizando(false));
          }}>
          <Secao titulo="Pedidos" descricao={`Pedidos recebidos por ${nomeEmpresa} e a próxima ação de cada um.`}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Filtrar pedidos" contentContainerStyle={estilos.filtros}>
              {filtroPedidosEmpresaSchema.options.map((opcao: FiltroPedidosEmpresa) => {
                const marcado = filtro === opcao;
                return (
                  <Pressable key={opcao} accessibilityRole="button" accessibilityState={{ selected: marcado }} onPress={() => navegar(trocarFiltro(consulta, opcao))} style={[estilos.filtro, marcado && estilos.filtroMarcado]}>
                    <Texto variante="pequenoMedio" cor={marcado ? "marcaConteudo" : "conteudoSuave"}>
                      {ROTULO_FILTRO_PEDIDOS[opcao]}
                    </Texto>
                  </Pressable>
                );
              })}
            </ScrollView>

            {!mostrandoPedido && erro && <Aviso tom="erro">{erro}</Aviso>}

            {lista === null && !erro ? (
              <Carregando texto="Carregando pedidos…" />
            ) : pedidos.length === 0 ? (
              lista !== null && <EstadoVazio titulo="Nenhum pedido aqui" descricao={filtro === "todos" ? "Quando um cliente pedir, o pedido aparece nesta lista." : "Nenhum pedido neste filtro agora."} />
            ) : (
              <Cartao accessibilityLabel="Pedidos" style={estilos.lista}>
                {pedidos.map((pedido, indice) => (
                  <ItemDaLista key={pedido.id} pedido={pedido} saida={encontrarSaidaDoPedido(saidas, pedido.id)} primeiro={indice === 0} abrindo={abrindoId === pedido.id} aoAbrir={() => void abrir(pedido.id)} />
                ))}
              </Cartao>
            )}

            <Paginacao resumo={resumo} ocupado={carregando} aoAnterior={() => navegar(irParaAnterior(consulta))} aoProxima={() => navegar(irParaProxima(consulta, lista?.proximoCursor ?? null))} />
            {pedidos.length > 0 && <LegendaStatusEntrega />}
          </Secao>
        </Tela>
      </View>

      {aberto && (
        <Tela>
          <View style={estilos.topoDoPedido}>
            <Pressable accessibilityRole="button" accessibilityLabel="Voltar para pedidos" hitSlop={8} onPress={voltarParaPedidos} style={({ pressed }) => [estilos.voltar, pressed && estilos.apagado]}>
              <Icone nome="voltar" tamanho={20} cor="marca" />
              <Texto variante="corpoMedio" cor="marca">
                Voltar para pedidos
              </Texto>
            </Pressable>
          </View>
          <Botao rotulo={`Conversar com ${aberto.cliente.nomeExibicao}`} aparencia="secundario" onPress={() => aoAbrirConversa(aberto.cliente.nomeUsuario)} />

          <DetalhePedidoEmpresa pedido={aberto}>
            <EntregaDoPedidoEmpresa pedido={aberto} entrega={entrega} entregadores={entregadores} ocupado={ocupado} aoAtribuir={(entregadorId) => void atribuir(aberto.id, entregadorId)} />
            {transferencia?.pedidoId === aberto.id && (
              <ConfirmarTransferencia
                nomeEntregador={entregadores.find((item) => item.id === transferencia.entregadorId)?.pessoa.nomeExibicao ?? null}
                ocupado={ocupado}
                aoConfirmar={() => void atribuir(transferencia.pedidoId, transferencia.entregadorId, true)}
                aoCancelar={() => setTransferencia(null)}
              />
            )}
            {aviso && (
              <View accessibilityLiveRegion="polite" style={estilos.aviso}>
                <Icone nome="check" tamanho={16} cor="marca" />
                <Texto variante="corpoMedio" cor="marca">
                  {aviso}
                </Texto>
              </View>
            )}
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <AcoesPedidoEmpresa
              pedido={aberto}
              ocupado={ocupado}
              aoAvancar={() => void operar(() => avancarStatusPedido(empresaId, aberto.id, aberto.status))}
              aoCancelar={(motivo) => void operar(() => cancelarPedido(empresaId, aberto.id, aberto.status, motivo))}
            />
          </DetalhePedidoEmpresa>
        </Tela>
      )}
    </View>
  );
}

// Lista operacional: clareza para triagem (quem pediu, quanto, como paga, em que pé está).
function ItemDaLista({ pedido, saida, primeiro, abrindo, aoAbrir }: { pedido: PedidoDaEmpresa; saida: SaidaEntrega | null; primeiro: boolean; abrindo: boolean; aoAbrir: () => void }) {
  const entrega = apresentacaoEntregaDoPedido(pedido.status, saida);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir pedido ${pedido.numero} de ${pedido.cliente.nomeExibicao}, ${ROTULO_STATUS_PEDIDO_NA_LISTA[pedido.status]}`}
      accessibilityState={{ busy: abrindo }}
      disabled={abrindo}
      onPress={aoAbrir}
      style={({ pressed }) => [estilos.item, !primeiro && estilos.itemComDivisa, entrega && { backgroundColor: entrega.fundo }, (pressed || abrindo) && estilos.apagado]}>
      <View style={estilos.flex}>
        <Texto variante="corpoMedio" numberOfLines={1}>
          Pedido #{pedido.numero} · {pedido.cliente.nomeExibicao}
        </Texto>
        <Texto variante="pequeno" cor="conteudoSuave">
          Criado às {formatarHorarioMensagem(pedido.criadoEm)} · {rotuloDeItens(pedido.quantidadeItens)} · {formatarPrecoCentavos(pedido.totalCentavos)} · {ROTULO_PAGAMENTO_ENTREGA[pedido.formaPagamentoNaEntrega]}
        </Texto>
        <Texto variante="pequenoMedio">Pedido: {ROTULO_STATUS_PEDIDO_NA_LISTA[pedido.status]}</Texto>
        {entrega && (
          <View style={estilos.logistica}>
            <Texto variante="pequenoMedio">Entrega: {entrega.rotulo}</Texto>
            {saida && (
              <>
                <Texto variante="pequeno">Rota: {nomeDaRota(saida)}</Texto>
                <Texto variante="pequeno">Entregador: {saida.entregador?.nomeExibicao ?? "Aguardando atribuição"}</Texto>
              </>
            )}
          </View>
        )}
      </View>
      <Icone nome="seta" tamanho={18} />
    </Pressable>
  );
}

/** "1–10 de 36 pedidos" + Anterior · Página 1 de 4 · Próxima. Com uma página só, fica a contagem. */
function Paginacao({ resumo, ocupado, aoAnterior, aoProxima }: { resumo: ResumoDaPagina; ocupado: boolean; aoAnterior: () => void; aoProxima: () => void }) {
  if (resumo.total === 0) return null;
  return (
    <View accessibilityLabel="Páginas de pedidos" style={estilos.paginacao}>
      <Texto variante="pequeno" cor="conteudoSuave" accessibilityLiveRegion="polite">
        {resumo.contagem}
      </Texto>
      {resumo.totalPaginas > 1 && (
        <View style={estilos.paginas}>
          <Botao rotulo="Anterior" aparencia="secundario" compacto disabled={!resumo.temAnterior || ocupado} onPress={aoAnterior} />
          <Texto variante="pequeno">
            Página {resumo.pagina} de {resumo.totalPaginas}
          </Texto>
          <Botao rotulo="Próxima" aparencia="secundario" compacto disabled={!resumo.temProxima || ocupado} onPress={aoProxima} />
        </View>
      )}
    </View>
  );
}

/** Legenda das cores da lista — as mesmas da Web. Fica no fim: é consulta, não ação. */
function LegendaStatusEntrega() {
  return (
    <View accessibilityLabel="Legenda dos status da entrega" style={estilos.legenda}>
      {Object.entries(APRESENTACAO_STATUS_ENTREGA).map(([status, item]) => (
        <View key={status} style={[estilos.itemLegenda, { backgroundColor: item.fundo }]}>
          <Texto variante="mini">{item.rotulo}</Texto>
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  escondida: { display: "none" },
  filtros: { gap: Espaco.dois, paddingRight: Espaco.quatro },
  filtro: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 1, justifyContent: "center", minHeight: 36, paddingHorizontal: Espaco.tres },
  filtroMarcado: { backgroundColor: Cores.marca, borderColor: Cores.marca },
  lista: { overflow: "hidden" },
  item: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, minHeight: ALTURA_TOQUE, paddingHorizontal: Espaco.tres, paddingVertical: Espaco.tres },
  itemComDivisa: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth },
  logistica: { borderLeftColor: Cores.borda, borderLeftWidth: 2, marginTop: Espaco.um, paddingLeft: Espaco.dois },
  paginacao: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois, justifyContent: "space-between" },
  paginas: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  topoDoPedido: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  voltar: { alignItems: "center", flexDirection: "row", gap: Espaco.um, minHeight: ALTURA_TOQUE },
  aviso: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  legenda: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.um },
  itemLegenda: { borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 1, paddingHorizontal: Espaco.dois, paddingVertical: 2 },
  apagado: { opacity: 0.6 },
});
