import {
  EVENTO_ENTREGADOR_DISPONIBILIDADE,
  EVENTO_FILA_ATUALIZADA,
  RAIO_BASE_MAXIMO_METROS,
  RAIO_BASE_MINIMO_METROS,
  ROTULO_ESTADO_OPERACIONAL,
  ROTULO_STATUS_ENTREGADOR,
  UNIDADES_FEDERACAO,
  baseTemPontoConfirmado,
  ABA_INICIAL_DO_QUADRO_DE_ENTREGADORES,
  ABA_OPERACAO_DA_BASE,
  GRUPOS_DO_QUADRO_DE_ENTREGADORES,
  ROTULO_ABA_OPERACAO_DA_BASE,
  classificarQuadroDeEntregadores,
  eventoEntregadorDisponibilidadeSchema,
  eventoFilaAtualizadaSchema,
  formatarCep,
  formatarEnderecoResumido,
  type AbaDoQuadroDeEntregadores,
  type BaseEmpresa,
  type CandidatoEntregador,
  type Coordenadas,
  type EntregadorDaEmpresa,
  type EntregadorOperacional,
  type PainelOperacional,
} from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { Aviso, Carregando, Cartao, Secao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { MapaPonto } from "@/features/enderecos/components/mapa-ponto";
import { MapaPontoMapbox, useMapboxDoMapaDePonto } from "@/features/enderecos/components/mapa-ponto-mapbox";
import { consultarCepNaApi } from "@/features/enderecos/lib/api-enderecos";
import { MENSAGEM_CEP, criarConsultorCep, type SituacaoCep } from "@/features/enderecos/lib/consulta-cep";
import { mascararCep } from "@/features/enderecos/lib/formulario-endereco";
import { CENTRO_PADRAO } from "@/features/enderecos/lib/mapa-ponto";
import { alterarStatusEntregador, buscarCandidatosEntregador, confirmarPontoBase, convidarEntregador, listarEntregadores, obterBase, obterPainelOperacional, obterSugestaoLocalizacaoBase, salvarBase } from "@/features/entregas/lib/api-entregas-empresa";
import { CampoDeEscolha, FolhaDeEscolha, mensagemDe } from "@/features/produtos/components/pecas";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";

/*
 * LOGÍSTICA → ENTREGADORES — o quadro de entregadores e a operação da base, como na Web
 * (`quadro-entregadores.tsx` + `painel-operacional.tsx`).
 *
 * Entregador NÃO é administrador: aqui a empresa só cria o vínculo (convite pelo @usuario público) e
 * liga/desliga quem pode entregar. Da base, a empresa vê apenas estados derivados ("na base", "fora da
 * base"), nunca a posição de ninguém.
 */
const ESPERA_DA_BUSCA_MS = 300;

export function AbaEntregadores({ empresaId, nomeEmpresa }: { empresaId: string; nomeEmpresa: string }) {
  const [painel, setPainel] = useState<PainelOperacional | null>(null);
  const [erroDoPainel, setErroDoPainel] = useState<string | null>(null);
  const [entregadores, setEntregadores] = useState<EntregadorDaEmpresa[] | null>(null);
  // Só UMA situação aparece por vez; trocar de opção não consulta nem altera nada.
  const [aba, setAba] = useState<AbaDoQuadroDeEntregadores>(ABA_INICIAL_DO_QUADRO_DE_ENTREGADORES);
  const [convidando, setConvidando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregarPainel = useCallback(async () => {
    const resultado = await obterPainelOperacional(empresaId);
    if (resultado.ok) {
      setPainel(resultado.dados);
      setErroDoPainel(null);
    } else setErroDoPainel(mensagemDe(resultado));
  }, [empresaId]);

  const recarregar = useCallback(async () => {
    const resultado = await listarEntregadores(empresaId);
    if (resultado.ok) setEntregadores(resultado.dados.entregadores);
    else setErro(mensagemDe(resultado));
  }, [empresaId]);

  useEffect(() => {
    let ativo = true;
    void Promise.all([obterPainelOperacional(empresaId), listarEntregadores(empresaId)]).then(([doPainel, daLista]) => {
      if (!ativo) return;
      if (doPainel.ok) setPainel(doPainel.dados);
      else setErroDoPainel(mensagemDe(doPainel));
      if (daLista.ok) setEntregadores(daLista.dados.entregadores);
      else setErro(mensagemDe(daLista));
    });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  // Chegou/saiu alguém, alguém parou de aceitar, a fila andou: a empresa vê na hora, sem recarregar.
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizarFila = (evento: unknown) => {
      const resultado = eventoFilaAtualizadaSchema.safeParse(evento);
      if (resultado.success) setPainel(resultado.data.painel);
    };
    // Quem ficou disponível/indisponível chega em tempo real (só para esta empresa).
    const aoAtualizarDisponibilidade = (evento: unknown) => {
      const resultado = eventoEntregadorDisponibilidadeSchema.safeParse(evento);
      if (!resultado.success) return;
      const atualizado = resultado.data.entregador;
      setEntregadores((atuais) => atuais?.map((item) => (item.id === atualizado.id ? atualizado : item)) ?? null);
      if (atualizado.disponivel) setAviso(`${atualizado.pessoa.nomeExibicao} está disponível para entregas.`);
    };
    const reler = () => {
      void carregarPainel();
      void recarregar();
    };
    socket.on(EVENTO_FILA_ATUALIZADA, aoAtualizarFila);
    socket.on(EVENTO_ENTREGADOR_DISPONIBILIDADE, aoAtualizarDisponibilidade);
    socket.on("connect", reler);
    return () => {
      socket.off(EVENTO_FILA_ATUALIZADA, aoAtualizarFila);
      socket.off(EVENTO_ENTREGADOR_DISPONIBILIDADE, aoAtualizarDisponibilidade);
      socket.off("connect", reler);
    };
  }, [carregarPainel, recarregar]);

  async function alterar(entregador: EntregadorDaEmpresa, status: "ativo" | "inativo") {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const resultado = await alterarStatusEntregador(empresaId, entregador.id, status);
      if (!resultado.ok) {
        setErro(mensagemDe(resultado));
        return;
      }
      // Desativar revoga na hora as entregas em aberto dele (o servidor encerra as atribuições).
      if (status === "inativo") setAviso(`${entregador.pessoa.nomeExibicao} não recebe novas entregas e perdeu as que estavam com ele.`);
      await Promise.all([recarregar(), carregarPainel()]);
    } finally {
      setOcupado(false);
    }
  }

  // A classificação é do contrato compartilhado: a tela só mostra o grupo escolhido.
  const quadro = entregadores && painel ? classificarQuadroDeEntregadores(entregadores, painel) : null;
  const pendentes = entregadores?.filter((item) => item.status === "convidado") ?? [];
  const grupo = GRUPOS_DO_QUADRO_DE_ENTREGADORES.find((item) => item.id === aba) ?? null;
  const linhas = grupo && quadro ? quadro.grupos[grupo.id] : null;

  return (
    <Secao titulo="Entregadores" descricao={`Quem pode entregar por ${nomeEmpresa}.`}>
      {/* O ÚNICO caminho para convidar: abre a busca e mostra os convites que ainda aguardam aceite. */}
      <View style={estilos.acoes}>
        <Botao rotulo={convidando ? "Fechar convite" : "Convidar entregador"} aparencia={convidando ? "secundario" : "principal"} compacto onPress={() => setConvidando((atual) => !atual)} />
        {!convidando && pendentes.length > 0 && (
          <Texto variante="pequeno" cor="conteudoSuave" accessibilityLabel={rotuloDosPendentes(pendentes.length)}>
            {rotuloDosPendentes(pendentes.length)}
          </Texto>
        )}
      </View>
      {convidando && (
        <ConviteDeEntregador
          empresaId={empresaId}
          pendentes={pendentes}
          aoConvidar={(nomeUsuario) => {
            setErro(null);
            setAviso(`Convite enviado para @${nomeUsuario}. Ele vira entregador quando aceitar.`);
            void recarregar();
            void carregarPainel();
          }}
        />
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel="Situação dos entregadores" contentContainerStyle={estilos.abas}>
        {[...GRUPOS_DO_QUADRO_DE_ENTREGADORES.map((item) => ({ id: item.id as AbaDoQuadroDeEntregadores, rotulo: item.rotulo, quantidade: quadro ? quadro.grupos[item.id].length : null })), { id: ABA_OPERACAO_DA_BASE as AbaDoQuadroDeEntregadores, rotulo: ROTULO_ABA_OPERACAO_DA_BASE, quantidade: null }].map((item) => {
          const marcada = aba === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: marcada }}
              accessibilityLabel={item.quantidade === null ? item.rotulo : `${item.rotulo}: ${item.quantidade}`}
              onPress={() => setAba(item.id)}
              style={[estilos.aba, marcada && estilos.abaMarcada]}>
              <Texto variante="pequenoMedio" cor={marcada ? "marcaConteudo" : "conteudo"}>
                {item.rotulo}
              </Texto>
              {item.quantidade !== null && (
                <Texto variante="pequenoForte" cor={marcada ? "marcaConteudo" : "conteudoSuave"}>
                  {item.quantidade}
                </Texto>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {aba === ABA_OPERACAO_DA_BASE ? (
        <OperacaoDaBase empresaId={empresaId} painel={painel} erroDoPainel={erroDoPainel} />
      ) : (
        <>
          {linhas === null && !erro && !erroDoPainel && <Carregando texto="Carregando entregadores…" />}
          {linhas !== null && grupo && linhas.length === 0 && <Texto cor="conteudoSuave">{grupo.vazio}</Texto>}
          {linhas !== null && grupo && linhas.length > 0 && (
            <Cartao accessibilityLabel={grupo.rotulo}>
              {linhas.map((linha, indice) => (
                <View key={linha.entregador.id} style={[estilos.item, indice > 0 && estilos.comDivisa]}>
                  <View style={estilos.flex}>
                    <Texto variante="corpoMedio" numberOfLines={1}>
                      {linha.entregador.pessoa.nomeExibicao}
                    </Texto>
                    <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1}>
                      @{linha.entregador.pessoa.nomeUsuario}
                    </Texto>
                    <Texto variante="pequeno" cor={linha.emDestaque ? "marca" : "conteudoSuave"}>
                      {linha.situacao}
                    </Texto>
                  </View>
                  {linha.acao && <Botao rotulo={linha.acao.rotulo} aparencia="secundario" compacto disabled={ocupado} onPress={() => linha.acao && void alterar(linha.entregador, linha.acao.status)} />}
                </View>
              ))}
            </Cartao>
          )}
          {/* Sem ponto confirmado ninguém é detectado na base: explica por que "Disponíveis" está vazio. */}
          {painel && !painel.baseConfigurada && (aba === "disponiveis" || aba === "fora_da_base") && <Aviso tom="atencao">Confirme o ponto da base em “Operação da base” para que a chegada dos entregadores seja detectada.</Aviso>}
          {erroDoPainel && <Aviso tom="erro">{erroDoPainel}</Aviso>}
        </>
      )}

      {aviso && (
        <View accessibilityLiveRegion="polite" style={estilos.aviso}>
          <Icone nome="check" tamanho={16} cor="marca" />
          <Texto variante="corpoMedio" cor="marca" style={estilos.flex}>
            {aviso}
          </Texto>
        </View>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </Secao>
  );
}

const rotuloDosPendentes = (quantidade: number) => (quantidade === 1 ? "1 convite aguardando aceite" : `${quantidade} convites aguardando aceite`);

/**
 * CONVITE — o único fluxo: buscar a pessoa pelo nome ou @usuario público e enviar. Os convites ainda
 * não aceitos ficam aqui (e só aqui): convite pendente não é entregador ativo nem desativado.
 */
function ConviteDeEntregador({ empresaId, pendentes, aoConvidar }: { empresaId: string; pendentes: EntregadorDaEmpresa[]; aoConvidar: (nomeUsuario: string) => void }) {
  const [termo, setTermo] = useState("");
  const [candidatos, setCandidatos] = useState<CandidatoEntregador[]>([]);
  const [buscando, setBuscando] = useState(false);
  const buscaAtual = useRef(0);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const termoDaBusca = termo.trim();
  useEffect(() => {
    if (termoDaBusca.length < 2) {
      const limpeza = setTimeout(() => {
        setCandidatos([]);
        setBuscando(false);
      }, 0);
      return () => clearTimeout(limpeza);
    }
    const marca = ++buscaAtual.current;
    const temporizador = setTimeout(() => {
      setBuscando(true);
      void buscarCandidatosEntregador(empresaId, termoDaBusca).then((resultado) => {
        // Só a busca mais recente vale: resposta atrasada de um termo antigo é descartada.
        if (marca !== buscaAtual.current) return;
        setBuscando(false);
        if (resultado.ok) {
          setCandidatos(resultado.dados.candidatos);
          setErro(null);
        } else setErro(mensagemDe(resultado));
      });
    }, ESPERA_DA_BUSCA_MS);
    return () => clearTimeout(temporizador);
  }, [empresaId, termoDaBusca]);

  // Convite pelo @usuario PÚBLICO: a empresa não procura ninguém por telefone.
  async function convidar(candidato: CandidatoEntregador) {
    setErro(null);
    setOcupado(true);
    try {
      const resultado = await convidarEntregador(empresaId, candidato.pessoa.nomeUsuario);
      if (!resultado.ok) {
        setErro(mensagemDe(resultado));
        return;
      }
      setCandidatos((atuais) => atuais.filter((item) => item.pessoa.identidadeId !== candidato.pessoa.identidadeId));
      aoConvidar(resultado.dados.pessoa.nomeUsuario);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Cartao accessibilityLabel="Convidar entregador" style={estilos.cartao}>
      <CampoTexto rotulo="Nome ou @usuario" value={termo} maxLength={31} autoCapitalize="none" autoCorrect={false} placeholder="Buscar pessoa para convidar" onChangeText={setTermo} />
      {buscando && (
        <Texto variante="pequeno" cor="conteudoSuave">
          Procurando…
        </Texto>
      )}
      {!buscando && termoDaBusca.length >= 2 && candidatos.length === 0 && (
        <Texto variante="pequeno" cor="conteudoSuave">
          Nenhuma pessoa disponível para convite.
        </Texto>
      )}
      {candidatos.map((candidato) => (
        <View key={candidato.pessoa.identidadeId} accessibilityLabel={`Pessoa encontrada: ${candidato.pessoa.nomeExibicao}`} style={estilos.linhaComDivisa}>
          <View style={estilos.flex}>
            <Texto variante="corpoMedio" numberOfLines={1}>
              {candidato.pessoa.nomeExibicao}
            </Texto>
            <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1}>
              @{candidato.pessoa.nomeUsuario}
              {candidato.situacao === "inativo" ? " · Entregador inativo" : ""}
            </Texto>
          </View>
          <Botao rotulo="Enviar convite" compacto disabled={ocupado} onPress={() => void convidar(candidato)} />
        </View>
      ))}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {pendentes.length > 0 && (
        <View accessibilityLabel="Convites aguardando aceite" style={estilos.grupo}>
          <Texto variante="pequenoForte" cor="conteudoSuave">
            Aguardando aceite
          </Texto>
          {pendentes.map((pendente) => (
            <View key={pendente.id} style={estilos.linhaComDivisa}>
              <View style={estilos.flex}>
                <Texto variante="corpoMedio" numberOfLines={1}>
                  {pendente.pessoa.nomeExibicao}
                </Texto>
                <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1}>
                  @{pendente.pessoa.nomeUsuario} · {ROTULO_STATUS_ENTREGADOR.convidado}
                </Texto>
              </View>
            </View>
          ))}
        </View>
      )}
    </Cartao>
  );
}

interface RascunhoDaBase {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: BaseEmpresa["uf"];
  raio: string;
}

const rascunhoDaBase = (base: BaseEmpresa | null): RascunhoDaBase => ({
  cep: base ? formatarCep(base.cep) : "",
  logradouro: base?.logradouro ?? "",
  numero: base?.numero ?? "",
  complemento: base?.complemento ?? "",
  bairro: base?.bairro ?? "",
  cidade: base?.cidade ?? "",
  uf: base?.uf ?? "MG",
  raio: String(base?.raioMetros ?? 150),
});

/**
 * OPERAÇÃO DA BASE — o endereço e o ponto da base (raio, edição, mapa) e a FILA de quem está nela agora.
 * Fica numa opção própria: depois de configurada, a base não precisa estar à vista o tempo todo.
 */
function OperacaoDaBase({ empresaId, painel, erroDoPainel }: { empresaId: string; painel: PainelOperacional | null; erroDoPainel: string | null }) {
  // undefined = ainda lendo; null = a empresa ainda não cadastrou a base.
  const [base, setBase] = useState<BaseEmpresa | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoDaBase>(() => rascunhoDaBase(null));
  const [confirmandoPonto, setConfirmandoPonto] = useState(false);
  const [sugestao, setSugestao] = useState<Coordenadas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [escolhendoUf, setEscolhendoUf] = useState(false);
  const [situacaoCep, setSituacaoCep] = useState<SituacaoCep>("ocioso");
  const consultorCep = useRef<ReturnType<typeof criarConsultorCep> | null>(null);

  useEffect(() => {
    let ativo = true;
    void obterBase(empresaId).then((resultado) => {
      if (!ativo) return;
      setBase(resultado.ok ? resultado.dados : null);
      if (resultado.ok) setRascunho(rascunhoDaBase(resultado.dados));
    });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  // Endereço preenchido pelo CEP (consulta do servidor). O PONTO continua sendo confirmado no mapa.
  const consultarCep = (cep: string) => {
    consultorCep.current ??= criarConsultorCep({
      requisitar: consultarCepNaApi,
      aoMudarSituacao: setSituacaoCep,
      aoPreencher: (doCep) =>
        setRascunho((atual) => ({
          ...atual,
          logradouro: doCep.logradouro ?? atual.logradouro,
          bairro: doCep.bairro ?? atual.bairro,
          cidade: doCep.cidade ?? atual.cidade,
          uf: (doCep.uf as BaseEmpresa["uf"] | null | undefined) ?? atual.uf,
        })),
    });
    return consultorCep.current(cep);
  };

  async function salvar() {
    const raioMetros = /^\d+$/.test(rascunho.raio.trim()) ? Number(rascunho.raio.trim()) : Number.NaN;
    if (!Number.isInteger(raioMetros) || raioMetros < RAIO_BASE_MINIMO_METROS || raioMetros > RAIO_BASE_MAXIMO_METROS) {
      setErro(`O raio da base vai de ${RAIO_BASE_MINIMO_METROS} a ${RAIO_BASE_MAXIMO_METROS} metros.`);
      return;
    }
    setOcupado(true);
    try {
      const resultado = await salvarBase(empresaId, { cep: rascunho.cep, logradouro: rascunho.logradouro, numero: rascunho.numero, complemento: rascunho.complemento, bairro: rascunho.bairro, cidade: rascunho.cidade, uf: rascunho.uf, pontoReferencia: "", raioMetros });
      if (!resultado.ok) {
        setErro(mensagemDe(resultado));
        return;
      }
      setErro(null);
      setBase(resultado.dados);
      setRascunho(rascunhoDaBase(resultado.dados));
      setEditando(false);
    } finally {
      setOcupado(false);
    }
  }

  const confirmado = baseTemPontoConfirmado(base ?? null);

  async function abrirConfirmacao() {
    if (!base) return;
    setOcupado(true);
    try {
      // O palpite do endereço só serve para ABRIR o mapa perto; nunca vira o ponto sozinho.
      const palpite = confirmado ? null : await obterSugestaoLocalizacaoBase(empresaId);
      setSugestao(palpite?.ok ? palpite.dados.coordenadas : null);
      setErro(null);
      setConfirmandoPonto(true);
    } finally {
      setOcupado(false);
    }
  }

  const mostrarFormulario = base === null || editando;
  const mudar = (valores: Partial<RascunhoDaBase>) => setRascunho((atual) => ({ ...atual, ...valores }));

  return (
    <View accessibilityLabel="Operação da base" style={estilos.fila}>
      {base === undefined && <Carregando texto="Carregando a base…" />}

      {base && !mostrarFormulario && !confirmandoPonto && (
        <Cartao style={estilos.cartao}>
          <Texto>
            {base.logradouro}, {base.numero} — {base.bairro}, {base.cidade}/{base.uf} · CEP {formatarCep(base.cep)}
          </Texto>
          <View style={estilos.aviso}>
            <Icone nome="local" tamanho={16} cor={confirmado ? "marca" : "aviso"} />
            <Texto variante="pequenoMedio" cor={confirmado ? "marca" : "aviso"} style={estilos.flex}>
              {confirmado ? `Ponto da base confirmado · raio de ${base.raioMetros} m` : "Ponto da base ainda não confirmado"}
            </Texto>
          </View>
          <View style={estilos.acoes}>
            <Botao
              rotulo="Editar base"
              aparencia="secundario"
              compacto
              disabled={ocupado}
              onPress={() => {
                setRascunho(rascunhoDaBase(base));
                setErro(null);
                setEditando(true);
              }}
            />
            <Botao rotulo={confirmado ? "Ajustar ponto no mapa" : "Confirmar ponto no mapa"} aparencia={confirmado ? "secundario" : "principal"} compacto disabled={ocupado} onPress={() => void abrirConfirmacao()} />
          </View>
        </Cartao>
      )}

      {base !== undefined && mostrarFormulario && (
        <Cartao accessibilityLabel="Base da empresa" style={estilos.cartao}>
          <CampoTexto
            rotulo="CEP"
            value={rascunho.cep}
            keyboardType="number-pad"
            maxLength={9}
            placeholder="30123-000"
            {...(MENSAGEM_CEP[situacaoCep] ? { dica: MENSAGEM_CEP[situacaoCep] } : {})}
            onChangeText={(texto) => {
              const cep = mascararCep(texto);
              mudar({ cep });
              void consultarCep(cep);
            }}
            onBlur={() => void consultarCep(rascunho.cep)}
          />
          <CampoTexto rotulo="Logradouro" value={rascunho.logradouro} maxLength={120} onChangeText={(logradouro) => mudar({ logradouro })} />
          <View style={estilos.duasColunas}>
            <View style={estilos.flex}>
              <CampoTexto rotulo="Número" value={rascunho.numero} maxLength={20} onChangeText={(numero) => mudar({ numero })} />
            </View>
            <View style={estilos.flex}>
              <CampoTexto rotulo="Complemento" value={rascunho.complemento} maxLength={60} placeholder="Opcional" onChangeText={(complemento) => mudar({ complemento })} />
            </View>
          </View>
          <CampoTexto rotulo="Bairro" value={rascunho.bairro} maxLength={80} onChangeText={(bairro) => mudar({ bairro })} />
          <View style={estilos.duasColunas}>
            <View style={estilos.flex}>
              <CampoTexto rotulo="Cidade" value={rascunho.cidade} maxLength={80} onChangeText={(cidade) => mudar({ cidade })} />
            </View>
            <View style={estilos.estreito}>
              <CampoDeEscolha rotulo="UF" valor={rascunho.uf} aoAbrir={() => setEscolhendoUf(true)} />
            </View>
          </View>
          <CampoTexto rotulo="Raio da base (m)" value={rascunho.raio} keyboardType="number-pad" maxLength={4} dica="O raio delimita a área da base para detectar quem chegou — não é a região de entrega." onChangeText={(raio) => mudar({ raio })} />
          <View style={estilos.acoes}>
            <Botao rotulo="Salvar base" carregando={ocupado} textoCarregando="Salvando…" onPress={() => void salvar()} />
            {base && (
              <Botao
                rotulo="Cancelar"
                aparencia="secundario"
                disabled={ocupado}
                onPress={() => {
                  setErro(null);
                  setEditando(false);
                }}
              />
            )}
          </View>
        </Cartao>
      )}

      {/* O ponto da base é confirmado no mapa, como o endereço do cliente. */}
      {confirmandoPonto && base && (
        <ConfirmarPontoDaBase
          base={base}
          sugestao={sugestao}
          enviando={ocupado}
          aoConfirmar={(coordenadas) => {
            setOcupado(true);
            void confirmarPontoBase(empresaId, coordenadas)
              .then((resultado) => {
                if (resultado.ok) {
                  setBase(resultado.dados);
                  setConfirmandoPonto(false);
                  setErro(null);
                } else setErro(mensagemDe(resultado));
              })
              .finally(() => setOcupado(false));
          }}
          aoCancelar={() => {
            setErro(null);
            setConfirmandoPonto(false);
          }}
        />
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {painel && <QuadroDaFila painel={painel} />}
      {erroDoPainel && <Aviso tom="erro">{erroDoPainel}</Aviso>}

      <FolhaDeEscolha titulo="UF" aberta={escolhendoUf} atual={rascunho.uf} itens={UNIDADES_FEDERACAO.map((uf) => ({ id: uf, rotulo: uf }))} aoEscolher={(uf) => mudar({ uf: uf as BaseEmpresa["uf"] })} aoFechar={() => setEscolhendoUf(false)} />
    </View>
  );
}

/**
 * "Onde fica a base?": a empresa confirma no mapa o ponto exato de onde os entregadores saem.
 *
 * Mesmas regras do ponto de entrega do cliente: o mapa NÃO corrige o endereço digitado e a coordenada
 * só passa a valer com a ação explícita de confirmar. Mapbox nativo (o mesmo mapa de ponto do Perfil
 * profissional); onde ele não pode desenhar, o mapa de blocos de sempre.
 */
function ConfirmarPontoDaBase({ base, sugestao, enviando, aoConfirmar, aoCancelar }: { base: BaseEmpresa; sugestao: Coordenadas | null; enviando: boolean; aoConfirmar: (coordenadas: Coordenadas) => void; aoCancelar: () => void }) {
  const mapbox = useMapboxDoMapaDePonto();
  const pontoSalvo = base.latitude !== null && base.longitude !== null ? { latitude: base.latitude, longitude: base.longitude } : null;
  // CENTRO_PADRAO serve só para ABRIR o mapa em algum lugar quando não há ponto: ele nunca é um ponto.
  const [centro, setCentro] = useState<Coordenadas>(pontoSalvo ?? sugestao ?? CENTRO_PADRAO);
  // Confirmável só o que veio de algo real: o ponto já confirmado, o palpite ou o que o gestor marcar.
  const [ponto, setPonto] = useState<Coordenadas | null>(pontoSalvo ?? sugestao);

  // Estável: o mapa de blocos guarda os gestos entre uma pintura e outra.
  const mover = useCallback((novoCentro: Coordenadas) => {
    setCentro(novoCentro);
    setPonto(novoCentro);
  }, []);

  return (
    <Cartao accessibilityLabel="Confirmar ponto da base" style={estilos.cartao}>
      <Texto variante="subtitulo">Confirme o ponto exato da base</Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        {formatarEnderecoResumido(base)} — {base.bairro}, {base.cidade}/{base.uf}
      </Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        {mapbox
          ? "Arraste o marcador (ou toque no mapa) para deixá-lo na porta de saída dos entregadores. O endereço digitado não muda: o ponto é só a referência da base."
          : "Arraste o mapa até o marcador ficar na porta de saída dos entregadores. O endereço digitado não muda: o ponto é só a referência da base."}
      </Texto>

      {mapbox ? <MapaPontoMapbox mapbox={mapbox} centro={centro} ponto={ponto} aoMoverPonto={setPonto} /> : <MapaPonto centro={centro} aoMover={mover} />}

      <Texto variante="pequeno" cor={ponto ? "conteudoSuave" : "aviso"}>
        {ponto ? `Quem estiver a até ${base.raioMetros} m deste ponto é considerado na base.` : "Toque no mapa para marcar a porta de saída dos entregadores e liberar a confirmação."}
      </Texto>

      <View style={estilos.acoes}>
        <Botao rotulo="Confirmar ponto da base" carregando={enviando} textoCarregando="Confirmando…" disabled={enviando || !ponto} onPress={() => ponto && aoConfirmar(ponto)} />
        <Botao rotulo="Voltar" aparencia="secundario" disabled={enviando} onPress={aoCancelar} />
      </View>
    </Cartao>
  );
}

// A FILA da base: quem está presente e apto, na ordem do servidor. Os demais grupos têm a sua opção.
function QuadroDaFila({ painel }: { painel: PainelOperacional }) {
  return (
    <View style={estilos.fila}>
      {!painel.baseConfigurada && <Aviso tom="atencao">Confirme o ponto da base para que a chegada dos entregadores seja detectada automaticamente.</Aviso>}
      <GrupoDaFila titulo="Na base — fila" entregadores={painel.fila} vazio="Ninguém na base agora." />
    </View>
  );
}

function GrupoDaFila({ titulo, entregadores, vazio }: { titulo: string; entregadores: EntregadorOperacional[]; vazio: string }) {
  return (
    <View style={estilos.grupo}>
      <Texto variante="pequenoForte" cor="conteudoSuave">
        {titulo}
      </Texto>
      {entregadores.length === 0 ? (
        <Texto variante="pequeno" cor="conteudoSuave">
          {vazio}
        </Texto>
      ) : (
        <Cartao accessibilityLabel={titulo}>
          {entregadores.map((entregador, indice) => (
            <View key={entregador.id} style={[estilos.itemDaFila, indice > 0 && estilos.comDivisa]}>
              <Texto style={estilos.flex} numberOfLines={1}>
                {entregador.posicaoFila !== null ? `${entregador.posicaoFila}. ` : ""}
                {entregador.pessoa.nomeExibicao}
              </Texto>
              <Texto variante="pequeno" cor={entregador.estado === "disponivel_na_base" || entregador.estado === "em_entrega" ? "marca" : "conteudoSuave"}>
                {ROTULO_ESTADO_OPERACIONAL[entregador.estado]}
              </Texto>
            </View>
          ))}
        </Cartao>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  linhaComDivisa: { alignItems: "center", borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: Espaco.tres, paddingTop: Espaco.tres },
  item: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, paddingHorizontal: Espaco.quatro, paddingVertical: Espaco.tres },
  comDivisa: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth },
  aviso: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  acoes: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  duasColunas: { alignItems: "flex-start", flexDirection: "row", gap: Espaco.tres },
  estreito: { width: 96 },
  fila: { gap: Espaco.tres },
  abas: { gap: Espaco.dois, paddingRight: Espaco.quatro },
  aba: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 1, flexDirection: "row", gap: Espaco.um, justifyContent: "center", minHeight: 36, paddingHorizontal: Espaco.tres },
  abaMarcada: { backgroundColor: Cores.marca, borderColor: Cores.marca },
  grupo: { gap: Espaco.um },
  itemDaFila: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, paddingHorizontal: Espaco.tres, paddingVertical: Espaco.dois },
});
