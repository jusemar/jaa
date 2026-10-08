import { enderecoTemLocalizacaoConfirmada, formatarCep, formatarEnderecoResumido, rotuloEndereco, type Coordenadas, type EnderecoCliente } from "@jaa/contratos";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Cartao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { arquivarEndereco, atualizarEnderecoParaEmpresa, criarEnderecoParaEmpresa, listarEnderecos, obterSugestaoLocalizacaoDoRascunho, validarCoberturaEntrega } from "../lib/api-enderecos";
import { aoUsarEndereco, destinoDoVoltar, pontoSalvo, rotuloDoNovoEndereco, type EtapaDoEndereco } from "../lib/etapa-endereco";
import { dadosDoEndereco, type DadosDoEndereco } from "../lib/formulario-endereco";
import { ConfirmarPontoEntrega } from "./confirmar-ponto-entrega";
import { FormularioEndereco } from "./formulario-endereco";

/*
 * "ENTREGAR EM", dentro de "Seu pedido" — a mesma etapa da Web, com as mesmas rotas e a mesma regra:
 * escolher ou cadastrar o endereço → confirmar o PONTO no mapa (uma vez por endereço) → voltar ao
 * pedido com ele selecionado. Endereço já confirmado é reutilizado direto.
 *
 * Tudo acontece AQUI, sem sair do checkout: o carrinho fica montado por baixo desta etapa e não é
 * tocado. O endereço só passa a existir no servidor ao confirmar o ponto ("Salvar endereço") — é a
 * mesma rota da Web, que grava o texto e a coordenada juntos.
 */
