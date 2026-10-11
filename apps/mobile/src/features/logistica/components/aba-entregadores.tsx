import {
  EVENTO_ENTREGADOR_DISPONIBILIDADE,
  EVENTO_FILA_ATUALIZADA,
  RAIO_BASE_MAXIMO_METROS,
  RAIO_BASE_MINIMO_METROS,
  ROTULO_ESTADO_OPERACIONAL,
  ROTULO_STATUS_ENTREGADOR,
  UNIDADES_FEDERACAO,
  baseTemPontoConfirmado,
  entregadorPodeOperar,
  eventoEntregadorDisponibilidadeSchema,
  eventoFilaAtualizadaSchema,
  formatarCep,
  formatarEnderecoResumido,
  type BaseEmpresa,
  type CandidatoEntregador,
  type Coordenadas,
  type EntregadorDaEmpresa,
  type EntregadorOperacional,
  type PainelOperacional,
} from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { Aviso, Carregando, Cartao, Secao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco } from "@/constants/theme";
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

  const carregarPainel = useCallback(async () => {
    const resultado = await obterPainelOperacional(empresaId);
    if (resultado.ok) {
      setPainel(resultado.dados);
      setErroDoPainel(null);
    } else setErroDoPainel(mensagemDe(resultado));
  }, [empresaId]);

  useEffect(() => {
    let ativo = true;
    void obterPainelOperacional(empresaId).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setPainel(resultado.dados);
      else setErroDoPainel(mensagemDe(resultado));
    });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  // Chegou/saiu alguém, alguém parou de aceitar, a fila andou: a empresa vê na hora, sem recarregar.
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoFilaAtualizadaSchema.safeParse(evento);
      if (resultado.success) setPainel(resultado.data.painel);
    };
    const reler = () => void carregarPainel();
    socket.on(EVENTO_FILA_ATUALIZADA, aoAtualizar);
    socket.on("connect", reler);
    return () => {
      socket.off(EVENTO_FILA_ATUALIZADA, aoAtualizar);
      socket.off("connect", reler);
    };
  }, [carregarPainel]);

  return (
    <>
      <QuadroDeEntregadores empresaId={empresaId} nomeEmpresa={nomeEmpresa} painel={painel} aoMudar={() => void carregarPainel()} />
      <OperacaoDaBase empresaId={empresaId} nomeEmpresa={nomeEmpresa} painel={painel} erroDoPainel={erroDoPainel} />
    </>
  );
}

