import {
  EVENTO_DESPACHO_ATUALIZADO,
  MAXIMO_PEDIDOS_POR_SAIDA_MAXIMO,
  MAXIMO_PEDIDOS_POR_SAIDA_MINIMO,
  MINIMO_VERTICES_ZONA,
  NOME_ZONA_TAMANHO_MAXIMO,
  TEMPO_FORMACAO_MAXIMO_MINUTOS,
  TEMPO_FORMACAO_MINIMO_MINUTOS,
  eventoDespachoAtualizadoSchema,
  type ConfiguracaoDespacho,
  type Coordenadas,
  type PainelDespacho,
  type PoligonoZona,
  type ZonaEntrega,
} from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Aviso, Carregando, Cartao, Secao, Selo } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco } from "@/constants/theme";
import { CENTRO_PADRAO } from "@/features/enderecos/lib/mapa-ponto";
import { atualizarZona, criarZona, definirCompatibilidades, obterBase, obterPainelDespacho, salvarConfiguracaoDespacho } from "@/features/entregas/lib/api-entregas-empresa";
import { Marcacao, mensagemDe } from "@/features/produtos/components/pecas";
import { centavosParaCampo } from "@/features/produtos/lib/precos";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { interpretarFreteDigitado, rotuloFreteZona } from "../lib/frete";
import { pendenciasDaZona } from "../lib/zonas-no-mapa";
import { MapaDaZona } from "./mapa-da-zona";

/*
 * LOGÍSTICA → ZONAS E AUTOMAÇÃO — como na Web (`area-zonas-empresa.tsx` + `painel-despacho.tsx`):
 * desenhar as áreas no mapa, dizer quais podem ser combinadas, definir a taxa de entrega de cada uma,
 * configurar a automação (quantidade/tempo, combinar, liberar, retorno à base) e ver as pendências.
 *
 * O cliente nunca escolhe zona nem vê nada disto; o entregador vê só a saída atribuída a ele.
 */
