import type { AreaAtuacaoDoDono, AreaAtuacaoEntrada, AtividadeDoPerfil, Coordenadas, MunicipioCatalogo, PerfilProfissionalDoDono, PoligonoZona } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { Aviso, Cartao, EstadoVazio, Secao, Selo } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { MapaPonto, type ProjetarNoMapa } from "@/features/enderecos/components/mapa-ponto";
import { CENTRO_PADRAO, arredondarCoordenadas } from "@/features/enderecos/lib/mapa-ponto";
import { adicionarArea, buscarMunicipios, editarArea, removerArea } from "../lib/api-perfil-profissional";
import { RAIO_MAXIMO_KM, RAIO_MINIMO_KM, ajustarRaioKm, alternarId, aplicacaoArea, descricaoArea, desenhoPronto, kmParaMetros, metrosParaKm, podeAtivarMaisAreas } from "../lib/apresentacao-perfil-profissional";
import { centroDoDesenho, segmentosDoDesenho } from "../lib/desenho-area";
import { Divisoria, Escolha, LinhaInterruptor, type Aplicar, type PropsEtapa } from "./pecas";

/**
 * ÁREAS DE ATUAÇÃO — mesmas regras da Web: até 5 ATIVAS (desativadas ficam guardadas e não contam).
 * Tipos: raio a partir da base (depende da base confirmada), município do catálogo do servidor e área
 * desenhada no mapa (o servidor valida o desenho).
 */
export function EtapaAreas({ perfil, aplicar, pendente }: PropsEtapa) {
  const [criando, setCriando] = useState(false);
  const vaga = podeAtivarMaisAreas(perfil.areas);
  const centro = perfil.base?.coordenadas ?? CENTRO_PADRAO;

  return (
    <Secao titulo="Área de atuação" descricao={vaga ? "Até 5 áreas ativas" : "Máximo de 5 áreas ativas"}>
      {vaga && !criando && perfil.areas.length > 0 && <Botao rotulo="Adicionar área" aparencia="secundario" onPress={() => setCriando(true)} />}

      {criando && vaga && (
        <NovaArea
          perfil={perfil}
          centro={centro}
          pendente={pendente}
          aoCriar={async (entrada) => {
            if (await aplicar(adicionarArea(entrada), { sucesso: "Área adicionada", chave: "nova-area" })) setCriando(false);
          }}
          aoCancelar={() => setCriando(false)}
        />
      )}

      {perfil.areas.length === 0 && !criando && <EstadoVazio titulo="Nenhuma área" descricao="Diga onde você atende." acao={<Botao rotulo="Adicionar área" centralizado onPress={() => setCriando(true)} />} />}

      {perfil.areas.map((area) => (
        <LinhaArea key={area.id} area={area} atividades={perfil.atividades} centro={centro} vaga={vaga} pendente={pendente} aplicar={aplicar} />
      ))}
    </Secao>
  );
}

// "Usar esta área para": todas as atividades ou só as marcadas (sempre do próprio perfil).
function SeletorAplicacao({ atividades, selecionadas, aoMudar }: { atividades: readonly AtividadeDoPerfil[]; selecionadas: string[] | null; aoMudar: (selecionadas: string[] | null) => void }) {
  return (
    <View style={estilos.bloco}>
      <Texto variante="corpoForte">Usar esta área para</Texto>
      <View style={estilos.escolhas}>
        <Escolha papel="checkbox" marcada={selecionadas === null} rotulo="Todas as atividades" aoAlternar={() => aoMudar(selecionadas === null ? [] : null)} />
        {selecionadas !== null && atividades.map((atividade) => <Escolha key={atividade.id} papel="checkbox" marcada={selecionadas.includes(atividade.id)} rotulo={atividade.nome} aoAlternar={() => aoMudar(alternarId(selecionadas, atividade.id))} />)}
      </View>
      {selecionadas !== null && selecionadas.length === 0 && (
        <Texto variante="pequeno" cor="aviso">
          Marque ao menos uma atividade.
        </Texto>
      )}
    </View>
  );
}

