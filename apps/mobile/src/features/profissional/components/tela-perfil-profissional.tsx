import type { CatalogoServicos, PerfilProfissionalDoDono } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Aviso, Carregando, Cartao, Secao, Selo } from "@/components/ui/superficies";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco, Raio } from "@/constants/theme";
import { ativarPerfilProfissional, buscarCatalogoProfissional, buscarPerfilProfissional, pausarPerfil, salvarPreferencias, tornarPerfilAtivo } from "../lib/api-perfil-profissional";
import { ETAPAS, ROTULO_SITUACAO, descricaoArea, estadoEtapa, etapaInicial, etapaVizinha, textoPendencias, type Etapa } from "../lib/apresentacao-perfil-profissional";
import { EtapaAreas } from "./etapa-areas";
import { EtapaAtividades } from "./etapa-atividades";
import { EtapaBase } from "./etapa-base";
import { Divisoria, LinhaInterruptor, type Aplicar, type PropsEtapa } from "./pecas";

/*
 * PERFIL PROFISSIONAL do próprio usuário (Perfil → Perfil profissional) — a mesma área da Web, com a
 * mesma API e as mesmas regras: quatro etapas na ordem das DEPENDÊNCIAS (Base → Atividades → Área →
 * Resumo), com progresso visível. "Salvar" persiste; "Continuar" só muda de etapa. O servidor é a
 * autoridade: a tela sempre passa a mostrar o que ele devolveu.
 */
const TOM_SITUACAO = { ativo: "marca", incompleto: "atencao", inativo: "neutro" } as const;

