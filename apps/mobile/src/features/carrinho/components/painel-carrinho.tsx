import { ROTULO_PAGAMENTO_ENTREGA, enderecoTemLocalizacaoConfirmada, formatarEnderecoResumido, type EnderecoCliente, type FormaPagamentoEntrega } from "@jaa/contratos";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icone, type NomeIcone } from "@/components/ui/icone";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { ImagemProduto } from "@/features/catalogo/components/catalogo-apresentacao";
import { formatarPrecoCentavos, interpretarPrecoDigitado } from "@/features/produtos/lib/precos";
import { quantidadeTotal, totalCentavos, type Carrinho, type ItemCarrinho } from "../lib/carrinho";
import { rotuloTaxaEntrega, type FreteEntrega } from "../lib/frete-entrega";

/*
 * "SEU PEDIDO" — o painel da Web no formato de celular, onde ele ocupa a TELA (a conversa some e a seta
 * do cabeçalho volta para ela). Duas abas: Itens e Entrega e pagamento; o fecho da conta e a ação
 * principal ficam sempre visíveis embaixo.
 *
 * O carrinho é só interface: preços, taxa e total do pedido são recalculados pelo servidor.
 */
export type ConfirmacaoPedido = { forma: FormaPagamentoEntrega; trocoParaCentavos: number | null };

const ICONE_PAGAMENTO: Record<FormaPagamentoEntrega, NomeIcone> = { dinheiro: "dinheiro", cartao: "cartao" };