function QuadroDeEntregadores({ empresaId, nomeEmpresa, painel, aoMudar }: { empresaId: string; nomeEmpresa: string; painel: PainelOperacional | null; aoMudar: () => void }) {
  const [entregadores, setEntregadores] = useState<EntregadorDaEmpresa[] | null>(null);
  const [termo, setTermo] = useState("");
  const [candidatos, setCandidatos] = useState<CandidatoEntregador[]>([]);
  const [buscando, setBuscando] = useState(false);
  const buscaAtual = useRef(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(async () => {
    const resultado = await listarEntregadores(empresaId);
    if (resultado.ok) setEntregadores(resultado.dados.entregadores);
    else setErro(mensagemDe(resultado));
  }, [empresaId]);

  useEffect(() => {
    let ativo = true;
    void listarEntregadores(empresaId).then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setEntregadores(resultado.dados.entregadores);
      else setErro(mensagemDe(resultado));
    });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  // Quem ficou disponível/indisponível chega em tempo real (só para esta empresa).
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoEntregadorDisponibilidadeSchema.safeParse(evento);
      if (!resultado.success) return;
      const atualizado = resultado.data.entregador;
      setEntregadores((atuais) => atuais?.map((item) => (item.id === atualizado.id ? atualizado : item)) ?? null);
      if (atualizado.disponivel) setAviso(`${atualizado.pessoa.nomeExibicao} está disponível para entregas.`);
    };
    socket.on(EVENTO_ENTREGADOR_DISPONIBILIDADE, aoAtualizar);
    return () => {
      socket.off(EVENTO_ENTREGADOR_DISPONIBILIDADE, aoAtualizar);
    };
  }, []);

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
    setAviso(null);
    setOcupado(true);
    try {
      const resultado = await convidarEntregador(empresaId, candidato.pessoa.nomeUsuario);
      if (!resultado.ok) {
        setErro(mensagemDe(resultado));
        return;
      }
      setCandidatos((atuais) => atuais.filter((item) => item.pessoa.identidadeId !== candidato.pessoa.identidadeId));
      setAviso(`Convite enviado para @${resultado.dados.pessoa.nomeUsuario}. Ele vira entregador quando aceitar.`);
      await recarregar();
      aoMudar();
    } finally {
      setOcupado(false);
    }
  }

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
      await recarregar();
      aoMudar();
    } finally {
      setOcupado(false);
    }
  }

  const operacionais = painel ? [...painel.fila, ...painel.foraDaBase, ...painel.indisponiveis] : [];

  return (
    <Secao titulo="Entregadores" descricao={`Quem pode entregar por ${nomeEmpresa}. O convite vira vínculo quando a pessoa aceitar.`}>
      <Cartao style={estilos.cartao}>
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
      </Cartao>

      {entregadores === null && !erro && <Carregando texto="Carregando entregadores…" />}
      {entregadores !== null && entregadores.length === 0 && <Texto cor="conteudoSuave">Nenhum entregador ainda.</Texto>}
      {entregadores !== null && entregadores.length > 0 && (
        <Cartao accessibilityLabel="Entregadores">
          {entregadores.map((entregador, indice) => {
            const operacional = operacionais.find((item) => item.id === entregador.id) ?? null;
            return (
              <View key={entregador.id} style={[estilos.item, indice > 0 && estilos.comDivisa]}>
                <View style={estilos.flex}>
                  <Texto variante="corpoMedio" numberOfLines={1}>
                    {entregador.pessoa.nomeExibicao}
                  </Texto>
                  <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1}>
                    @{entregador.pessoa.nomeUsuario}
                  </Texto>
                  {/* Vínculo (profissional, da empresa) e estado (operacional, do entregador). */}
                  <Texto variante="pequeno" cor="conteudoSuave">
                    Situação: {ROTULO_STATUS_ENTREGADOR[entregador.status]}
                  </Texto>
                  {entregadorPodeOperar(entregador.status) && operacional && (
                    <Texto variante="pequeno" cor={operacional.estado === "disponivel_na_base" ? "marca" : "conteudoSuave"}>
                      Estado: {ROTULO_ESTADO_OPERACIONAL[operacional.estado]}
                    </Texto>
                  )}
                </View>
                {/* Convite pendente não é ativado pela empresa: quem aceita é a pessoa. */}
                {entregador.status !== "convidado" && (
                  <Botao rotulo={entregador.status === "ativo" ? "Desativar" : "Ativar"} aparencia="secundario" compacto disabled={ocupado} onPress={() => void alterar(entregador, entregador.status === "ativo" ? "inativo" : "ativo")} />
                )}
              </View>
            );
          })}
        </Cartao>
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

function OperacaoDaBase({ empresaId, nomeEmpresa, painel, erroDoPainel }: { empresaId: string; nomeEmpresa: string; painel: PainelOperacional | null; erroDoPainel: string | null }) {
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
    <Secao titulo="Operação da base" descricao={`De onde saem as entregas de ${nomeEmpresa} e quem está disponível agora.`}>
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
    </Secao>
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

// Quem está na fila da base, quem está disponível fora dela, quem está com rota e quem não está aceitando.
function QuadroDaFila({ painel }: { painel: PainelOperacional }) {
  /*
   * O terceiro grupo do servidor reúne TODO MUNDO que não está na fila nem "disponível fora da base":
   * quem está com rota (reservada ou na rua) e quem não está aceitando. São situações opostas — por
   * isso aparecem separadas, para um entregador com rota não parecer fora do ar.
   */
  const naoAceitando = painel.indisponiveis.filter((entregador) => entregador.estado === "indisponivel");
  const comRota = painel.indisponiveis.filter((entregador) => entregador.estado !== "indisponivel");
  return (
    <View style={estilos.fila}>
      {!painel.baseConfigurada && <Aviso tom="atencao">Confirme o ponto da base para que a chegada dos entregadores seja detectada automaticamente.</Aviso>}
      <GrupoDaFila titulo="Na base — fila" entregadores={painel.fila} vazio="Ninguém na base agora." />
      <GrupoDaFila titulo="Fora da base" entregadores={painel.foraDaBase} vazio="Ninguém disponível fora da base." />
      <GrupoDaFila titulo="Com rota" entregadores={comRota} vazio="Ninguém com rota agora." rotuloDoEstado={(entregador) => (entregador.estado === "em_entrega" ? "Em entrega" : "Rota atribuída")} />
      <GrupoDaFila titulo="Não aceitando entregas" entregadores={naoAceitando} vazio="Todos estão aceitando entregas." />
    </View>
  );
}

function GrupoDaFila({ titulo, entregadores, vazio, rotuloDoEstado }: { titulo: string; entregadores: EntregadorOperacional[]; vazio: string; rotuloDoEstado?: (entregador: EntregadorOperacional) => string }) {
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
                {rotuloDoEstado ? rotuloDoEstado(entregador) : ROTULO_ESTADO_OPERACIONAL[entregador.estado]}
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
  grupo: { gap: Espaco.um },
  itemDaFila: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, paddingHorizontal: Espaco.tres, paddingVertical: Espaco.dois },
});
