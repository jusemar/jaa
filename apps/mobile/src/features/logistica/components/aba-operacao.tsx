import {
  EVENTO_FILA_ATUALIZADA,
  EVENTO_POSICAO_ENTREGADOR,
  EVENTO_SAIDA_ATUALIZADA,
  ROTULO_STATUS_PEDIDO,
  entregadorPodeReceberAtribuicao,
  eventoFilaAtualizadaSchema,
  eventoPosicaoEntregadorSchema,
  eventoSaidaAtualizadaSchema,
  formatarEnderecoResumido,
  paradasAtivas,
  rotuloUltimaPosicao,
  type ConfiguracaoDespacho,
  type EntregadorDaEmpresa,
  type PainelOperacional,
  type PedidoDaEmpresa,
  type PosicaoEntregador,
  type SaidaEntrega,
} from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Aviso, Carregando, Cartao, Secao, Selo } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { TelaMapaDaRota } from "@/features/entregas/components/tela-mapa-da-rota";
import { criarSaida, liberarSaida, listarEntregadores, listarPosicoesDaEmpresa, listarSaidasDaEmpresa, obterPainelDespacho, obterPainelOperacional } from "@/features/entregas/lib/api-entregas-empresa";
import { resumoDoPercurso } from "@/features/entregas/lib/minhas-entregas";
import { listarPedidosDaEmpresa } from "@/features/pedidos/lib/api-pedidos";
import { CampoDeEscolha, FolhaDeEscolha, Marcacao, mensagemDe } from "@/features/produtos/components/pecas";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { FILTROS_DA_OPERACAO, adotarSaidaNaOperacao, filtrarSaidasDaOperacao, nomeDaRota, podeLiberarSaida, resumoDaRota, rotuloStatusSaida, tomDoStatusSaida, type FiltroOperacao } from "../lib/operacao";

/*
 * LOGÍSTICA → OPERAÇÃO — as rotas (saídas de entrega) da empresa, como na Web (`area-saidas-empresa.tsx`):
 * montar à mão (vários pedidos prontos + um entregador), acompanhar as que a automação montou, liberar
 * para retirada, ver a sequência, o mapa e a última posição da rota em andamento.
 *
 * Acompanhar aqui é a SEQUÊNCIA OPERACIONAL. Quem reordena, sai e conclui é o entregador.
 */