export function TelaPerfilProfissional({ aoVoltar }: { aoVoltar: () => void }) {
  // undefined = carregando; null = ainda não ativou.
  const [perfil, setPerfil] = useState<PerfilProfissionalDoDono | null | undefined>(undefined);
  const [catalogo, setCatalogo] = useState<CatalogoServicos | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  // Resultado da última ação: fica na tela até a próxima (o app não tem os avisos flutuantes da Web).
  const [retorno, setRetorno] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);
  const [pendente, setPendente] = useState<string | null>(null);
  const [etapaEscolhida, setEtapaEscolhida] = useState<Etapa | null>(null);
  const [atividadesPendentes, setAtividadesPendentes] = useState(false);

  useEffect(() => {
    let ativo = true;
    void Promise.all([buscarPerfilProfissional(), buscarCatalogoProfissional()]).then(([respostaPerfil, respostaCatalogo]) => {
      if (!ativo) return;
      if (respostaPerfil.ok) setPerfil(respostaPerfil.dados.perfil);
      else setErroCarga(respostaPerfil.mensagem);
      if (respostaCatalogo.ok) setCatalogo(respostaCatalogo.dados);
      else setErroCarga(respostaCatalogo.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  // O "Voltar" do Android sai do Perfil profissional para o Perfil, não do aplicativo.
  useEffect(() => {
    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      aoVoltar();
      return true;
    });
    return () => assinatura.remove();
  }, [aoVoltar]);

  const aplicar: Aplicar = useCallback(async (requisicao, opcoes = {}) => {
    setPendente(opcoes.chave ?? "acao");
    const resposta = await requisicao;
    setPendente(null);
    if (!resposta.ok) {
      setRetorno({ tom: "erro", texto: resposta.status === 0 ? "Sem conexão. Tente de novo." : resposta.mensagem });
      return null;
    }
    setRetorno(opcoes.sucesso ? { tom: "sucesso", texto: opcoes.sucesso } : null);
    setPerfil(resposta.dados.perfil);
    return resposta.dados.perfil;
  }, []);

  const cabecalho = (
    <View style={estilos.cabecalho}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao perfil" hitSlop={8} onPress={aoVoltar} style={({ pressed }) => [estilos.voltar, pressed && estilos.apagado]}>
        <Icone nome="voltar" tamanho={22} cor="conteudo" />
      </Pressable>
      <Texto variante="titulo" accessibilityRole="header" style={estilos.flex}>
        Perfil profissional
      </Texto>
      {perfil && <Selo rotulo={ROTULO_SITUACAO[perfil.situacao]} tom={TOM_SITUACAO[perfil.situacao]} />}
    </View>
  );

  const mensagem = retorno && (
    <View accessibilityLiveRegion="polite">
      {retorno.tom === "erro" ? (
        <Aviso tom="erro">{retorno.texto}</Aviso>
      ) : (
        <View style={estilos.sucesso}>
          <Icone nome="check" tamanho={16} cor="marca" />
          <Texto variante="corpoMedio" cor="marca">
            {retorno.texto}
          </Texto>
        </View>
      )}
    </View>
  );

  if (perfil === undefined || !catalogo) {
    return (
      <Tela>
        {cabecalho}
        {erroCarga ? <Aviso tom="erro">{erroCarga}</Aviso> : <Carregando />}
      </Tela>
    );
  }

  if (perfil === null) {
    return (
      <Tela>
        {cabecalho}
        {mensagem}
        <Cartao style={estilos.convite}>
          <Texto variante="titulo">Ofereça seus serviços pelo Jaaa</Texto>
          <Texto cor="conteudoSuave">Até 3 atividades, com seus horários e onde você atende.</Texto>
          <Botao rotulo="Ativar perfil" carregando={pendente !== null} textoCarregando="Ativando…" onPress={() => void aplicar(ativarPerfilProfissional(), { sucesso: "Perfil criado" })} />
        </Cartao>
      </Tela>
    );
  }

  const etapa = etapaEscolhida ?? etapaInicial(perfil);

  function irPara(destino: Etapa) {
    if (destino === etapa) return;
    // Sair de Atividades com alteração não salva perderia o que foi feito: avisa em vez de sair.
    if (etapa === "atividades" && atividadesPendentes) {
      setRetorno({ tom: "erro", texto: "Salve ou descarte as alterações da atividade." });
      return;
    }
    setRetorno(null);
    setEtapaEscolhida(destino);
  }

  const anterior = etapaVizinha(etapa, -1);
  const proxima = etapaVizinha(etapa, 1);
  const rotuloDe = (id: Etapa) => ETAPAS.find((item) => item.id === id)?.rotulo ?? "";
  const props: PropsEtapa = { perfil, aplicar, pendente };

  return (
    <Tela>
      {cabecalho}

      <View accessibilityRole="tablist" accessibilityLabel="Etapas do perfil profissional" style={estilos.etapas}>
        {ETAPAS.map((item, indice) => {
          const estado = estadoEtapa(perfil, item.id, etapa);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: estado === "atual" }}
              accessibilityLabel={`${item.rotulo}, ${estado === "concluida" ? "concluída" : estado === "atual" ? "etapa atual" : "pendente"}`}
              onPress={() => irPara(item.id)}
              style={({ pressed }) => [estilos.etapa, pressed && estilos.apagado]}>
              <View style={[estilos.marcador, estado === "concluida" && estilos.marcadorConcluido, estado === "atual" && estilos.marcadorAtual]}>
                {estado === "concluida" ? (
                  <Icone nome="check" tamanho={16} cor="marcaConteudo" />
                ) : (
                  <Texto variante="pequeno" cor={estado === "atual" ? "marca" : "conteudoSuave"} style={estilos.numero}>
                    {indice + 1}
                  </Texto>
                )}
              </View>
              <Texto variante="pequeno" cor={estado === "atual" ? "conteudo" : "conteudoSuave"} style={estado === "atual" ? estilos.rotuloAtual : undefined} numberOfLines={1}>
                {item.rotulo}
              </Texto>
              <View style={[estilos.trilho, estado === "concluida" && estilos.trilhoConcluido]} />
            </Pressable>
          );
        })}
      </View>

      {mensagem}

      {etapa === "base" && <EtapaBase {...props} />}
      {etapa === "atividades" && <EtapaAtividades {...props} catalogo={catalogo} aoMudarPendencias={setAtividadesPendentes} />}
      {etapa === "areas" && <EtapaAreas {...props} />}
      {etapa === "resumo" && <EtapaResumo {...props} aoIrPara={irPara} />}

      {/* Navegação entre etapas — não salva nada ("Salvar" fica em cada bloco). */}
      <View style={estilos.navegacao}>
        {anterior ? <Botao rotulo="Voltar" aparencia="discreto" onPress={() => irPara(anterior)} /> : <View />}
        {proxima && <Botao rotulo={`Continuar para ${rotuloDe(proxima).toLowerCase()}`} aparencia={estadoEtapa(perfil, etapa, "resumo") === "concluida" ? "principal" : "secundario"} onPress={() => irPara(proxima)} />}
      </View>
    </Tela>
  );
}

