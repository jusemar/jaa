import {
  EVENTO_PEDIDO_NOVO,
  EVENTO_SAIDA_ATUALIZADA,
  ROTULO_FILTRO_PEDIDOS,
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_PERIODO_PEDIDOS,
  entregadorNoResumoDoPedido,
  entregadorPodeReceberAtribuicao,
  eventoSaidaAtualizadaSchema,
  filtroPedidosEmpresaSchema,
  periodoPedidosSchema,
  type EntregaDoPedido,
  type EntregadorDaEmpresa,
  type FiltroPedidosEmpresa,
  type ListaPedidosEmpresa,
  type Pedido,
  type PedidoDaEmpresa,
  type PeriodoPedidos,
  type SaidaEntrega,
} from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Aviso, Carregando, Cartao, EstadoVazio, Secao } from "@/components/ui/superficies";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { formatarHorarioMensagem } from "@/features/conversas/lib/horarios";
import { atribuirEntrega, listarEntregadores, listarSaidasDaEmpresa, obterEntregaDoPedido } from "@/features/entregas/lib/api-entregas-empresa";
import { CampoDeEscolha, FolhaDeEscolha } from "@/features/produtos/components/pecas";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import type { RespostaApi } from "@/lib/api";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { useStatusPedido } from "../hooks/use-status-pedido";
import { avancarStatusPedido, cancelarPedido, listarPedidosDaEmpresa, obterPedidoDaEmpresa } from "../lib/api-pedidos";
import { APRESENTACAO_STATUS_ENTREGA, ROTULO_STATUS_PEDIDO_NA_LISTA, adotarSaida, apresentacaoEntregaDoPedido, encontrarSaidaDoPedido, nomeDaRota, rotuloDeItens } from "../lib/gestao-pedidos";
import {
  CONSULTA_INICIAL,
  PEDIDOS_POR_PAGINA,
  cursorDaPagina,
  dataDeHojeNoCampo,
  dataDoCampo,
  dataParaCampo,
  irParaAnterior,
  irParaProxima,
  mascararData,
  paginaAtual,
  paginaFicouVazia,
  parametrosDoPeriodo,
  problemaDoPeriodo,
  resumoDaPagina,
  trocarFiltro,
  trocarPeriodo,
  type ConsultaPedidos,
  type ResumoDaPagina,
} from "../lib/paginacao-pedidos";
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
  // Período: o que vai ao servidor é a opção e, no personalizado, as duas datas (ele calcula os limites).
  const { periodo, dataInicial, dataFinal } = parametrosDoPeriodo(consulta);
  // Datas do personalizado como estão DIGITADAS (DD/MM/AAAA; podem estar incompletas — aí a consulta não muda).
  const [datasDigitadas, setDatasDigitadas] = useState<{ inicial: string; final: string } | null>(null);
  const [escolhendoPeriodo, setEscolhendoPeriodo] = useState(false);
  const escolhendoPersonalizado = datasDigitadas !== null;
  const problemaDasDatas = datasDigitadas ? problemaDoPeriodo({ periodo: "personalizado", dataInicial: dataDoCampo(datasDigitadas.inicial), dataFinal: dataDoCampo(datasDigitadas.final) }) : null;

  // Só a página pedida vem do servidor (10 por vez), com o total do filtro e as contagens do período.
  const buscar = useCallback(
    (): Promise<PaginaDePedidos> =>
      Promise.all([listarPedidosDaEmpresa(empresaId, { filtro, antesDe: cursor, limite: PEDIDOS_POR_PAGINA, periodo, dataInicial, dataFinal }), listarSaidasDaEmpresa(empresaId, false)]),
    [empresaId, filtro, cursor, periodo, dataInicial, dataFinal],
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
        // As QUANTIDADES dos filtros mudam junto com o status: relê a página (mesmo filtro e período).
        void carregar();
      },
      [abertoId, empresaId, carregar],
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

  function escolherPeriodo(novo: PeriodoPedidos) {
    if (novo !== "personalizado") {
      setDatasDigitadas(null);
      navegar(trocarPeriodo(consulta, novo));
      return;
    }
    // Abre com o dia de hoje nas duas datas (já é um período válido) e a pessoa ajusta a partir daí.
    const hoje = dataDeHojeNoCampo();
    const datas = { dataInicial: consulta.dataInicial ?? hoje, dataFinal: consulta.dataFinal ?? hoje };
    setDatasDigitadas({ inicial: dataParaCampo(datas.dataInicial), final: dataParaCampo(datas.dataFinal) });
    navegar(trocarPeriodo(consulta, "personalizado", datas));
  }

  function mudarDatas(digitadas: { inicial: string; final: string }) {
    setDatasDigitadas(digitadas);
    const datas = { dataInicial: dataDoCampo(digitadas.inicial), dataFinal: dataDoCampo(digitadas.final) };
    // Só período COMPLETO e em ordem vira consulta; enquanto isso a lista mostra o último válido.
    if (problemaDoPeriodo({ periodo: "personalizado", ...datas }) === null) navegar(trocarPeriodo(consulta, "personalizado", datas));
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
            {/* PERÍODO (pela criação do pedido, no fuso da empresa — quem calcula é o servidor). */}
            <View style={estilos.periodo}>
              <CampoDeEscolha rotulo="Período" valor={ROTULO_PERIODO_PEDIDOS[escolhendoPersonalizado ? "personalizado" : consulta.periodo]} aoAbrir={() => setEscolhendoPeriodo(true)} />
              {datasDigitadas && (
                <View style={estilos.datas}>
                  <CampoDeData rotulo="Data inicial" valor={datasDigitadas.inicial} aoMudar={(inicial) => mudarDatas({ ...datasDigitadas, inicial })} />
                  <CampoDeData rotulo="Data final" valor={datasDigitadas.final} aoMudar={(final) => mudarDatas({ ...datasDigitadas, final })} />
                </View>
              )}
              {problemaDasDatas && (
                <Texto variante="pequeno" cor="aviso" accessibilityLiveRegion="polite">
                  {problemaDasDatas}
                </Texto>
              )}
            </View>

            {/* FILTROS são controles: pílulas com a quantidade do período num contador próprio. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Filtrar pedidos por status" contentContainerStyle={estilos.filtros}>
              {filtroPedidosEmpresaSchema.options.map((opcao: FiltroPedidosEmpresa) => {
                const marcado = filtro === opcao;
                const quantidade = lista?.contagens[opcao];
                return (
                  <Pressable
                    key={opcao}
                    accessibilityRole="button"
                    accessibilityLabel={quantidade === undefined ? ROTULO_FILTRO_PEDIDOS[opcao] : `${ROTULO_FILTRO_PEDIDOS[opcao]}: ${quantidade} ${quantidade === 1 ? "pedido" : "pedidos"}`}
                    accessibilityState={{ selected: marcado }}
                    onPress={() => navegar(trocarFiltro(consulta, opcao))}
                    style={[estilos.filtro, marcado && estilos.filtroMarcado]}>
                    <Texto variante="pequenoMedio" cor={marcado ? "marcaConteudo" : "conteudo"}>
                      {ROTULO_FILTRO_PEDIDOS[opcao]}
                    </Texto>
                    {quantidade !== undefined && (
                      <View style={[estilos.quantidade, marcado && estilos.quantidadeMarcada]}>
                        <Texto variante="miniForte" cor={marcado ? "marcaConteudo" : "conteudoSuave"}>
                          {quantidade}
                        </Texto>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {!mostrandoPedido && erro && <Aviso tom="erro">{erro}</Aviso>}

            {lista === null && !erro ? (
              <Carregando texto="Carregando pedidos…" />
            ) : pedidos.length === 0 ? (
              lista !== null && <EstadoVazio titulo="Nenhum pedido aqui" descricao={consulta.periodo !== "todos" ? "Nenhum pedido neste período." : filtro === "todos" ? "Quando um cliente pedir, o pedido aparece nesta lista." : "Nenhum pedido neste filtro agora."} />
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

      <FolhaDeEscolha
        titulo="Período"
        aberta={escolhendoPeriodo}
        atual={escolhendoPersonalizado ? "personalizado" : consulta.periodo}
        itens={periodoPedidosSchema.options.map((opcao) => ({ id: opcao, rotulo: ROTULO_PERIODO_PEDIDOS[opcao] }))}
        aoEscolher={(opcao) => escolherPeriodo(opcao as PeriodoPedidos)}
        aoFechar={() => setEscolhendoPeriodo(false)}
      />

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
  // Quem está (ou esteve) com o pedido; "aguardando" só enquanto ele ainda pode receber entregador.
  const entregador = entregadorNoResumoDoPedido(pedido.status, saida);
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
                {entregador && <Texto variante="pequeno">Entregador: {entregador.tipo === "atribuido" ? entregador.nome : "Aguardando atribuição"}</Texto>}
              </>
            )}
          </View>
        )}
      </View>
      <Icone nome="seta" tamanho={18} />
    </Pressable>
  );
}

/** Data do período personalizado, digitada como DD/MM/AAAA (as barras entram sozinhas). */
function CampoDeData({ rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (valor: string) => void }) {
  return (
    <View style={estilos.campoDeData}>
      <Texto variante="pequeno" cor="conteudoSuave">
        {rotulo}
      </Texto>
      <TextInput accessibilityLabel={rotulo} value={valor} keyboardType="number-pad" maxLength={10} placeholder="DD/MM/AAAA" placeholderTextColor="#A2AAAB" onChangeText={(texto) => aoMudar(mascararData(texto))} style={estilos.data} />
    </View>
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
  periodo: { gap: Espaco.dois },
  datas: { flexDirection: "row", gap: Espaco.tres },
  campoDeData: { flex: 1, gap: Espaco.um, minWidth: 0 },
  data: { backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, color: Cores.conteudo, fontSize: 16, minHeight: ALTURA_TOQUE, paddingHorizontal: Espaco.tres, paddingVertical: 0 },
  filtro: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 1, flexDirection: "row", gap: Espaco.um, justifyContent: "center", minHeight: 40, paddingHorizontal: Espaco.tres },
  quantidade: { alignItems: "center", backgroundColor: Cores.superficieSuave, borderRadius: Raio.total, justifyContent: "center", minWidth: 22, paddingHorizontal: 6, paddingVertical: 3 },
  quantidadeMarcada: { backgroundColor: "rgba(255,255,255,0.22)" },
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