// Raio em passos de 0,5 km, com − e + (o app não tem o controle deslizante do navegador).
function CampoRaio({ km, aoMudar }: { km: number; aoMudar: (km: number) => void }) {
  const texto = String(km).replace(".", ",");
  return (
    <View style={estilos.bloco}>
      <Texto variante="corpoMedio">Até {texto} km da sua base</Texto>
      <View accessibilityRole="adjustable" accessibilityLabel="Raio de atuação" accessibilityValue={{ text: `${texto} quilômetros` }} style={estilos.raio}>
        <BotaoPasso rotulo="Diminuir o raio" icone="menos" desabilitado={km <= RAIO_MINIMO_KM} aoTocar={() => aoMudar(ajustarRaioKm(km, -1))} />
        <Texto variante="titulo" style={estilos.valorRaio}>
          {texto} km
        </Texto>
        <BotaoPasso rotulo="Aumentar o raio" icone="mais" desabilitado={km >= RAIO_MAXIMO_KM} aoTocar={() => aoMudar(ajustarRaioKm(km, 1))} />
      </View>
    </View>
  );
}

function BotaoPasso({ rotulo, icone, desabilitado, aoTocar }: { rotulo: string; icone: "mais" | "menos"; desabilitado: boolean; aoTocar: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} accessibilityState={{ disabled: desabilitado }} disabled={desabilitado} onPress={aoTocar} style={({ pressed }) => [estilos.passo, (pressed || desabilitado) && estilos.apagado]}>
      <Icone nome={icone} tamanho={22} cor="conteudo" />
    </Pressable>
  );
}