function EtapaResumo({ perfil, aplicar, pendente, aoIrPara }: PropsEtapa & { aoIrPara: (etapa: Etapa) => void }) {
  const areasAtivas = perfil.areas.filter((area) => area.ativa);
  const pendencias = textoPendencias(perfil.pendencias);
  const linhas: { rotulo: string; valor: string; ok: boolean; etapa: Etapa }[] = [
    {
      rotulo: "Base",
      valor: perfil.base ? `${perfil.base.cidade}–${perfil.base.uf}${perfil.base.coordenadas ? "" : " · falta confirmar no mapa"}` : "Não cadastrada",
      ok: Boolean(perfil.base?.coordenadas),
      etapa: "base",
    },
    {
      rotulo: "Atividades",
      valor: perfil.atividades.map((atividade) => `${atividade.nome}${atividade.permiteAgendamento ? " (agenda)" : ""}`).join(", ") || "Nenhuma",
      ok: perfil.atividades.length > 0,
      etapa: "atividades",
    },
    { rotulo: "Área de atuação", valor: areasAtivas.map(descricaoArea).join(" · ") || "Nenhuma", ok: areasAtivas.length > 0, etapa: "areas" },
  ];

  return (
    <Secao titulo="Resumo">
      <Cartao style={estilos.cartao}>
        {linhas.map((linha) => (
          <View key={linha.rotulo} style={estilos.linhaResumo}>
            <View style={estilos.flex} accessibilityLabel={`${linha.rotulo}, ${linha.ok ? "pronto" : "pendente"}: ${linha.valor}`}>
              <View style={estilos.rotuloResumo}>
                {linha.ok && <Icone nome="check" tamanho={14} cor="marca" />}
                <Texto variante="pequeno" cor="conteudoSuave">
                  {linha.rotulo}
                </Texto>
              </View>
              <Texto>{linha.valor}</Texto>
            </View>
            <Botao rotulo="Alterar" aparencia="discreto" compacto onPress={() => aoIrPara(linha.etapa)} />
          </View>
        ))}
        <Divisoria />
        <LinhaInterruptor
          rotulo="Oportunidades de outras regiões"
          descricao="Empresas de fora da sua área podem te chamar."
          ligado={perfil.recebeOportunidadesOutrasRegioes}
          desabilitado={pendente !== null}
          aoMudar={(ligado) => void aplicar(salvarPreferencias(ligado), { sucesso: "Preferência salva", chave: "oportunidades" })}
        />
      </Cartao>

      <Cartao style={estilos.cartao}>
        <View style={estilos.situacao}>
          <Texto variante="corpoForte">Situação</Texto>
          <Selo rotulo={ROTULO_SITUACAO[perfil.situacao]} tom={TOM_SITUACAO[perfil.situacao]} />
        </View>
        {pendencias && <Texto cor="aviso">{pendencias}</Texto>}
        {perfil.ativo ? (
          <Botao rotulo="Pausar perfil" aparencia="secundario" carregando={pendente === "situacao"} textoCarregando="Pausando…" disabled={pendente !== null} onPress={() => void aplicar(pausarPerfil(), { sucesso: "Perfil pausado", chave: "situacao" })} />
        ) : (
          <Botao
            rotulo="Ativar perfil"
            carregando={pendente === "situacao"}
            textoCarregando="Ativando…"
            disabled={pendente !== null || perfil.pendencias.length > 0}
            onPress={() => void aplicar(tornarPerfilAtivo(), { sucesso: "Perfil ativo", chave: "situacao" })}
          />
        )}
      </Cartao>
    </Secao>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  apagado: { opacity: 0.6 },
  cabecalho: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  voltar: { alignItems: "center", height: ALTURA_TOQUE, justifyContent: "center", width: ALTURA_TOQUE },
  sucesso: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  convite: { alignItems: "flex-start", gap: Espaco.tres, padding: Espaco.cinco },
  etapas: { flexDirection: "row", gap: Espaco.um },
  etapa: { alignItems: "center", flex: 1, gap: Espaco.um, minHeight: ALTURA_TOQUE, paddingVertical: Espaco.um },
  marcador: { alignItems: "center", borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 1, height: 28, justifyContent: "center", width: 28 },
  marcadorConcluido: { backgroundColor: Cores.marca, borderColor: Cores.marca },
  marcadorAtual: { borderColor: Cores.marca, borderWidth: 2 },
  numero: { fontWeight: "700" },
  rotuloAtual: { fontWeight: "700" },
  trilho: { alignSelf: "stretch", backgroundColor: Cores.borda, borderRadius: Raio.total, height: 2, marginHorizontal: Espaco.dois },
  trilhoConcluido: { backgroundColor: Cores.marca },
  navegacao: { alignItems: "center", borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois, justifyContent: "space-between", paddingTop: Espaco.quatro },
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  linhaResumo: { alignItems: "center", flexDirection: "row", gap: Espaco.tres },
  rotuloResumo: { alignItems: "center", flexDirection: "row", gap: Espaco.um },
  situacao: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
});