export function AbaOperacao({ empresaId, nomeEmpresa, atualizacao, aoAbrirConversa }: { empresaId: string; nomeEmpresa: string; /** Muda a cada "puxar para atualizar" da tela. */ atualizacao: number; aoAbrirConversa: (nomeUsuario: string) => void }) {
  const [saidas, setSaidas] = useState<SaidaEntrega[] | null>(null);
  const [prontos, setProntos] = useState<PedidoDaEmpresa[]>([]);
  const [entregadores, setEntregadores] = useState<EntregadorDaEmpresa[]>([]);
  const [posicoes, setPosicoes] = useState<PosicaoEntregador[]>([]);
  const [configuracao, setConfiguracao] = useState<ConfiguracaoDespacho | null>(null);
  const [operacional, setOperacional] = useState<PainelOperacional | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [entregadorId, setEntregadorId] = useState("");
  const [escolhendoEntregador, setEscolhendoEntregador] = useState(false);
  const [montando, setMontando] = useState(false);
  const [filtro, setFiltro] = useState<FiltroOperacao>("todos");
  const [abertas, setAbertas] = useState<string[]>([]);
  const [mapaDe, setMapaDe] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const buscar = useCallback(
    () =>
      Promise.all([
        listarSaidasDaEmpresa(empresaId, false),
        // Só pedidos PRONTOS entram numa saída nova.
        listarPedidosDaEmpresa(empresaId, { filtro: "prontos" }),
        listarEntregadores(empresaId),
        obterPainelDespacho(empresaId),
        obterPainelOperacional(empresaId),
        // Posições das saídas EM ANDAMENTO (reconexão: o estado atual vem da API, não do último evento).
        listarPosicoesDaEmpresa(empresaId),
      ]),
    [empresaId],
  );

  const adotar = useCallback(([lista, pedidos, quadro, despacho, painel, posicoesAtuais]: Awaited<ReturnType<typeof buscar>>) => {
    if (lista.ok) {
      setSaidas(lista.dados.saidas);
      setErro(null);
    } else setErro(mensagemDe(lista));
    if (pedidos.ok) setProntos(pedidos.dados.pedidos);
    // Só entregador ativo E disponível recebe saída nova (o servidor confere de novo).
    if (quadro.ok) setEntregadores(quadro.dados.entregadores.filter(entregadorPodeReceberAtribuicao));
    if (despacho.ok) setConfiguracao(despacho.dados.configuracao);
    if (painel.ok) setOperacional(painel.dados);
    if (posicoesAtuais.ok) setPosicoes(posicoesAtuais.dados.posicoes);
  }, []);

  const carregar = useCallback(async () => adotar(await buscar()), [adotar, buscar]);

  useEffect(() => {
    let ativo = true;
    void buscar().then((resultado) => {
      if (ativo) adotar(resultado);
    });
    return () => {
      ativo = false;
    };
  }, [buscar, adotar, atualizacao]);

  // A rota mudou (o entregador reordenou, uma parada terminou), a posição chegou, a fila andou: sem recarregar.
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoSaidaAtualizadaSchema.safeParse(evento);
      if (resultado.success) setSaidas((atuais) => adotarSaidaNaOperacao(atuais ?? [], resultado.data.saida));
    };
    // Posição do entregador em tempo real: atualiza o mapa sem recalcular rota (GPS ≠ roteamento).
    const aoPosicao = (evento: unknown) => {
      const resultado = eventoPosicaoEntregadorSchema.safeParse(evento);
      if (!resultado.success) return;
      const nova = resultado.data.posicao;
      setPosicoes((atuais) => [nova, ...atuais.filter((item) => item.saidaId !== nova.saidaId)]);
    };
    const aoFila = (evento: unknown) => {
      const resultado = eventoFilaAtualizadaSchema.safeParse(evento);
      if (resultado.success) setOperacional(resultado.data.painel);
    };
    const reler = () => void carregar();
    socket.on(EVENTO_SAIDA_ATUALIZADA, aoAtualizar);
    socket.on(EVENTO_POSICAO_ENTREGADOR, aoPosicao);
    socket.on(EVENTO_FILA_ATUALIZADA, aoFila);
    socket.on("connect", reler);
    return () => {
      socket.off(EVENTO_SAIDA_ATUALIZADA, aoAtualizar);
      socket.off(EVENTO_POSICAO_ENTREGADOR, aoPosicao);
      socket.off(EVENTO_FILA_ATUALIZADA, aoFila);
      socket.off("connect", reler);
    };
  }, [carregar]);

  async function montar() {
    setOcupado(true);
    try {
      const resultado = await criarSaida(empresaId, entregadorId, selecionados);
      await carregar();
      if (!resultado.ok) {
        setErro(mensagemDe(resultado));
        return;
      }
      setErro(null);
      setSelecionados([]);
      setMontando(false);
    } finally {
      setOcupado(false);
    }
  }

  // A liberação antecipada também fecha e planeja uma saída que ainda estava em formação.
  async function liberar(saida: SaidaEntrega) {
    setOcupado(true);
    try {
      const resultado = await liberarSaida(empresaId, saida.id);
      await carregar();
      setErro(resultado.ok ? null : mensagemDe(resultado));
    } finally {
      setOcupado(false);
    }
  }

  const alternarPedido = (pedidoId: string) => setSelecionados((atuais) => (atuais.includes(pedidoId) ? atuais.filter((item) => item !== pedidoId) : [...atuais, pedidoId]));
  const alternarRota = (saidaId: string) => setAbertas((atuais) => (atuais.includes(saidaId) ? atuais.filter((id) => id !== saidaId) : [...atuais, saidaId]));

  // Quem já está na rua não recebe outra saída montada à mão.
  const emEntrega = new Set(operacional?.indisponiveis.filter((item) => item.estado === "em_entrega").map((item) => item.id) ?? []);
  const elegiveis = entregadores.filter((item) => !emEntrega.has(item.id));
  const escolhido = elegiveis.find((item) => item.id === entregadorId) ?? null;
  const lista = saidas ?? [];
  const filtradas = filtrarSaidasDaOperacao(lista, filtro);
  const saidaDoMapa = mapaDe ? (lista.find((saida) => saida.id === mapaDe) ?? null) : null;

  return (
    <Secao titulo="Saídas de entrega" descricao={`As rotas de ${nomeEmpresa}: em formação, aguardando retirada, na rua e concluídas.`}>
      {/* Montagem manual continua disponível, mas não disputa atenção com a operação diária. */}
      <Cartao>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: montando }} onPress={() => setMontando((atual) => !atual)} style={({ pressed }) => [estilos.cabecalhoRecolhivel, pressed && estilos.apagado]}>
          <Texto variante="corpoMedio" style={estilos.flex}>
            Montar saída manual
          </Texto>
          <Icone nome={montando ? "menos" : "expandir"} tamanho={18} />
        </Pressable>
        {montando && (
          <View style={estilos.conteudoRecolhivel}>
            <Texto variante="pequeno" cor="conteudoSuave">
              Selecione os pedidos prontos que saem juntos e quem vai levar.
            </Texto>
            {prontos.length === 0 && (
              <Texto variante="pequeno" cor="conteudoSuave">
                Nenhum pedido pronto agora.
              </Texto>
            )}
            <View accessibilityLabel="Pedidos prontos">
              {prontos.map((pedido) => (
                <Marcacao
                  key={pedido.id}
                  rotulo={`Pedido #${pedido.numero} · ${pedido.cliente.nomeExibicao} · ${pedido.quantidadeItens} ${pedido.quantidadeItens === 1 ? "item" : "itens"} · ${formatarPrecoCentavos(pedido.totalCentavos)}`}
                  marcada={selecionados.includes(pedido.id)}
                  desabilitada={ocupado}
                  aoMudar={() => alternarPedido(pedido.id)}
                />
              ))}
            </View>
            <CampoDeEscolha rotulo="Entregador" valor={escolhido?.pessoa.nomeExibicao ?? (elegiveis.length === 0 ? "Nenhum entregador disponível" : "Escolha…")} aoAbrir={() => elegiveis.length > 0 && setEscolhendoEntregador(true)} />
            <Botao
              rotulo={`Criar saída com ${selecionados.length} ${selecionados.length === 1 ? "entrega" : "entregas"}`}
              carregando={ocupado}
              textoCarregando="Criando…"
              disabled={ocupado || selecionados.length === 0 || !escolhido}
              onPress={() => void montar()}
            />
          </View>
        )}
      </Cartao>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Filtrar rotas" contentContainerStyle={estilos.filtros}>
        {FILTROS_DA_OPERACAO.map((item) => {
          const marcado = filtro === item.id;
          return (
            <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: marcado }} onPress={() => setFiltro(item.id)} style={[estilos.filtro, marcado && estilos.filtroMarcado]}>
              <Texto variante="pequenoMedio" cor={marcado ? "marcaConteudo" : "conteudoSuave"}>
                {item.rotulo} ({filtrarSaidasDaOperacao(lista, item.id).length})
              </Texto>
            </Pressable>
          );
        })}
      </ScrollView>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {saidas === null && !erro && <Carregando texto="Carregando rotas…" />}

      {saidas !== null && filtradas.length === 0 && <Texto cor="conteudoSuave">{FILTROS_DA_OPERACAO.find((item) => item.id === filtro)?.vazio}</Texto>}

      {filtradas.map((saida) => {
        const aberta = abertas.includes(saida.id);
        const posicao = posicoes.find((item) => item.saidaId === saida.id) ?? null;
        const proxima = paradasAtivas(saida)[0] ?? null;
        return (
          <Cartao key={saida.id} accessibilityLabel={nomeDaRota(saida)}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: aberta }} onPress={() => alternarRota(saida.id)} style={({ pressed }) => [estilos.resumoDaRota, pressed && estilos.apagado]}>
              <View style={estilos.textoDaRota}>
                <View style={estilos.tituloDaRota}>
                  <Selo rotulo={rotuloStatusSaida(saida)} tom={tomDoStatusSaida(saida.status)} />
                  <Texto variante="corpoForte" numberOfLines={1} style={estilos.encolhe}>
                    {nomeDaRota(saida)}
                  </Texto>
                </View>
                <Texto variante="pequeno" cor="conteudoSuave">
                  {resumoDaRota(saida, configuracao?.maxPedidosPorSaida ?? null)}
                </Texto>
                <Texto variante="pequeno">{saida.entregador ? `Entregador: ${saida.entregador.nomeExibicao}` : "Entregador: aguardando"}</Texto>
              </View>
              <Icone nome={aberta ? "menos" : "expandir"} tamanho={18} />
            </Pressable>

            {aberta && (
              <View style={estilos.conteudoDaRota}>
                {saida.zonaPrincipal && (
                  <Texto variante="pequeno" cor="conteudoSuave">
                    {[saida.zonaPrincipal.nome, ...saida.zonasCombinadas.map((zona) => zona.nome)].join(" + ")}
                    {saida.automatica ? " · montada automaticamente" : ""}
                  </Texto>
                )}
                {podeLiberarSaida(saida) && <Botao rotulo="Liberar para retirada" carregando={ocupado} disabled={ocupado} onPress={() => void liberar(saida)} />}
                {/* Contato pela conversa DIRETA de sempre, agindo como a empresa. */}
                {saida.entregador && <Botao rotulo={`Conversar com ${saida.entregador.nomeExibicao}`} aparencia="secundario" compacto onPress={() => saida.entregador && aoAbrirConversa(saida.entregador.nomeUsuario)} />}

                <SequenciaDaRota saida={saida} aoConversar={aoAbrirConversa} />

                {saida.status === "em_andamento" && (
                  <Texto variante="pequeno" cor="conteudoSuave">
                    {rotuloUltimaPosicao(posicao)}
                  </Texto>
                )}
                <Botao rotulo="Exibir mapa" aparencia="secundario" compacto onPress={() => setMapaDe(saida.id)} />
                <Texto variante="pequeno" cor="conteudoSuave">
                  Próxima parada: {proxima?.cliente.nomeExibicao ?? "—"}
                  {proxima ? ` (${formatarEnderecoResumido(proxima.destino)})` : ""}
                </Texto>
              </View>
            )}
          </Cartao>
        );
      })}

      {/* Mapbox, como na área do entregador: o MESMO percurso que a API guardou para esta ordem. */}
      {saidaDoMapa && <TelaMapaDaRota saida={saidaDoMapa} empresa={{ posicao: posicoes.find((item) => item.saidaId === saidaDoMapa.id) ?? null }} aoFechar={() => setMapaDe(null)} />}

      <FolhaDeEscolha titulo="Entregador" aberta={escolhendoEntregador} atual={entregadorId} itens={elegiveis.map((entregador) => ({ id: entregador.id, rotulo: entregador.pessoa.nomeExibicao }))} aoEscolher={setEntregadorId} aoFechar={() => setEscolhendoEntregador(false)} />
    </Secao>
  );
}