export function CabecalhoPedido({ acessorio, aoFechar }: { acessorio?: string; aoFechar: () => void }) {
  const { top } = useSafeAreaInsets();
  return (
    <View style={[estilos.cabecalho, { paddingTop: Math.max(top, Espaco.dois) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar à conversa" onPress={aoFechar} style={({ pressed }) => [estilos.voltar, pressed && estilos.pressionado]}>
        <Icone nome="voltar" />
      </Pressable>
      <Icone nome="cesta" cor="marca" />
      <Texto variante="subtitulo" numberOfLines={1} accessibilityRole="header" style={estilos.flex}>
        Seu pedido
      </Texto>
      {acessorio && (
        <View style={estilos.contador}>
          <Texto variante="pequenoForte" cor="marcaConteudo">
            {acessorio}
          </Texto>
        </View>
      )}
    </View>
  );
}

export function PainelCarrinho({
  carrinho,
  endereco,
  frete,
  enviando,
  erro,
  bloqueio,
  aoAlterarQuantidade,
  aoRemover,
  aoTrocarEndereco,
  aoConfirmar,
  aoFechar,
  aoLimpar,
}: {
  carrinho: Carrinho;
  endereco: EnderecoCliente | null;
  frete: FreteEntrega;
  enviando: boolean;
  erro: string | null;
  /*
   * Empresa fechada agora (texto do servidor): os itens continuam no carrinho para quando ela abrir,
   * mas "Confirmar pedido" fica com cara de indisponível e explica ao toque.
   */
  bloqueio?: { motivo: string; aoExplicar: () => void } | undefined;
  aoAlterarQuantidade: (linhaId: string, quantidade: number) => void;
  aoRemover: (linhaId: string) => void;
  aoTrocarEndereco: () => void;
  aoConfirmar: (confirmacao: ConfirmacaoPedido) => void;
  aoFechar: () => void;
  aoLimpar?: (() => void) | undefined;
}) {
  const { bottom } = useSafeAreaInsets();
  const [aba, setAba] = useState<"itens" | "entrega-pagamento">("itens");
  const [forma, setForma] = useState<FormaPagamentoEntrega>("dinheiro");
  const [precisaTroco, setPrecisaTroco] = useState(false);
  const [trocoDigitado, setTrocoDigitado] = useState("");
  const [erroTroco, setErroTroco] = useState<string | null>(null);
  const subtotal = totalCentavos(carrinho);
  // O total só existe com a taxa informada pelo servidor: sem ela não se soma nem se confirma.
  const total = frete.estado === "atendido" ? subtotal + frete.freteCentavos : null;
  const itens = quantidadeTotal(carrinho);
  const podeConfirmar = !enviando && carrinho.itens.length > 0 && endereco !== null && enderecoTemLocalizacaoConfirmada(endereco) && total !== null;

  function confirmar() {
    if (forma === "cartao" || !precisaTroco) {
      setErroTroco(null);
      aoConfirmar({ forma, trocoParaCentavos: null });
      return;
    }
    if (total === null) return;
    const trocoParaCentavos = interpretarPrecoDigitado(trocoDigitado);
    if (trocoParaCentavos === null || trocoParaCentavos < total) {
      setErroTroco(`Informe um valor de troco igual ou maior que ${formatarPrecoCentavos(total)}.`);
      return;
    }
    setErroTroco(null);
    aoConfirmar({ forma, trocoParaCentavos });
  }

  return (
    <View accessibilityLabel="Seu pedido" style={estilos.painel}>
      <CabecalhoPedido acessorio={String(itens)} aoFechar={aoFechar} />

      <View accessibilityRole="tablist" accessibilityLabel="Seções do pedido" style={estilos.abas}>
        {(
          [
            ["itens", "Itens"],
            ["entrega-pagamento", "Entrega e pagamento"],
          ] as const
        ).map(([id, rotulo]) => {
          const ativa = aba === id;
          return (
            <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: ativa }} onPress={() => setAba(id)} style={[estilos.aba, ativa && estilos.abaAtiva]}>
              <Texto variante="pequenoMedio" cor={ativa ? "marca" : "conteudoSuave"}>
                {rotulo}
              </Texto>
            </Pressable>
          );
        })}
      </View>

      {/* Corpo com rolagem própria: o fecho da conta e a ação principal ficam sempre visíveis embaixo. */}
      <ScrollView style={estilos.flex} keyboardShouldPersistTaps="handled">
        {aba === "itens" && (
          <View accessibilityLabel="Itens do pedido" style={estilos.secao}>
            <View style={estilos.tituloSecao}>
              <Texto variante="corpoForte">Itens</Texto>
              {aoLimpar && (
                <Pressable accessibilityRole="button" onPress={aoLimpar} hitSlop={8}>
                  <Texto variante="pequenoForte" cor="marca" style={estilos.semi}>
                    Limpar
                  </Texto>
                </Pressable>
              )}
            </View>
            {carrinho.itens.map((item, indice) => (
              <ItemDoPedido key={item.linhaId} item={item} primeiro={indice === 0} aoAlterarQuantidade={aoAlterarQuantidade} aoRemover={aoRemover} />
            ))}
          </View>
        )}

        {aba === "entrega-pagamento" && (
          <>
            {/* ENTREGA antes do pagamento: pedido de entrega não existe sem endereço confirmado. */}
            <View accessibilityLabel="Entrega" style={estilos.secao}>
              <View style={estilos.tituloSecao}>
                <Texto variante="corpoForte">Entrega</Texto>
                <Pressable accessibilityRole="button" onPress={aoTrocarEndereco} hitSlop={8}>
                  <Texto variante="pequenoForte" cor="marca" style={estilos.semi}>
                    {endereco ? "Trocar" : "Escolher endereço"}
                  </Texto>
                </Pressable>
              </View>
              {endereco ? (
                <View style={estilos.endereco}>
                  <Icone nome="local" tamanho={16} cor="marca" />
                  <View style={estilos.flex}>
                    <Texto variante="pequenoForte">
                      {endereco.apelido ? `${endereco.apelido} · ` : ""}
                      {formatarEnderecoResumido(endereco)}
                    </Texto>
                    <Texto variante="mini" cor="conteudoSuave">
                      {endereco.bairro} · {endereco.cidade}/{endereco.uf}
                    </Texto>
                    <View style={estilos.confirmado}>
                      <Icone nome="check" tamanho={12} cor="marca" />
                      <Texto variante="mini" cor="marca">
                        Ponto de entrega confirmado
                      </Texto>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={estilos.semEndereco}>
                  <Texto variante="pequeno" cor="aviso">
                    Escolha o endereço de entrega.
                  </Texto>
                </View>
              )}
              {(frete.estado === "fora-da-area" || frete.estado === "erro") && (
                <Texto variante="pequeno" cor="perigo" accessibilityRole="alert">
                  {frete.estado === "erro" ? frete.mensagem : "Esta empresa ainda não realiza entregas neste endereço."}
                </Texto>
              )}
            </View>

            <View accessibilityLabel="Pagamento na entrega" style={estilos.secao}>
              <Texto variante="corpoForte">Pagamento na entrega</Texto>
              <View style={estilos.formas}>
                {(["dinheiro", "cartao"] as const).map((opcao) => {
                  const marcada = forma === opcao;
                  return (
                    <Pressable
                      key={opcao}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: marcada }}
                      onPress={() => {
                        setForma(opcao);
                        setErroTroco(null);
                      }}
                      style={[estilos.forma, marcada && estilos.formaMarcada]}>
                      <Radio marcado={marcada} />
                      <Icone nome={ICONE_PAGAMENTO[opcao]} tamanho={16} />
                      <Texto variante={marcada ? "corpoMedio" : "corpo"}>{ROTULO_PAGAMENTO_ENTREGA[opcao]}</Texto>
                    </Pressable>
                  );
                })}
              </View>

              {/* "Troco para quanto?" existe SOMENTE para dinheiro, e só quando o cliente precisa de troco. */}
              {forma === "dinheiro" && (
                <View style={estilos.troco}>
                  {(
                    [
                      [false, "Não preciso de troco"],
                      [true, "Preciso de troco"],
                    ] as const
                  ).map(([valor, rotulo]) => (
                    <Pressable key={rotulo} accessibilityRole="radio" accessibilityState={{ checked: precisaTroco === valor }} onPress={() => setPrecisaTroco(valor)} style={estilos.opcaoTroco}>
                      <Radio marcado={precisaTroco === valor} />
                      <Texto variante="pequeno">{rotulo}</Texto>
                    </Pressable>
                  ))}
                  {precisaTroco && (
                    <View style={estilos.campoTroco}>
                      <Texto variante="pequenoMedio">Troco para quanto?</Texto>
                      <TextInput
                        value={trocoDigitado}
                        onChangeText={setTrocoDigitado}
                        keyboardType="decimal-pad"
                        placeholder="100,00"
                        placeholderTextColor="#A2AAAB"
                        accessibilityLabel="Troco para quanto?"
                        style={estilos.entradaTroco}
                      />
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Pagamento online: lembrete visual de funcionalidade FUTURA, desabilitado — nada é cobrado pelo Jaa. */}
            <View style={[estilos.secao, estilos.semBorda]}>
              <Texto variante="pequenoMedio" cor="conteudoSuave">
                Pagamento online — em breve
              </Texto>
              {["Pix online", "Cartão online"].map((rotulo) => (
                <View key={rotulo} accessibilityState={{ disabled: true }} style={estilos.online}>
                  <Radio marcado={false} />
                  <Texto variante="pequeno" cor="conteudoSuave">
                    {rotulo} (Em breve)
                  </Texto>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Fecho da conta: fora da rolagem, sempre à vista. */}
      <View style={[estilos.fecho, { paddingBottom: Math.max(bottom, Espaco.quatro) }]}>
        {aba === "itens" ? (
          <>
            <View style={estilos.linhaTotal}>
              <Texto variante="corpoForte">Subtotal</Texto>
              <Texto variante="subtitulo">{formatarPrecoCentavos(subtotal)}</Texto>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setAba("entrega-pagamento")} style={({ pressed }) => [estilos.acao, estilos.acaoComMargem, pressed && estilos.pressionado]}>
              <Texto variante="corpoMedio" cor="marcaConteudo">
                Continuar
              </Texto>
              <Icone nome="seta" tamanho={16} cor="marcaConteudo" />
            </Pressable>
          </>
        ) : (
          <>
            <View style={estilos.linhaTotal}>
              <Texto variante="pequeno" cor="conteudoSuave">
                Subtotal
              </Texto>
              <Texto variante="pequeno" cor="conteudoSuave">
                {formatarPrecoCentavos(subtotal)}
              </Texto>
            </View>
            <View style={estilos.linhaTotal}>
              <Texto variante="pequeno" cor="conteudoSuave">
                Taxa de entrega
              </Texto>
              <Texto variante={frete.estado === "atendido" && frete.freteCentavos === 0 ? "pequenoMedio" : "pequeno"} cor={frete.estado === "atendido" && frete.freteCentavos === 0 ? "marca" : "conteudoSuave"}>
                {rotuloTaxaEntrega(frete)}
              </Texto>
            </View>
            <View style={[estilos.linhaTotal, estilos.total]}>
              <Texto variante="subtitulo">Total</Texto>
              <Texto variante="titulo" cor="marca" style={estilos.valorTotal}>
                {total === null ? "—" : formatarPrecoCentavos(total)}
              </Texto>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(bloqueio) || !podeConfirmar }}
              // Fechada: NÃO usa `disabled`, para o toque poder explicar o motivo.
              disabled={!bloqueio && !podeConfirmar}
              onPress={bloqueio ? bloqueio.aoExplicar : confirmar}
              style={({ pressed }) => [estilos.acao, (Boolean(bloqueio) || !podeConfirmar) && estilos.inativo, pressed && estilos.pressionado]}>
              <Texto variante="corpoMedio" cor="marcaConteudo">
                {enviando ? "Enviando pedido…" : "Confirmar pedido"}
              </Texto>
              {!enviando && <Icone nome="seta" tamanho={16} cor="marcaConteudo" />}
            </Pressable>
          </>
        )}
        {bloqueio && (
          <Texto variante="pequeno" cor="aviso" style={estilos.erro}>
            {bloqueio.motivo} Seus itens continuam aqui.
          </Texto>
        )}
        {!bloqueio && (erroTroco ?? erro) && (
          <Texto variante="pequeno" cor="perigo" accessibilityRole="alert" style={estilos.erro}>
            {erroTroco ?? erro}
          </Texto>
        )}
      </View>
    </View>
  );
}

/** Painel "Seu pedido" ainda sem itens: convida a escolher no cardápio. */
export function AvisoDoPedido({ texto, tom, aoFechar }: { texto: string; tom: "marca" | "perigo"; aoFechar: () => void }) {
  return (
    <View style={estilos.painel}>
      <CabecalhoPedido aoFechar={aoFechar} />
      <Texto cor={tom} accessibilityRole={tom === "perigo" ? "alert" : "text"} style={estilos.aviso}>
        {texto}
      </Texto>
    </View>
  );
}

function Radio({ marcado }: { marcado: boolean }) {
  return <View style={[estilos.radio, marcado && estilos.radioMarcado]}>{marcado && <View style={estilos.radioPonto} />}</View>;
}

function ItemDoPedido({
  item,
  primeiro,
  aoAlterarQuantidade,
  aoRemover,
}: {
  item: ItemCarrinho;
  primeiro: boolean;
  aoAlterarQuantidade: (linhaId: string, quantidade: number) => void;
  aoRemover: (linhaId: string) => void;
}) {
  return (
    <View style={[estilos.item, !primeiro && estilos.itemComDivisor]}>
      <ImagemProduto url={item.imagemUrl} nome={item.nome} lado={48} />
      <View style={estilos.flex}>
        <Texto variante="pequenoForte" numberOfLines={1}>
          {item.nome}
        </Texto>
        <Texto variante="pequenoForte" cor="marca">
          {formatarPrecoCentavos(item.precoUnitarioCentavos * item.quantidade)}
        </Texto>
        {item.escolhas.map((escolha) => (
          <Texto key={escolha.opcaoId} variante="mini" cor="conteudoSuave">
            <Texto variante="mini" cor="marca">
              •{" "}
            </Texto>
            {escolha.opcaoNome}
            {escolha.precoAdicionalCentavos > 0 && ` (+${formatarPrecoCentavos(escolha.precoAdicionalCentavos)})`}
          </Texto>
        ))}
        {/* Observação DESTA linha: é o que a cozinha precisa ler junto do item, não um recado geral. */}
        {item.observacao && (
          <Texto variante="mini" cor="conteudoSuave" style={estilos.italico}>
            “{item.observacao}”
          </Texto>
        )}
      </View>
      {/* Quantidade e excluir na MESMA região, à direita do item. */}
      <View style={estilos.controles}>
        <View style={estilos.quantidade}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir ${item.nome}`} onPress={() => aoAlterarQuantidade(item.linhaId, item.quantidade - 1)} style={estilos.botaoQuantidade}>
            <Icone nome="menos" tamanho={14} />
          </Pressable>
          <Texto variante="pequenoForte" style={estilos.valorQuantidade}>
            {item.quantidade}
          </Texto>
          <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar ${item.nome}`} onPress={() => aoAlterarQuantidade(item.linhaId, item.quantidade + 1)} style={estilos.botaoQuantidade}>
            <Icone nome="mais" tamanho={14} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${item.nome}`} onPress={() => aoRemover(item.linhaId)} style={estilos.remover}>
          <Icone nome="lixeira" tamanho={16} />
        </Pressable>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  painel: { backgroundColor: Cores.superficie, flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  cabecalho: { alignItems: "center", borderBottomColor: Cores.borda, borderBottomWidth: 1, flexDirection: "row", gap: Espaco.dois, minHeight: 72, paddingBottom: Espaco.dois, paddingHorizontal: Espaco.tres },
  voltar: { alignItems: "center", borderRadius: Raio.compacto, height: 44, justifyContent: "center", marginLeft: -4, width: 44 },
  pressionado: { opacity: 0.85 },
  contador: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.total, height: 24, justifyContent: "center", minWidth: 24, paddingHorizontal: 6 },
  abas: { borderBottomColor: Cores.borda, borderBottomWidth: 1, flexDirection: "row", gap: Espaco.um, paddingHorizontal: Espaco.dois, paddingTop: Espaco.dois },
  aba: { alignItems: "center", borderBottomColor: "transparent", borderBottomWidth: 2, flex: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: Espaco.dois },
  abaAtiva: { borderBottomColor: Cores.marca },
  secao: { borderBottomColor: Cores.borda, borderBottomWidth: 1, gap: Espaco.tres, padding: Espaco.quatro },
  semBorda: { borderBottomWidth: 0, gap: Espaco.dois },
  tituloSecao: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, justifyContent: "space-between" },
  semi: { fontWeight: "600" },
  endereco: { backgroundColor: Cores.marcaSuave, borderRadius: Raio.compacto, flexDirection: "row", gap: Espaco.tres, padding: Espaco.tres },
  confirmado: { alignItems: "center", flexDirection: "row", gap: 4, marginTop: 2 },
  semEndereco: { backgroundColor: "#F3EFE5", borderRadius: Raio.compacto, padding: Espaco.tres },
  formas: { gap: 6 },
  forma: { alignItems: "center", borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 44, paddingHorizontal: Espaco.tres },
  formaMarcada: { backgroundColor: Cores.selecionadoFundo, borderColor: Cores.marca },
  radio: { alignItems: "center", borderColor: Cores.borda, borderRadius: 8, borderWidth: 1, height: 16, justifyContent: "center", width: 16 },
  radioMarcado: { borderColor: Cores.marca },
  radioPonto: { backgroundColor: Cores.marca, borderRadius: 4, height: 8, width: 8 },
  troco: { gap: Espaco.um, paddingLeft: Espaco.tres },
  opcaoTroco: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, minHeight: 36 },
  campoTroco: { gap: Espaco.um, marginTop: Espaco.um },
  entradaTroco: { borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, color: Cores.conteudo, fontSize: 16, minHeight: 44, paddingHorizontal: Espaco.tres, paddingVertical: 0 },
  online: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, opacity: 0.7 },
  fecho: { borderTopColor: Cores.borda, borderTopWidth: 1, padding: Espaco.quatro },
  linhaTotal: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  total: { marginVertical: Espaco.quatro },
  valorTotal: { fontSize: 20 },
  acao: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.compacto, flexDirection: "row", gap: Espaco.dois, height: 48, justifyContent: "center", paddingHorizontal: Espaco.quatro },
  acaoComMargem: { marginTop: Espaco.quatro },
  inativo: { opacity: 0.5 },
  erro: { marginTop: Espaco.dois },
  aviso: { paddingHorizontal: Espaco.quatro, paddingVertical: Espaco.tres },
  item: { flexDirection: "row", gap: 10, paddingVertical: 10 },
  itemComDivisor: { borderTopColor: Cores.borda, borderTopWidth: 1 },
  italico: { fontStyle: "italic" },
  controles: { alignItems: "center", flexDirection: "row", gap: 2 },
  quantidade: { alignItems: "center", borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, flexDirection: "row" },
  botaoQuantidade: { alignItems: "center", height: 36, justifyContent: "center", width: 32 },
  valorQuantidade: { textAlign: "center", width: 20 },
  remover: { alignItems: "center", height: 36, justifyContent: "center", width: 36 },
});