export function AbaZonas({ empresaId, nomeEmpresa, atualizacao }: { empresaId: string; nomeEmpresa: string; atualizacao: number }) {
  const [painel, setPainel] = useState<PainelDespacho | null>(null);
  const [editando, setEditando] = useState<{ zona: ZonaEntrega | null; abrirMapa: boolean } | null>(null);
  // Onde o mapa abre ao desenhar uma zona NOVA: a base confirmada da empresa.
  const [centroDaEmpresa, setCentroDaEmpresa] = useState<Coordenadas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const despacho = await obterPainelDespacho(empresaId);
    if (despacho.ok) {
      setPainel(despacho.dados);
      setErro(null);
    } else setErro(mensagemDe(despacho));
  }, [empresaId]);

  useEffect(() => {
    let ativo = true;
    void Promise.all([obterPainelDespacho(empresaId), obterBase(empresaId)]).then(([despacho, base]) => {
      if (!ativo) return;
      if (despacho.ok) setPainel(despacho.dados);
      else setErro(mensagemDe(despacho));
      // Só a base com ponto CONFIRMADO serve de centro; sem ela o mapa continua no padrão.
      if (base.ok && base.dados.latitude !== null && base.dados.longitude !== null) setCentroDaEmpresa({ latitude: base.dados.latitude, longitude: base.dados.longitude });
    });
    return () => {
      ativo = false;
    };
  }, [empresaId, atualizacao]);

  // A formação anda sozinha (pedido entrou, saída fechou) e um pedido pode cair fora das zonas: sem recarregar.
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoDespacho = (evento: unknown) => {
      const resultado = eventoDespachoAtualizadoSchema.safeParse(evento);
      if (resultado.success) setPainel(resultado.data.painel);
    };
    const reler = () => void carregar();
    socket.on(EVENTO_DESPACHO_ATUALIZADO, aoDespacho);
    socket.on("connect", reler);
    return () => {
      socket.off(EVENTO_DESPACHO_ATUALIZADO, aoDespacho);
      socket.off("connect", reler);
    };
  }, [carregar]);

  async function salvarConfiguracao(configuracao: ConfiguracaoDespacho) {
    setOcupado(true);
    setRecado(null);
    try {
      const resultado = await salvarConfiguracaoDespacho(empresaId, configuracao);
      if (resultado.ok) {
        setPainel(resultado.dados);
        setErro(null);
        setRecado("Automação salva");
      } else setErro(mensagemDe(resultado));
    } finally {
      setOcupado(false);
    }
  }

  async function salvarZona(zona: ZonaEntrega | null, nome: string, vertices: PoligonoZona, freteCentavos: number) {
    setOcupado(true);
    setRecado(null);
    try {
      const entrada = { nome, vertices, freteCentavos, ativa: zona?.ativa ?? true };
      const resultado = zona ? await atualizarZona(empresaId, zona.id, entrada) : await criarZona(empresaId, entrada);
      if (!resultado.ok) {
        // Inclui geometria inválida e sobreposição com outra zona ativa: a mensagem é a do servidor.
        setErro(mensagemDe(resultado));
        return;
      }
      setErro(null);
      setEditando(null);
      setRecado(zona ? "Zona salva" : "Zona criada");
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function alternarZona(zona: ZonaEntrega) {
    setOcupado(true);
    setRecado(null);
    try {
      const resultado = await atualizarZona(empresaId, zona.id, { nome: zona.nome, vertices: zona.vertices, ativa: !zona.ativa });
      await carregar();
      setErro(resultado.ok ? null : mensagemDe(resultado));
    } finally {
      setOcupado(false);
    }
  }

  async function alternarCompatibilidade(zona: ZonaEntrega, outraId: string) {
    const novas = zona.compativeisCom.includes(outraId) ? zona.compativeisCom.filter((id) => id !== outraId) : [...zona.compativeisCom, outraId];
    setOcupado(true);
    try {
      const resultado = await definirCompatibilidades(empresaId, zona.id, novas);
      if (!resultado.ok) setErro(mensagemDe(resultado));
      else {
        setErro(null);
        setPainel((atual) => (atual ? { ...atual, zonas: resultado.dados.zonas } : atual));
      }
    } finally {
      setOcupado(false);
    }
  }

  const zonas = painel?.zonas ?? [];
  const abrir = (zona: ZonaEntrega | null, abrirMapa: boolean) => {
    setErro(null);
    setRecado(null);
    setEditando({ zona, abrirMapa });
  };

  return (
    <>
      <Secao titulo="Zonas de entrega" descricao={`As áreas que ${nomeEmpresa} atende, com a taxa de cada uma.`}>
        {painel === null && !erro && <Carregando texto="Carregando zonas…" />}
        {painel !== null && zonas.length === 0 && !editando && <Texto cor="conteudoSuave">Nenhuma zona ainda. Desenhe a primeira no mapa.</Texto>}

        {!editando &&
          zonas.map((zona) => (
            <Cartao key={zona.id} accessibilityLabel={`Zona ${zona.nome}`} style={estilos.cartao}>
              <View style={estilos.titulo}>
                <Texto variante="corpoForte" style={estilos.encolhe}>
                  {zona.nome}
                </Texto>
                <Selo rotulo={zona.ativa ? "Ativa" : "Desativada"} tom={zona.ativa ? "marca" : "neutro"} />
              </View>
              <Texto variante="pequeno" cor="conteudoSuave">
                {rotuloFreteZona(zona.freteCentavos)} · {zona.vertices.length} pontos
              </Texto>
              <View style={estilos.acoes}>
                <Botao rotulo="Editar dados" aparencia="secundario" compacto disabled={ocupado} onPress={() => abrir(zona, false)} />
                <Botao rotulo="Editar no mapa" aparencia="secundario" compacto disabled={ocupado} onPress={() => abrir(zona, true)} />
                <Botao rotulo={zona.ativa ? "Desativar" : "Ativar"} aparencia="secundario" compacto disabled={ocupado} onPress={() => void alternarZona(zona)} />
              </View>
              {/* Compatibilidade é decisão explícita: o Jaaa não adivinha vizinhança. */}
              {zonas.length > 1 && (
                <View style={estilos.compatibilidades}>
                  <Texto variante="pequeno" cor="conteudoSuave">
                    Pode combinar com:
                  </Texto>
                  {zonas
                    .filter((outra) => outra.id !== zona.id)
                    .map((outra) => (
                      <Marcacao key={outra.id} rotulo={outra.nome} marcada={zona.compativeisCom.includes(outra.id)} desabilitada={ocupado} aoMudar={() => void alternarCompatibilidade(zona, outra.id)} />
                    ))}
                </View>
              )}
            </Cartao>
          ))}

        {!editando && painel !== null && <Botao rotulo="Criar zona" onPress={() => abrir(null, false)} />}

        {editando && (
          <EditorDeZona
            key={editando.zona?.id ?? "nova"}
            zona={editando.zona}
            abrirMapaInicial={editando.abrirMapa}
            centroDaEmpresa={centroDaEmpresa}
            outras={zonas.filter((zona) => zona.id !== editando.zona?.id)}
            ocupado={ocupado}
            erro={erro}
            aoSalvar={(nome, vertices, freteCentavos) => void salvarZona(editando.zona, nome, vertices, freteCentavos)}
            aoCancelar={() => {
              setErro(null);
              setEditando(null);
            }}
          />
        )}

        {recado && !editando && (
          <Texto variante="corpoMedio" cor="marca" accessibilityLiveRegion="polite">
            {recado}
          </Texto>
        )}
        {erro && !editando && <Aviso tom="erro">{erro}</Aviso>}
      </Secao>

      {painel && !editando && (
        <Secao titulo="Automação das entregas" descricao="Como o Jaaa junta os pedidos prontos em rotas e chama o próximo entregador da fila.">
          <ConfiguracaoDaAutomacao key={JSON.stringify(painel.configuracao)} configuracao={painel.configuracao} ocupado={ocupado} aoSalvar={(configuracao) => void salvarConfiguracao(configuracao)} />
          <PendenciasForaDeZona painel={painel} />
        </Secao>
      )}
    </>
  );
}

/**
 * Dados da zona (nome, taxa, área). O desenho é feito no mapa em tela inteira e a geometria final é
 * validada no SERVIDOR (polígono simples, sem sobrepor outra zona ativa).
 */
function EditorDeZona({
  zona,
  abrirMapaInicial,
  centroDaEmpresa,
  outras,
  ocupado,
  erro,
  aoSalvar,
  aoCancelar,
}: {
  zona: ZonaEntrega | null;
  abrirMapaInicial: boolean;
  centroDaEmpresa: Coordenadas | null;
  outras: ZonaEntrega[];
  ocupado: boolean;
  erro: string | null;
  aoSalvar: (nome: string, vertices: PoligonoZona, freteCentavos: number) => void;
  aoCancelar: () => void;
}) {
  const [vertices, setVertices] = useState<PoligonoZona>(zona?.vertices ?? []);
  const [nome, setNome] = useState(zona?.nome ?? "");
  // Taxa em reais no campo; o que vai para a API são centavos inteiros (0 = frete grátis).
  const [freteDigitado, setFreteDigitado] = useState(centavosParaCampo(zona?.freteCentavos ?? 0));
  const [mapaAberto, setMapaAberto] = useState(abrirMapaInicial);
  const freteCentavos = interpretarFreteDigitado(freteDigitado);
  const pendencias = pendenciasDaZona({ nome, freteCentavos, vertices: vertices.length, minimoVertices: MINIMO_VERTICES_ZONA });

  return (
    <Cartao accessibilityLabel="Editar zona" style={estilos.cartao}>
      <Texto variante="subtitulo">{zona ? `Editar ${zona.nome}` : "Nova zona"}</Texto>
      <CampoTexto rotulo="Nome da zona" value={nome} maxLength={NOME_ZONA_TAMANHO_MAXIMO} onChangeText={setNome} />
      <CampoTexto rotulo="Taxa de entrega (R$)" value={freteDigitado} keyboardType="decimal-pad" placeholder="0,00" dica={freteCentavos === 0 ? "Frete grátis. Valor fixo cobrado de quem recebe nesta área." : "Valor fixo cobrado de quem recebe nesta área. 0,00 = frete grátis."} onChangeText={setFreteDigitado} />
      <Texto variante="pequeno" cor="conteudoSuave">
        {vertices.length} {vertices.length === 1 ? "ponto marcado" : "pontos marcados"}
        {vertices.length < MINIMO_VERTICES_ZONA ? ` · marque ao menos ${MINIMO_VERTICES_ZONA}` : ""}
      </Texto>
      <Botao rotulo="Editar área no mapa" aparencia="secundario" onPress={() => setMapaAberto(true)} />

      {/* Botão desabilitado sem explicação é beco sem saída: aqui a tela diz o que falta. */}
      {pendencias.length > 0 && (
        <Texto variante="pequeno" cor="aviso">
          Para salvar: {pendencias.join(" e ")}.
        </Texto>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <View style={estilos.acoes}>
        <Botao rotulo="Salvar zona" carregando={ocupado} textoCarregando="Salvando…" disabled={ocupado || pendencias.length > 0} onPress={() => freteCentavos !== null && aoSalvar(nome.trim(), vertices, freteCentavos)} />
        <Botao rotulo="Cancelar alterações" aparencia="secundario" disabled={ocupado} onPress={aoCancelar} />
      </View>

      {mapaAberto && (
        <MapaDaZona
          titulo={zona ? `Área de ${zona.nome}` : "Área da nova zona"}
          // Editando: a própria área. Nova: a base da empresa. Sem base confirmada: o padrão.
          centro={centroDaEmpresa ?? CENTRO_PADRAO}
          verticesIniciais={vertices}
          outras={outras.map((item) => ({ nome: item.nome, vertices: item.vertices }))}
          aoConcluir={(novos) => {
            setVertices(novos);
            setMapaAberto(false);
          }}
          // Cancelar no mapa descarta só o que foi desenhado NESTA abertura.
          aoCancelar={() => setMapaAberto(false)}
        />
      )}
    </Cartao>
  );
}

function ConfiguracaoDaAutomacao({ configuracao, ocupado, aoSalvar }: { configuracao: ConfiguracaoDespacho; ocupado: boolean; aoSalvar: (entrada: ConfiguracaoDespacho) => void }) {
  const [maximo, setMaximo] = useState(String(configuracao.maxPedidosPorSaida));
  const [tempo, setTempo] = useState(String(configuracao.tempoFormacaoMinutos));
  const [combinar, setCombinar] = useState(configuracao.combinarZonas);
  const [liberacao, setLiberacao] = useState(configuracao.liberacaoAutomatica);
  const [retorno, setRetorno] = useState(configuracao.saidasExigemRetornoBase);
  const [erro, setErro] = useState<string | null>(null);

  const inteiro = (texto: string) => (/^\d+$/.test(texto.trim()) ? Number(texto.trim()) : null);
  const maxPedidosPorSaida = inteiro(maximo);
  const tempoFormacaoMinutos = inteiro(tempo);
  const alterado = maxPedidosPorSaida !== configuracao.maxPedidosPorSaida || tempoFormacaoMinutos !== configuracao.tempoFormacaoMinutos || combinar !== configuracao.combinarZonas || liberacao !== configuracao.liberacaoAutomatica || retorno !== configuracao.saidasExigemRetornoBase;

  function salvar() {
    if (maxPedidosPorSaida === null || maxPedidosPorSaida < MAXIMO_PEDIDOS_POR_SAIDA_MINIMO || maxPedidosPorSaida > MAXIMO_PEDIDOS_POR_SAIDA_MAXIMO) {
      setErro(`O máximo de pedidos por saída vai de ${MAXIMO_PEDIDOS_POR_SAIDA_MINIMO} a ${MAXIMO_PEDIDOS_POR_SAIDA_MAXIMO}.`);
      return;
    }
    if (tempoFormacaoMinutos === null || tempoFormacaoMinutos < TEMPO_FORMACAO_MINIMO_MINUTOS || tempoFormacaoMinutos > TEMPO_FORMACAO_MAXIMO_MINUTOS) {
      setErro(`O tempo de formação vai de ${TEMPO_FORMACAO_MINIMO_MINUTOS} a ${TEMPO_FORMACAO_MAXIMO_MINUTOS} minutos.`);
      return;
    }
    setErro(null);
    aoSalvar({ maxPedidosPorSaida, tempoFormacaoMinutos, combinarZonas: combinar, liberacaoAutomatica: liberacao, saidasExigemRetornoBase: retorno });
  }

  return (
    <Cartao accessibilityLabel="Automação das entregas" style={estilos.cartao}>
      <View style={estilos.duasColunas}>
        <View style={estilos.flex}>
          <CampoTexto rotulo="Máximo de pedidos por saída" value={maximo} keyboardType="number-pad" maxLength={2} editable={!ocupado} onChangeText={setMaximo} />
        </View>
        <View style={estilos.flex}>
          <CampoTexto rotulo="Tempo máximo de formação (min)" value={tempo} keyboardType="number-pad" maxLength={3} editable={!ocupado} onChangeText={setTempo} />
        </View>
      </View>
      <Chave rotulo="Combinar zonas compatíveis quando houver pouco volume" ligada={combinar} desabilitada={ocupado} aoMudar={setCombinar} />
      <Chave rotulo="Liberação automática" ligada={liberacao} desabilitada={ocupado} aoMudar={setLiberacao} />
      {/* Regra da OPERAÇÃO (não do pagamento): a volta à base entra na escolha da ordem e no trajeto. */}
      <Chave rotulo="Entregador volta à base ao terminar a saída" ligada={retorno} desabilitada={ocupado} aoMudar={setRetorno} />
      <Texto variante="pequeno" cor="conteudoSuave">
        A quantidade OU o tempo conclui a montagem. Com liberação automática ativa, a retirada também é liberada nesse momento.
      </Texto>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Botao rotulo="Salvar automação" carregando={ocupado} textoCarregando="Salvando…" disabled={ocupado || !alterado} onPress={salvar} />
    </Cartao>
  );
}

function Chave({ rotulo, ligada, desabilitada, aoMudar }: { rotulo: string; ligada: boolean; desabilitada: boolean; aoMudar: (ligada: boolean) => void }) {
  return (
    <View style={estilos.chave}>
      <Texto style={estilos.flex}>{rotulo}</Texto>
      <Switch value={ligada} disabled={desabilitada} onValueChange={aoMudar} trackColor={{ true: Cores.marca, false: Cores.borda }} thumbColor={Cores.superficie} accessibilityLabel={rotulo} />
    </View>
  );
}

// Pedidos prontos cujo ponto não caiu em zona nenhuma: pendência explícita, nunca encaixe forçado.
function PendenciasForaDeZona({ painel }: { painel: PainelDespacho }) {
  if (!painel.automacaoAtiva) return <Aviso tom="atencao">Nenhuma zona ativa: as saídas continuam sendo montadas à mão.</Aviso>;
  if (painel.pedidosForaDeZona.length === 0) return <Texto cor="conteudoSuave">Nenhum pedido fora das zonas configuradas.</Texto>;
  return (
    <View style={estilos.compatibilidades}>
      <Texto variante="pequenoForte" cor="aviso">
        Pedidos fora das zonas configuradas
      </Texto>
      {painel.pedidosForaDeZona.map((pedido) => (
        <Aviso key={pedido.id} tom="atencao">
          Pedido #{pedido.numero} · {pedido.cliente.nomeExibicao} · {pedido.quantidadeItens} {pedido.quantidadeItens === 1 ? "item" : "itens"} — trate manualmente (monte a saída ou ajuste as zonas).
        </Aviso>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  encolhe: { flexShrink: 1 },
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  titulo: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  acoes: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  compatibilidades: { gap: Espaco.um },
  duasColunas: { alignItems: "flex-end", flexDirection: "row", gap: Espaco.tres },
  chave: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: ALTURA_TOQUE },
});