/** Busca de município: digita-se o nome e o SERVIDOR responde do catálogo dele (até 10 por vez). */
function CampoMunicipio({ aoEscolher }: { aoEscolher: (municipio: MunicipioCatalogo | null) => void }) {
  const [texto, setTexto] = useState("");
  const [escolhido, setEscolhido] = useState<MunicipioCatalogo | null>(null);
  const [opcoes, setOpcoes] = useState<MunicipioCatalogo[]>([]);
  const [situacao, setSituacao] = useState<"ocioso" | "buscando" | "vazio" | "erro">("ocioso");

  useEffect(() => {
    const termo = texto.trim();
    if (escolhido || termo.length < 2) return;
    let ativo = true;
    const temporizador = setTimeout(() => {
      setSituacao("buscando");
      void buscarMunicipios(termo).then((resposta) => {
        if (!ativo) return;
        const encontrados = resposta.ok ? resposta.dados : [];
        setOpcoes(encontrados);
        setSituacao(resposta.ok ? (encontrados.length > 0 ? "ocioso" : "vazio") : "erro");
      });
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(temporizador);
    };
  }, [texto, escolhido]);

  const mensagem = situacao === "buscando" ? "Buscando…" : situacao === "vazio" ? "Nenhum município encontrado" : situacao === "erro" ? "Não foi possível buscar. Tente de novo." : undefined;

  return (
    <View style={estilos.bloco}>
      <CampoTexto
        rotulo="Município"
        value={texto}
        placeholder="Digite o nome"
        autoCorrect={false}
        onChangeText={(valor) => {
          setTexto(valor);
          // Voltar a digitar desfaz a escolha: só vale o município tocado na lista.
          if (escolhido) {
            setEscolhido(null);
            aoEscolher(null);
          }
        }}
        {...(mensagem && !escolhido ? { dica: mensagem } : {})}
      />
      {!escolhido && texto.trim().length >= 2 && opcoes.length > 0 && (
        <View accessibilityRole="list" style={estilos.lista}>
          {opcoes.map((municipio) => (
            <Pressable
              key={municipio.codigoIbge}
              accessibilityRole="button"
              accessibilityLabel={`${municipio.nome}, ${municipio.uf}`}
              onPress={() => {
                setEscolhido(municipio);
                setTexto(`${municipio.nome} – ${municipio.uf}`);
                setOpcoes([]);
                aoEscolher(municipio);
              }}
              style={({ pressed }) => [estilos.itemLista, pressed && estilos.apagado]}>
              <Texto>
                {municipio.nome} – {municipio.uf}
              </Texto>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Desenho da área no mapa do app: a pessoa leva o marcador até cada CANTO e toca em "Marcar canto".
 * Os cantos e o contorno aparecem por cima do mapa; quem valida a forma é o servidor.
 */
function EditorDesenho({ centroInicial, verticesIniciais, aoConcluir, aoCancelar }: { centroInicial: Coordenadas; verticesIniciais: PoligonoZona; aoConcluir: (vertices: PoligonoZona) => void; aoCancelar: () => void }) {
  const [centro, setCentro] = useState<Coordenadas>(() => centroDoDesenho(verticesIniciais) ?? centroInicial);
  const [vertices, setVertices] = useState<Coordenadas[]>(() => [...verticesIniciais]);
  const mover = useCallback((novoCentro: Coordenadas) => setCentro(novoCentro), []);

  const sobreposicao = (projetar: ProjetarNoMapa) => {
    const pontos = vertices.map(projetar);
    return (
      <>
        {segmentosDoDesenho(pontos).map((segmento, indice) => (
          <View key={`s${indice}`} style={[estilos.segmento, { left: segmento.centroX - segmento.comprimento / 2, top: segmento.centroY - 1.5, width: segmento.comprimento, transform: [{ rotate: `${segmento.anguloGraus}deg` }] }]} />
        ))}
        {pontos.map((ponto, indice) => (
          <View key={`p${indice}`} style={[estilos.canto, { left: ponto.x - 11, top: ponto.y - 11 }]}>
            <Texto variante="miniForte" cor="marcaConteudo">
              {indice + 1}
            </Texto>
          </View>
        ))}
      </>
    );
  };

  return (
    <View style={estilos.bloco}>
      <Texto cor="conteudoSuave">Arraste o mapa até o marcador ficar num canto da área e toque em “Marcar canto”. Repita em cada canto, dando a volta.</Texto>
      <MapaPonto centro={centro} aoMover={mover} zoomInicial={13} sobreposicao={sobreposicao} />
      <Texto variante="pequeno" cor={desenhoPronto(vertices) ? "conteudoSuave" : "aviso"} accessibilityLiveRegion="polite">
        {vertices.length === 0 ? "Nenhum canto marcado." : `${vertices.length} ${vertices.length === 1 ? "canto marcado" : "cantos marcados"}${desenhoPronto(vertices) ? "." : " — marque pelo menos 3."}`}
      </Texto>
      <View style={estilos.acoes}>
        <Botao rotulo="Marcar canto" aparencia="realce" onPress={() => setVertices((atuais) => [...atuais, arredondarCoordenadas(centro)])} />
        <Botao rotulo="Desfazer" aparencia="secundario" disabled={vertices.length === 0} onPress={() => setVertices((atuais) => atuais.slice(0, -1))} />
        <Botao rotulo="Limpar" aparencia="discreto" disabled={vertices.length === 0} onPress={() => setVertices([])} />
      </View>
      <View style={estilos.acoes}>
        <Botao rotulo="Usar este desenho" disabled={!desenhoPronto(vertices)} onPress={() => aoConcluir(vertices)} />
        <Botao rotulo="Cancelar" aparencia="discreto" onPress={aoCancelar} />
      </View>
    </View>
  );
}

function CampoDesenho({ centro, desenho, aoMudar }: { centro: Coordenadas; desenho: PoligonoZona | null; aoMudar: (desenho: PoligonoZona) => void }) {
  const [desenhando, setDesenhando] = useState(false);
  if (desenhando) {
    return (
      <EditorDesenho
        centroInicial={centro}
        verticesIniciais={desenho ?? []}
        aoConcluir={(vertices) => {
          aoMudar(vertices);
          setDesenhando(false);
        }}
        aoCancelar={() => setDesenhando(false)}
      />
    );
  }
  return (
    <View style={estilos.bloco}>
      <Texto cor="conteudoSuave">{desenho ? `Área desenhada com ${desenho.length} cantos.` : "Marque no mapa os cantos da área onde você atende."}</Texto>
      <Botao rotulo={desenho ? "Editar desenho" : "Desenhar no mapa"} aparencia="secundario" onPress={() => setDesenhando(true)} />
    </View>
  );
}

const TIPOS = [
  { valor: "raio", rotulo: "Raio" },
  { valor: "municipio", rotulo: "Município" },
  { valor: "poligono", rotulo: "Desenhar no mapa" },
] as const;

function NovaArea({ perfil, centro, pendente, aoCriar, aoCancelar }: { perfil: PerfilProfissionalDoDono; centro: Coordenadas; pendente: string | null; aoCriar: (entrada: AreaAtuacaoEntrada) => void; aoCancelar: () => void }) {
  const baseConfirmada = Boolean(perfil.base?.coordenadas);
  const [modalidade, setModalidade] = useState<(typeof TIPOS)[number]["valor"]>(baseConfirmada ? "raio" : "municipio");
  const [km, setKm] = useState(10);
  const [municipio, setMunicipio] = useState<MunicipioCatalogo | null>(null);
  // O desenho fica aqui até "Adicionar": se a API recusar, ele não se perde.
  const [desenho, setDesenho] = useState<PoligonoZona | null>(null);
  const [aplicacao, setAplicacao] = useState<string[] | null>(null);
  const aplicacaoValida = aplicacao === null || aplicacao.length > 0;
  const pronta = aplicacaoValida && (modalidade === "raio" ? baseConfirmada : modalidade === "municipio" ? municipio !== null : desenho !== null);

  return (
    <Cartao style={estilos.cartao}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Tipo de área" style={estilos.escolhas}>
        {TIPOS.map((tipo) => (
          <Escolha key={tipo.valor} papel="radio" marcada={modalidade === tipo.valor} rotulo={tipo.rotulo} aoAlternar={() => setModalidade(tipo.valor)} />
        ))}
      </View>

      {modalidade === "raio" && (baseConfirmada ? <CampoRaio km={km} aoMudar={setKm} /> : <Aviso tom="atencao">Confirme sua base no mapa antes.</Aviso>)}
      {modalidade === "municipio" && <CampoMunicipio aoEscolher={setMunicipio} />}
      {modalidade === "poligono" && <CampoDesenho centro={centro} desenho={desenho} aoMudar={setDesenho} />}

      {perfil.atividades.length > 1 && <SeletorAplicacao atividades={perfil.atividades} selecionadas={aplicacao} aoMudar={setAplicacao} />}

      <View style={estilos.acoes}>
        <Botao
          rotulo="Adicionar"
          carregando={pendente === "nova-area"}
          textoCarregando="Adicionando…"
          disabled={pendente !== null || !pronta}
          onPress={() => {
            const servicoPerfilIds = aplicacao ?? [];
            if (modalidade === "raio") aoCriar({ modalidade, raioMetros: kmParaMetros(km), servicoPerfilIds });
            else if (modalidade === "municipio" && municipio) aoCriar({ modalidade, codigoIbge: municipio.codigoIbge, servicoPerfilIds });
            else if (modalidade === "poligono" && desenho) aoCriar({ modalidade, poligonos: [desenho], servicoPerfilIds });
          }}
        />
        <Botao rotulo="Cancelar" aparencia="discreto" onPress={aoCancelar} />
      </View>
    </Cartao>
  );
}

function LinhaArea({ area, atividades, centro, vaga, pendente, aplicar }: { area: AreaAtuacaoDoDono; atividades: readonly AtividadeDoPerfil[]; centro: Coordenadas; vaga: boolean; pendente: string | null; aplicar: Aplicar }) {
  const ocupado = pendente !== null;
  const [editando, setEditando] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [km, setKm] = useState(metrosParaKm(area.raioMetros ?? 10_000));
  const [aplicacao, setAplicacao] = useState<string[] | null>(area.todasAtividades ? null : area.atividadeIds);
  // Área desenhada: o desenho salvo reabre no editor. Partes extras (se houver) são preservadas.
  const [primeiraParte, ...outrasPartes] = area.poligonos ?? [];
  const [desenho, setDesenho] = useState<PoligonoZona | null>(primeiraParte ?? null);
  const desenhoMudou = area.modalidade === "poligono" && desenho !== null && JSON.stringify(desenho) !== JSON.stringify(primeiraParte);
  const editavel = area.modalidade === "raio" || area.modalidade === "poligono" || atividades.length > 1;

  return (
    <Cartao style={[estilos.cartao, !area.ativa && estilos.desativada]}>
      <View style={estilos.titulo}>
        <View style={estilos.flex}>
          <Texto variante="corpoForte">{descricaoArea(area)}</Texto>
          <Texto variante="pequeno" cor="conteudoSuave">
            {aplicacaoArea(area, atividades)}
          </Texto>
        </View>
        <Selo rotulo={area.ativa ? "Ativa" : "Desativada"} tom={area.ativa ? "marca" : "neutro"} />
      </View>

      <LinhaInterruptor
        rotulo="Usar esta área"
        descricao={!area.ativa && !vaga ? "Máximo de 5 áreas ativas." : undefined}
        ligado={area.ativa}
        desabilitado={ocupado || (!area.ativa && !vaga)}
        aoMudar={(ativa) => void aplicar(editarArea(area.id, { ativa }), { sucesso: ativa ? "Área ativada" : "Área desativada", chave: `ativa-${area.id}` })}
      />

      {editando && (
        <>
          <Divisoria />
          {area.modalidade === "raio" && <CampoRaio km={km} aoMudar={setKm} />}
          {area.modalidade === "poligono" && <CampoDesenho centro={centro} desenho={desenho} aoMudar={setDesenho} />}
          {atividades.length > 1 && <SeletorAplicacao atividades={atividades} selecionadas={aplicacao} aoMudar={setAplicacao} />}
          <View style={estilos.acoes}>
            <Botao
              rotulo="Salvar"
              carregando={pendente === `area-${area.id}`}
              textoCarregando="Salvando…"
              disabled={ocupado || (aplicacao !== null && aplicacao.length === 0)}
              onPress={async () => {
                const entrada = {
                  ...(area.modalidade === "raio" ? { raioMetros: kmParaMetros(km) } : {}),
                  ...(desenhoMudou && desenho ? { poligonos: [desenho, ...outrasPartes] } : {}),
                  servicoPerfilIds: aplicacao ?? [],
                };
                if (await aplicar(editarArea(area.id, entrada), { sucesso: "Área salva", chave: `area-${area.id}` })) setEditando(false);
              }}
            />
            <Botao
              rotulo="Cancelar"
              aparencia="discreto"
              onPress={() => {
                setDesenho(primeiraParte ?? null);
                setEditando(false);
              }}
            />
          </View>
        </>
      )}

      <View style={estilos.acoes}>
        {!editando && editavel && <Botao rotulo="Editar" aparencia="secundario" compacto onPress={() => setEditando(true)} />}
        {confirmandoRemocao ? (
          <>
            <Botao rotulo="Remover área" aparencia="perigo" compacto carregando={pendente === `remover-area-${area.id}`} textoCarregando="Removendo…" disabled={ocupado} onPress={() => void aplicar(removerArea(area.id), { sucesso: "Área removida", chave: `remover-area-${area.id}` })} />
            <Botao rotulo="Cancelar" aparencia="discreto" compacto onPress={() => setConfirmandoRemocao(false)} />
          </>
        ) : (
          <Botao rotulo="Remover" aparencia="discreto" compacto onPress={() => setConfirmandoRemocao(true)} />
        )}
      </View>
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  apagado: { opacity: 0.5 },
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  desativada: { opacity: 0.8 },
  titulo: { alignItems: "flex-start", flexDirection: "row", gap: Espaco.dois },
  bloco: { gap: Espaco.dois },
  escolhas: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  acoes: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  raio: { alignItems: "center", flexDirection: "row", gap: Espaco.tres },
  valorRaio: { minWidth: 96, textAlign: "center" },
  passo: { alignItems: "center", backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, height: ALTURA_TOQUE, justifyContent: "center", width: ALTURA_TOQUE },
  lista: { backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, overflow: "hidden" },
  itemLista: { borderBottomColor: Cores.borda, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: "center", minHeight: ALTURA_TOQUE, paddingHorizontal: Espaco.tres },
  segmento: { backgroundColor: Cores.marca, borderRadius: Raio.total, height: 3, position: "absolute" },
  canto: { alignItems: "center", backgroundColor: Cores.marca, borderColor: Cores.superficie, borderRadius: Raio.total, borderWidth: 2, height: 22, justifyContent: "center", position: "absolute", width: 22 },
});