/**
 * A sequência da rota, SÓ LEITURA: a empresa acompanha; quem reordena é o entregador. Paradas
 * encerradas continuam visíveis como histórico da operação.
 */
function SequenciaDaRota({ saida, aoConversar }: { saida: SaidaEntrega; aoConversar: (nomeUsuario: string) => void }) {
  const ativas = paradasAtivas(saida);
  const encerradas = saida.paradas.filter((parada) => parada.encerradaEm !== null).sort((a, b) => a.posicao - b.posicao);
  const percurso = resumoDoPercurso(saida);
  return (
    <View style={estilos.sequencia}>
      <Texto variante="mini" cor="conteudoSuave">
        {ativas.length > 1 ? "Sequência sugerida pelo Jaaa — o entregador pode mudar a ordem." : ativas.length === 1 ? "Parada única nesta rota." : "Nenhuma entrega ativa nesta saída."}
      </Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        {percurso.texto}
      </Texto>
      {percurso.ehTrajeto && (
        <Texto variante="mini" cor="conteudoSuave">
          Tempo de trajeto, não é previsão de entrega.
        </Texto>
      )}
      {ativas.map((parada, indice) => (
        <View key={parada.id} style={[estilos.parada, indice === 0 && estilos.paradaProxima]}>
          <View style={estilos.numeroDaParada}>
            <Texto variante="corpoForte" cor="marcaConteudo">
              {indice + 1}
            </Texto>
          </View>
          <View style={estilos.textoDaRota}>
            {indice === 0 && (
              <Texto variante="miniForte" cor="marca" style={estilos.maiusculas}>
                Próxima parada
              </Texto>
            )}
            <Texto variante="corpoMedio">
              {indice + 1}ª parada · Pedido #{parada.numeroPedido}
            </Texto>
            <Texto variante="corpoMedio">{formatarEnderecoResumido(parada.destino)}</Texto>
            <Texto variante="pequeno" cor="conteudoSuave">
              {parada.destino.bairro}, {parada.destino.cidade}/{parada.destino.uf}
            </Texto>
            <Texto variante="pequeno" cor="conteudoSuave">
              Cliente: {parada.cliente.nomeExibicao} · {formatarPrecoCentavos(parada.totalCentavos)}
            </Texto>
            <Texto variante="pequeno" cor="conteudoSuave">
              Status: {ROTULO_STATUS_PEDIDO[parada.statusPedido]}
            </Texto>
            <Botao rotulo={`Conversar com ${parada.cliente.nomeExibicao}`} aparencia="discreto" compacto onPress={() => aoConversar(parada.cliente.nomeUsuario)} />
          </View>
        </View>
      ))}
      {encerradas.map((parada) => (
        <View key={parada.id} style={estilos.encerrada}>
          <Icone nome="check" tamanho={14} />
          <Texto variante="pequeno" cor="conteudoSuave" style={estilos.flex}>
            Pedido #{parada.numeroPedido} · {parada.cliente.nomeExibicao} — {parada.motivoEncerramento ?? ROTULO_STATUS_PEDIDO[parada.statusPedido]}
          </Texto>
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  encolhe: { flexShrink: 1 },
  apagado: { opacity: 0.6 },
  cabecalhoRecolhivel: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, minHeight: ALTURA_TOQUE, paddingHorizontal: Espaco.quatro },
  conteudoRecolhivel: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth, gap: Espaco.tres, padding: Espaco.quatro },
  filtros: { gap: Espaco.dois, paddingRight: Espaco.quatro },
  filtro: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 1, justifyContent: "center", minHeight: 36, paddingHorizontal: Espaco.tres },
  filtroMarcado: { backgroundColor: Cores.marca, borderColor: Cores.marca },
  resumoDaRota: { alignItems: "flex-start", flexDirection: "row", gap: Espaco.dois, padding: Espaco.tres },
  textoDaRota: { flex: 1, gap: 2, minWidth: 0 },
  tituloDaRota: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  conteudoDaRota: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth, gap: Espaco.tres, padding: Espaco.tres },
  sequencia: { gap: Espaco.dois },
  parada: { alignItems: "flex-start", borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, flexDirection: "row", gap: Espaco.tres, padding: Espaco.tres },
  paradaProxima: { backgroundColor: Cores.selecionadoFundo, borderColor: Cores.marca },
  numeroDaParada: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.total, height: 32, justifyContent: "center", width: 32 },
  maiusculas: { letterSpacing: 0.4, textTransform: "uppercase" },
  encerrada: { alignItems: "center", flexDirection: "row", gap: Espaco.um },
});
