import { UNIDADES_FEDERACAO, formatarCep, type BaseProfissionalDoDono, type Coordenadas, type SalvarBaseProfissionalEntrada, type Uf } from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { Aviso, Carregando, Cartao, Secao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { MapaPonto } from "@/features/enderecos/components/mapa-ponto";
import { consultarCepNaApi } from "@/features/enderecos/lib/api-enderecos";
import { MENSAGEM_CEP, criarConsultorCep, type SituacaoCep } from "@/features/enderecos/lib/consulta-cep";
import { mascararCep, normalizarUf } from "@/features/enderecos/lib/formulario-endereco";
import { CENTRO_PADRAO } from "@/features/enderecos/lib/mapa-ponto";
import { confirmarPontoBase, salvarBase, sugerirPontoBase } from "../lib/api-perfil-profissional";
import { enderecoDoFormularioMudou } from "../lib/apresentacao-perfil-profissional";
import { Divisoria, type PropsEtapa } from "./pecas";

type Campos = Omit<SalvarBaseProfissionalEntrada, "codigoIbge" | "uf"> & { uf: string; codigoIbge: string | null };

const ehUf = (valor: string | null | undefined): valor is Uf => UNIDADES_FEDERACAO.some((uf) => uf === valor);

function camposDa(base: BaseProfissionalDoDono | null): Campos {
  return {
    cep: base ? formatarCep(base.cep) : "",
    logradouro: base?.logradouro ?? "",
    numero: base?.numero ?? "",
    complemento: base?.complemento ?? "",
    bairro: base?.bairro ?? "",
    cidade: base?.cidade ?? "",
    uf: base?.uf ?? "MG",
    pontoReferencia: base?.pontoReferencia ?? "",
    codigoIbge: base?.codigoIbge ?? null,
  };
}

/**
 * BASE PROFISSIONAL — a primeira etapa (o raio, o município e a distância partem dela), com as mesmas
 * regras da Web: Endereço → Local no mapa → Confirmar. Mudar o endereço derruba o ponto (regra do
 * servidor) e o mapa volta com a sugestão do endereço NOVO. Endereço e ponto são privados.
 */
export function EtapaBase({ perfil, aplicar, pendente }: PropsEtapa) {
  const base = perfil.base;
  const [campos, setCampos] = useState<Campos>(() => camposDa(base));
  const [editando, setEditando] = useState(base === null);
  const [noMapa, setNoMapa] = useState(false);
  const [situacaoCep, setSituacaoCep] = useState<SituacaoCep>("ocioso");
  const [erroUf, setErroUf] = useState<string | null>(null);
  const confirmada = Boolean(base?.coordenadas);
  // Formulário diferente do endereço salvo: nada de mapa (o ponto seria do endereço antigo).
  const enderecoAlterado = enderecoDoFormularioMudou(base, campos);
  const alterar = (campo: keyof Campos) => (valor: string) => setCampos((atual) => ({ ...atual, [campo]: valor }));

  // CEP preenche o TEXTO (pelo servidor, o mesmo consultor do endereço de entrega). O ponto, nunca.
  const consultor = useRef<ReturnType<typeof criarConsultorCep> | null>(null);
  const consultarCep = (cep: string) => {
    consultor.current ??= criarConsultorCep({
      requisitar: consultarCepNaApi,
      aoMudarSituacao: setSituacaoCep,
      aoPreencher: (doCep) =>
        setCampos((atual) => ({
          ...atual,
          logradouro: doCep.logradouro ?? atual.logradouro,
          bairro: doCep.bairro ?? atual.bairro,
          cidade: doCep.cidade ?? atual.cidade,
          uf: ehUf(doCep.uf) ? doCep.uf : atual.uf,
          codigoIbge: doCep.codigoIbge ?? null,
        })),
    });
    return consultor.current(cep);
  };

  const obrigatorios = [campos.cep, campos.logradouro, campos.numero, campos.bairro, campos.cidade].every((valor) => valor.trim() !== "");

  async function salvar() {
    if (!ehUf(campos.uf)) {
      setErroUf("Informe a sigla do estado (ex.: MG).");
      return;
    }
    setErroUf(null);
    const atualizado = await aplicar(salvarBase({ ...campos, uf: campos.uf }), { sucesso: "Endereço salvo", chave: "base" });
    if (!atualizado?.base) return;
    setEditando(false);
    // Endereço novo (ou mudado) sem ponto: segue direto para o mapa.
    setNoMapa(!atualizado.base.coordenadas);
  }

  function editarEndereco() {
    setCampos(camposDa(base));
    setNoMapa(false);
    setEditando(true);
  }

  return (
    <Secao titulo="Sua base" descricao="Seu local de referência. Só você vê.">
      <View accessibilityLabel="Passos da base" style={estilos.passos}>
        <Passo numero={1} rotulo="Endereço" feito={base !== null && !editando} />
        <Icone nome="seta" tamanho={14} />
        <Passo numero={2} rotulo="Local no mapa" feito={confirmada && !editando} />
      </View>

      {base && !editando && (
        <Cartao style={estilos.cartao}>
          <View>
            <Texto variante="corpoForte">
              {base.logradouro}, {base.numero}
              {base.complemento ? ` — ${base.complemento}` : ""}
            </Texto>
            <Texto cor="conteudoSuave">
              {base.bairro} · {base.cidade}–{base.uf} · {formatarCep(base.cep)}
            </Texto>
          </View>
          <Botao rotulo="Editar endereço" aparencia="secundario" compacto disabled={pendente !== null} onPress={editarEndereco} />
          <Divisoria />
          {confirmada ? (
            <View style={estilos.confirmado}>
              <Icone nome="check" tamanho={16} cor="marca" />
              <Texto variante="corpoMedio" cor="marca">
                Local confirmado no mapa
              </Texto>
            </View>
          ) : (
            <Texto variante="corpoMedio" cor="aviso">
              Falta confirmar o local no mapa
            </Texto>
          )}
          {!noMapa && <Botao rotulo={confirmada ? "Ver ou ajustar no mapa" : "Confirmar no mapa"} aparencia={confirmada ? "secundario" : "principal"} disabled={pendente !== null || enderecoAlterado} onPress={() => setNoMapa(true)} />}
        </Cartao>
      )}

      {editando && (
        <Cartao style={estilos.cartao}>
          <CampoTexto
            rotulo="CEP"
            value={campos.cep}
            keyboardType="number-pad"
            autoComplete="postal-code"
            maxLength={9}
            onChangeText={(texto) => {
              const cep = mascararCep(texto);
              alterar("cep")(cep);
              void consultarCep(cep);
            }}
            onBlur={() => void consultarCep(campos.cep)}
            {...(MENSAGEM_CEP[situacaoCep] ? { dica: MENSAGEM_CEP[situacaoCep] ?? undefined } : {})}
          />
          <CampoTexto rotulo="Rua" value={campos.logradouro} onChangeText={alterar("logradouro")} />
          <View style={estilos.linha}>
            <View style={estilos.estreito}>
              <CampoTexto rotulo="Número" value={campos.numero} onChangeText={alterar("numero")} />
            </View>
            <View style={estilos.flex}>
              <CampoTexto rotulo="Complemento" value={campos.complemento ?? ""} onChangeText={alterar("complemento")} />
            </View>
          </View>
          <CampoTexto rotulo="Bairro" value={campos.bairro} onChangeText={alterar("bairro")} />
          <View style={estilos.linha}>
            <View style={estilos.flex}>
              <CampoTexto rotulo="Cidade" value={campos.cidade} onChangeText={alterar("cidade")} />
            </View>
            <View style={estilos.estreito}>
              <CampoTexto rotulo="UF" value={campos.uf} autoCapitalize="characters" maxLength={2} onChangeText={(texto) => alterar("uf")(normalizarUf(texto))} erro={erroUf} />
            </View>
          </View>
          {base && enderecoAlterado && confirmada && <Aviso tom="atencao">Ao salvar, confirme o local no mapa de novo.</Aviso>}
          <View style={estilos.acoes}>
            <Botao rotulo="Salvar endereço" carregando={pendente === "base"} textoCarregando="Salvando…" disabled={pendente !== null || !obrigatorios} onPress={() => void salvar()} />
            {base && (
              <Botao
                rotulo="Cancelar"
                aparencia="discreto"
                disabled={pendente !== null}
                onPress={() => {
                  setCampos(camposDa(base));
                  setEditando(false);
                }}
              />
            )}
          </View>
        </Cartao>
      )}

      {noMapa && base && !editando && !enderecoAlterado && (
        <ConfirmarNoMapa
          // Nova versão do endereço salvo = mapa novo, com nova sugestão (nunca o marcador do anterior).
          key={base.atualizadoEm}
          pontoAtual={base.coordenadas}
          confirmando={pendente === "ponto"}
          bloqueado={pendente !== null}
          aoConfirmar={async (ponto) => {
            if (await aplicar(confirmarPontoBase(ponto, base.atualizadoEm), { sucesso: "Local confirmado", chave: "ponto" })) setNoMapa(false);
          }}
          aoCancelar={() => setNoMapa(false)}
        />
      )}
    </Secao>
  );
}

// Passo da sequência Endereço → Local no mapa, com o estado dito em texto (não só pelo ícone).
function Passo({ numero, rotulo, feito }: { numero: number; rotulo: string; feito: boolean }) {
  return (
    <View accessibilityLabel={`${rotulo}, ${feito ? "feito" : "a fazer"}`} style={estilos.passo}>
      <View style={[estilos.marcador, feito && estilos.marcadorFeito]}>
        {feito ? (
          <Icone nome="check" tamanho={14} cor="marcaConteudo" />
        ) : (
          <Texto variante="pequeno" cor="conteudoSuave">
            {numero}
          </Texto>
        )}
      </View>
      <Texto cor={feito ? "conteudo" : "conteudoSuave"}>{rotulo}</Texto>
    </View>
  );
}

/**
 * Mapa para marcar a base — o MESMO mapa do endereço de entrega (marcador fixo no centro, a pessoa
 * arrasta o mapa). Abre no ponto já confirmado ou, sem ele, no palpite do servidor para o endereço:
 * o marcador mostra onde o endereço está. O ponto só vale depois de "Confirmar local".
 */
function ConfirmarNoMapa({ pontoAtual, confirmando, bloqueado, aoConfirmar, aoCancelar }: { pontoAtual: Coordenadas | null; confirmando: boolean; bloqueado: boolean; aoConfirmar: (ponto: Coordenadas) => void; aoCancelar: () => void }) {
  // undefined = ainda buscando o palpite do endereço.
  const [centro, setCentro] = useState<Coordenadas | undefined>(pontoAtual ?? undefined);
  // null = sem ponto: sem palpite, a pessoa precisa levar o mapa até o lugar antes de confirmar.
  const [ponto, setPonto] = useState<Coordenadas | null>(pontoAtual);
  const [semSugestao, setSemSugestao] = useState(false);

  useEffect(() => {
    if (pontoAtual) return;
    let ativo = true;
    void sugerirPontoBase().then((sugestao) => {
      if (!ativo) return;
      const palpite = sugestao.ok ? sugestao.dados.coordenadas : null;
      setSemSugestao(!palpite);
      setCentro(palpite ?? CENTRO_PADRAO);
      setPonto(palpite);
    });
    return () => {
      ativo = false;
    };
  }, [pontoAtual]);

  // Estável: o mapa guarda os gestos entre uma pintura e outra.
  const mover = useCallback((novoCentro: Coordenadas) => {
    setCentro(novoCentro);
    setPonto(novoCentro);
  }, []);

  return (
    <Cartao style={estilos.cartao}>
      <Texto cor="conteudoSuave">
        {semSugestao ? "Não achamos o endereço no mapa. Arraste o mapa até o marcador ficar no local exato." : pontoAtual ? "O marcador está no local confirmado. Arraste o mapa para ajustar." : "O marcador está onde achamos seu endereço. Confira e arraste o mapa para ajustar."}
      </Texto>
      {centro ? <MapaPonto centro={centro} aoMover={mover} /> : <Carregando texto="Procurando o endereço no mapa…" />}
      <View style={estilos.acoes}>
        <Botao rotulo="Confirmar local" carregando={confirmando} textoCarregando="Confirmando…" disabled={bloqueado || !ponto} onPress={() => ponto && aoConfirmar(ponto)} />
        <Botao rotulo="Cancelar" aparencia="discreto" disabled={bloqueado} onPress={aoCancelar} />
      </View>
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  estreito: { width: 96 },
  passos: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.tres },
  passo: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  marcador: { alignItems: "center", backgroundColor: Cores.superficieSuave, borderRadius: Raio.total, height: 24, justifyContent: "center", width: 24 },
  marcadorFeito: { backgroundColor: Cores.marca },
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  confirmado: { alignItems: "center", flexDirection: "row", gap: Espaco.um },
  linha: { flexDirection: "row", gap: Espaco.tres },
  acoes: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
});