export function EtapaEnderecoEntrega({
  empresaIdentidadeId,
  aoSelecionar,
  aoVoltar,
}: {
  empresaIdentidadeId: string;
  aoSelecionar: (endereco: EnderecoCliente) => void;
  aoVoltar: () => void;
}) {
  const [enderecos, setEnderecos] = useState<EnderecoCliente[] | null>(null);
  const [etapa, setEtapa] = useState<EtapaDoEndereco>({ modo: "lista" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [validando, setValidando] = useState<string | null>(null);
  // Trava contra toque duplo: o estado `enviando` só chega na próxima pintura.
  const ocupado = useRef(false);

  const recarregar = useCallback(async () => {
    const resultado = await listarEnderecos();
    if (resultado.ok) setEnderecos(resultado.dados.enderecos);
    else setErro(resultado.mensagem);
  }, []);

  useEffect(() => {
    let ativo = true;
    void listarEnderecos().then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setEnderecos(resultado.dados.enderecos);
      else setErro(resultado.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  /** Uma operação por vez; o que foi digitado continua na tela se ela falhar. */
  async function exclusivo(operacao: () => Promise<void>) {
    if (ocupado.current) return;
    ocupado.current = true;
    setErro(null);
    setEnviando(true);
    try {
      await operacao();
    } finally {
      ocupado.current = false;
      setEnviando(false);
    }
  }

  // Abrir o mapa busca um palpite de geocodificação (quando houver serviço); ele não confirma nada.
  async function abrirMapa(endereco: EnderecoCliente) {
    setErro(null);
    let sugestao: Coordenadas | null = pontoSalvo(endereco);
    if (!sugestao) {
      const resultado = await obterSugestaoLocalizacaoDoRascunho(empresaIdentidadeId, dadosDoEndereco(endereco));
      sugestao = resultado.ok ? resultado.dados.coordenadas : null;
    }
    setEtapa({ modo: "mapa", dados: dadosDoEndereco(endereco), enderecoOriginal: endereco, sugestao });
  }

  // Selecionar: só segue direto quando o ponto já foi confirmado antes (a primeira vez passa pelo mapa).
  async function usar(endereco: EnderecoCliente) {
    if (validando) return;
    if (aoUsarEndereco(endereco) === "confirmar-no-mapa") {
      await abrirMapa(endereco);
      return;
    }
    setValidando(endereco.id);
    try {
      const cobertura = await validarCoberturaEntrega(empresaIdentidadeId, { latitude: endereco.latitude as number, longitude: endereco.longitude as number });
      if (!cobertura.ok || !cobertura.dados.atendida) {
        setErro(cobertura.ok ? "Esta empresa ainda não realiza entregas neste endereço." : cobertura.mensagem);
        return;
      }
      setErro(null);
      aoSelecionar(endereco);
    } finally {
      setValidando(null);
    }
  }

  // Formulário válido → pede o palpite e abre o mapa. Nada é gravado ainda.
  const salvar = (dados: DadosDoEndereco) =>
    exclusivo(async () => {
      const enderecoOriginal = etapa.modo === "editar" ? etapa.endereco : null;
      const resultado = await obterSugestaoLocalizacaoDoRascunho(empresaIdentidadeId, dados);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setEtapa({ modo: "mapa", dados, enderecoOriginal, sugestao: resultado.dados.coordenadas });
    });

  // Confirmar o ponto GRAVA o endereço (texto + coordenada) e conclui a escolha iniciada no pedido.
  const confirmarPonto = (coordenadas: Coordenadas) =>
    exclusivo(async () => {
      if (etapa.modo !== "mapa") return;
      const resultado = etapa.enderecoOriginal
        ? await atualizarEnderecoParaEmpresa(etapa.enderecoOriginal.id, empresaIdentidadeId, etapa.dados, coordenadas)
        : await criarEnderecoParaEmpresa(empresaIdentidadeId, etapa.dados, coordenadas);
      if (!resultado.ok) {
        // O mapa e o que foi digitado continuam na tela: dá para tentar de novo.
        setErro(resultado.mensagem);
        return;
      }
      await recarregar();
      // O endereço que entra no pedido é o que o SERVIDOR devolveu, já salvo e com o ponto confirmado.
      aoSelecionar(resultado.dados);
    });

  function remover(endereco: EnderecoCliente) {
    Alert.alert("Remover endereço", `Remover o endereço "${rotuloEndereco(endereco)}"? Pedidos antigos continuam com o endereço usado na época.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: () =>
          void exclusivo(async () => {
            const resultado = await arquivarEndereco(endereco.id);
            if (!resultado.ok) {
              setErro(resultado.mensagem);
              return;
            }
            await recarregar();
          }),
      },
    ]);
  }

  const voltar = () => {
    if (enviando) return;
    setErro(null);
    if (destinoDoVoltar(etapa) === "carrinho") aoVoltar();
    else setEtapa({ modo: "lista" });
  };

  if (etapa.modo === "mapa") {
    return (
      <Cartao style={estilos.cartao}>
        <ConfirmarPontoEntrega
          // Um mapa por endereço: abrir outro recomeça centro e ponto.
          key={etapa.enderecoOriginal?.id ?? "novo"}
          empresaIdentidadeId={empresaIdentidadeId}
          endereco={{ ...etapa.dados, apelido: etapa.dados.apelido || null, complemento: etapa.dados.complemento || null }}
          sugestao={etapa.sugestao}
          enviando={enviando}
          erro={erro}
          aoConfirmar={(coordenadas) => void confirmarPonto(coordenadas)}
          aoCancelar={voltar}
        />
      </Cartao>
    );
  }

  const titulo = etapa.modo === "novo" ? "Novo endereço" : etapa.modo === "editar" ? "Editar endereço" : "Escolha um endereço";

  return (
    <Cartao accessibilityLabel="Endereço de entrega" style={estilos.cartao}>
      <View style={estilos.cabecalho}>
        <Texto variante="corpoForte" accessibilityRole="header">
          {titulo}
        </Texto>
        <Pressable accessibilityRole="button" onPress={voltar} hitSlop={12}>
          <Texto variante="pequeno" style={estilos.sublinhado}>
            {etapa.modo === "lista" ? "Voltar ao carrinho" : "Voltar aos endereços"}
          </Texto>
        </Pressable>
      </View>

      {etapa.modo === "lista" && (
        <>
          {enderecos === null && !erro && <Texto cor="conteudoSuave">Carregando endereços…</Texto>}
          {enderecos?.length === 0 && <Texto cor="conteudoSuave">Você ainda não possui endereço de entrega cadastrado. Cadastre um para continuar o pedido.</Texto>}

          {enderecos && enderecos.length > 0 && (
            <View accessibilityLabel="Endereços salvos" style={estilos.lista}>
              {enderecos.map((endereco, indice) => {
                const confirmado = enderecoTemLocalizacaoConfirmada(endereco);
                return (
                  <View key={endereco.id} style={[estilos.item, indice > 0 && estilos.divisor]}>
                    <View style={estilos.texto}>
                      {endereco.apelido && <Texto variante="pequenoForte">{endereco.apelido}</Texto>}
                      <Texto variante="pequeno" cor="conteudoSuave">
                        {formatarEnderecoResumido(endereco)}
                      </Texto>
                      <Texto variante="pequeno" cor="conteudoSuave">
                        {endereco.bairro}, {endereco.cidade}/{endereco.uf} · CEP {formatarCep(endereco.cep)}
                      </Texto>
                      {/* Reutilização: endereço já confirmado não exige passar pelo mapa de novo. */}
                      <View style={estilos.situacao}>
                        {confirmado && <Icone nome="local" tamanho={12} cor="marca" />}
                        <Texto variante="pequeno" cor={confirmado ? "marca" : "aviso"}>
                          {confirmado ? "Localização confirmada" : "Ponto de entrega ainda não confirmado"}
                        </Texto>
                      </View>
                    </View>
                    <View style={estilos.acoesDoItem}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${confirmado ? "Usar este endereço" : "Confirmar no mapa"}: ${rotuloEndereco(endereco)}`}
                        disabled={validando !== null || enviando}
                        onPress={() => void usar(endereco)}
                        style={({ pressed }) => [estilos.usar, (pressed || validando === endereco.id) && estilos.pressionado]}>
                        <Texto variante="pequenoMedio" cor="marcaConteudo">
                          {validando === endereco.id ? "Conferindo…" : confirmado ? "Usar este" : "Confirmar no mapa"}
                        </Texto>
                      </Pressable>
                      {confirmado && <AcaoDoItem rotulo="Ajustar ponto" descricao={`Ajustar ponto no mapa: ${rotuloEndereco(endereco)}`} desabilitada={enviando} aoTocar={() => void abrirMapa(endereco)} />}
                      <AcaoDoItem rotulo="Editar" descricao={`Editar endereço: ${rotuloEndereco(endereco)}`} desabilitada={enviando} aoTocar={() => setEtapa({ modo: "editar", endereco })} />
                      <AcaoDoItem rotulo="Remover" descricao={`Remover endereço: ${rotuloEndereco(endereco)}`} desabilitada={enviando} aoTocar={() => remover(endereco)} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {enderecos !== null && <Botao rotulo={`+ ${rotuloDoNovoEndereco(enderecos.length)}`} aparencia={enderecos.length === 0 ? "principal" : "secundario"} larguraTotal onPress={() => setEtapa({ modo: "novo" })} />}
        </>
      )}

      {(etapa.modo === "novo" || etapa.modo === "editar") && (
        <FormularioEndereco
          // `key`: abrir outro endereço recomeça o formulário; voltar e reabrir o mesmo também.
          key={etapa.modo === "editar" ? etapa.endereco.id : "novo"}
          {...(etapa.modo === "editar" ? { endereco: etapa.endereco } : {})}
          enviando={enviando}
          aoSalvar={(dados) => void salvar(dados)}
          aoCancelar={voltar}
        />
      )}

      {erro && (
        <Texto cor="perigo" accessibilityRole="alert">
          {erro}
        </Texto>
      )}
    </Cartao>
  );
}

function AcaoDoItem({ rotulo, descricao, desabilitada, aoTocar }: { rotulo: string; descricao: string; desabilitada: boolean; aoTocar: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={descricao} disabled={desabilitada} onPress={aoTocar} hitSlop={6} style={({ pressed }) => [estilos.acaoDoItem, pressed && estilos.pressionado]}>
      <Texto variante="pequenoMedio" cor="conteudoSuave">
        {rotulo}
      </Texto>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  cartao: { gap: Espaco.tres, padding: Espaco.tres },
  cabecalho: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, justifyContent: "space-between" },
  sublinhado: { textDecorationLine: "underline" },
  lista: { borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1 },
  item: { gap: Espaco.dois, paddingHorizontal: Espaco.tres, paddingVertical: 10 },
  divisor: { borderTopColor: Cores.borda, borderTopWidth: 1 },
  texto: { gap: 1 },
  situacao: { alignItems: "center", flexDirection: "row", gap: 4 },
  acoesDoItem: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  usar: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.compacto, justifyContent: "center", minHeight: 40, paddingHorizontal: Espaco.tres },
  acaoDoItem: { alignItems: "center", borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: Espaco.tres },
  pressionado: { opacity: 0.7 },
});
