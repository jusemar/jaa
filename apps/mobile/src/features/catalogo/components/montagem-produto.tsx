import {
  grupoDeEscolhaUnica,
  grupoDeVariacaoBase,
  grupoObrigatorio,
  OBSERVACAO_ITEM_TAMANHO_MAXIMO,
  precoUnitarioComEscolhas,
  QUANTIDADE_MAXIMA_POR_ITEM,
  validarEscolhas,
  type GrupoOpcoesPublico,
  type ProdutoPublico,
} from "@jaa/contratos";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Icone } from "@/components/ui/icone";
import { Cartao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";

/*
 * MONTAGEM DO PRODUTO: os grupos de opções que a EMPRESA cadastrou, um passo por bloco — como na Web.
 *
 * A regra é a MESMA do servidor (`validarEscolhas` e `precoUnitarioComEscolhas` de @jaa/contratos):
 * aqui ela serve para habilitar o botão, dizer o que falta e mostrar o preço enquanto a pessoa monta.
 * A autoridade continua sendo a API, que reexecuta tudo com os grupos do banco na confirmação.
 */

// Escolha única obrigatória já começa marcada na primeira opção; fora daí, nada vem pré-selecionado.
function escolhasIniciais(grupos: readonly GrupoOpcoesPublico[]): string[] {
  return grupos.flatMap((grupo) => (grupoObrigatorio(grupo) && grupoDeEscolhaUnica(grupo) ? [grupo.opcoes[0]?.id ?? ""] : [])).filter((id) => id !== "");
}

export function MontagemProduto({
  produto,
  grupos,
  aoAdicionar,
}: {
  produto: ProdutoPublico;
  grupos: GrupoOpcoesPublico[];
  aoAdicionar: (opcaoIds: string[], quantidade: number, observacao: string | null) => void;
}) {
  const [escolhidas, setEscolhidas] = useState<string[]>(() => escolhasIniciais(grupos));
  const [quantidade, setQuantidade] = useState(1);
  // Observação pertence a ESTA unidade do item, não ao pedido: some ao reiniciar a montagem.
  const [observacao, setObservacao] = useState("");
  const validacao = useMemo(() => validarEscolhas(grupos, escolhidas), [grupos, escolhidas]);
  const precoUnitario = precoUnitarioComEscolhas(produto.precoCentavos, grupos, escolhidas);
  const selecionadas = new Set(escolhidas);

  function alternar(grupo: GrupoOpcoesPublico, opcaoId: string) {
    setEscolhidas((atual) => {
      const noGrupo = grupo.opcoes.filter((opcao) => atual.includes(opcao.id)).map((opcao) => opcao.id);
      const foraDoGrupo = atual.filter((id) => !grupo.opcoes.some((opcao) => opcao.id === id));
      // Escolha única: a nova substitui a anterior (é o comportamento de um rádio).
      if (grupoDeEscolhaUnica(grupo)) return [...foraDoGrupo, opcaoId];
      if (noGrupo.includes(opcaoId)) return [...foraDoGrupo, ...noGrupo.filter((id) => id !== opcaoId)];
      // No máximo, marcar mais uma não faz nada: o limite é do grupo, não um erro da pessoa.
      if (noGrupo.length >= grupo.maximoEscolhas) return atual;
      return [...foraDoGrupo, ...noGrupo, opcaoId];
    });
  }

  const escolhasSelecionadas = grupos.flatMap((grupo) => grupo.opcoes.filter((opcao) => selecionadas.has(opcao.id)).map((opcao) => opcao.nome));
  // Título do resumo: "Monte seu prato (Grande)" — a variação base, regra derivada do modelo.
  const grupoVariacao = grupoDeVariacaoBase(grupos);
  const variacao = grupoVariacao?.opcoes.find((opcao) => selecionadas.has(opcao.id))?.nome ?? null;
  const demaisEscolhas = escolhasSelecionadas.filter((nome) => nome !== variacao);

  function adicionar() {
    const limpa = observacao.trim();
    aoAdicionar(escolhidas, quantidade, limpa === "" ? null : limpa);
    // Reinicia para a pessoa montar OUTRO item já em seguida, sem sair da tela.
    setEscolhidas(escolhasIniciais(grupos));
    setQuantidade(1);
    setObservacao("");
  }

  return (
    <View style={estilos.container}>
      {grupos.map((grupo, indice) => (
        <GrupoDeOpcoes
          key={grupo.id}
          grupo={grupo}
          passo={indice + 1}
          // Só a variação base recebe o preço do produto: lá cada alternativa É o item naquela versão.
          {...(grupo.id === grupoVariacao?.id ? { precoBaseCentavos: produto.precoCentavos } : {})}
          selecionadas={selecionadas}
          aoAlternar={(opcaoId) => alternar(grupo, opcaoId)}
        />
      ))}

      {/* Último passo antes do resumo: instrução de preparo DESTA unidade. */}
      <Cartao style={estilos.bloco}>
        <Texto variante="corpoForte">
          {grupos.length + 1}. Observação{" "}
          <Texto cor="conteudoSuave">(opcional)</Texto>
        </Texto>
        <Texto variante="mini" cor="conteudoSuave" style={estilos.instrucao}>
          Vale só para este item; não é um recado do pedido inteiro.
        </Texto>
        <TextInput
          value={observacao}
          onChangeText={setObservacao}
          maxLength={OBSERVACAO_ITEM_TAMANHO_MAXIMO}
          multiline
          placeholder="Sem cebola, carne bem passada…"
          placeholderTextColor="#A2AAAB"
          accessibilityLabel="Observação do item"
          style={estilos.observacao}
        />
      </Cartao>

      {/* Fecho da montagem: o que foi escolhido, o preço já somado e a ação. */}
      <Cartao style={estilos.bloco}>
        <Texto variante="pequenoForte">
          {produto.nome}
          {variacao && ` (${variacao})`}
        </Texto>
        {demaisEscolhas.length > 0 && (
          <Texto variante="mini" cor="conteudoSuave">
            {demaisEscolhas.join(", ")}
          </Texto>
        )}
        {observacao.trim() !== "" && (
          <Texto variante="mini" cor="conteudoSuave" style={estilos.italico}>
            “{observacao.trim()}”
          </Texto>
        )}
        <Texto variante="corpoForte" cor="marca" style={estilos.preco}>
          {formatarPrecoCentavos(precoUnitario)}
        </Texto>

        <View style={estilos.acoes}>
          <Quantidade valor={quantidade} aoMudar={setQuantidade} rotulo={produto.nome} />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !validacao.valido }}
            disabled={!validacao.valido}
            onPress={adicionar}
            style={({ pressed }) => [estilos.adicionar, !validacao.valido && estilos.inativo, pressed && estilos.pressionado]}>
            <Icone nome="cesta" tamanho={16} cor="marcaConteudo" />
            <Texto variante="corpoMedio" cor="marcaConteudo">
              Adicionar ao pedido
            </Texto>
          </Pressable>
        </View>

        {/* O que falta, dito com o nome do grupo: "faltam escolhas" sem dizer onde não ajuda ninguém. */}
        {!validacao.valido && (
          <Texto variante="mini" cor="aviso">
            {mensagemDoQueFalta(validacao)}
          </Texto>
        )}
      </Cartao>
    </View>
  );
}

function mensagemDoQueFalta(validacao: Exclude<ReturnType<typeof validarEscolhas>, { valido: true }>): string {
  const grupo = validacao.grupoNome ? `“${validacao.grupoNome}”` : "de opções";
  if (validacao.motivo === "faltam-escolhas") return `Escolha as opções obrigatórias do grupo ${grupo}.`;
  if (validacao.motivo === "escolhas-demais") return `Você passou do limite de escolhas do grupo ${grupo}.`;
  return "Alguma opção não está mais disponível. Monte o item de novo.";
}

/**
 * Um grupo. O ARRANJO vem do tipo do grupo, não de um nome escrito no código (como na Web):
 *  - ESCOLHA ÚNICA em UMA LINHA horizontal (tamanho, tipo de carne): as alternativas se comparam de
 *    relance; com muitas, a linha rola na horizontal;
 *  - MÚLTIPLA ESCOLHA em DUAS COLUNAS (guarnições), com contador do quanto ainda cabe.
 */
function GrupoDeOpcoes({
  grupo,
  passo,
  precoBaseCentavos,
  selecionadas,
  aoAlternar,
}: {
  grupo: GrupoOpcoesPublico;
  passo: number;
  // Presente SOMENTE na variação base: a opção mostra o preço FINAL daquela versão.
  precoBaseCentavos?: number;
  selecionadas: Set<string>;
  aoAlternar: (opcaoId: string) => void;
}) {
  const unica = grupoDeEscolhaUnica(grupo);
  const marcadas = grupo.opcoes.filter((opcao) => selecionadas.has(opcao.id)).length;
  const noLimite = !unica && marcadas >= grupo.maximoEscolhas;

  const opcoes = grupo.opcoes.map((opcao) => {
    const marcada = selecionadas.has(opcao.id);
    const desabilitada = noLimite && !marcada;
    return (
      <Pressable
        key={opcao.id}
        accessibilityRole={unica ? "radio" : "checkbox"}
        accessibilityState={{ checked: marcada, disabled: desabilitada }}
        disabled={desabilitada}
        onPress={() => aoAlternar(opcao.id)}
        style={[estilos.opcao, unica ? estilos.opcaoUnica : estilos.opcaoMultipla, marcada && estilos.opcaoMarcada, desabilitada && estilos.inativo]}>
        {unica ? (
          <View style={[estilos.radio, marcada && estilos.controleMarcado]}>{marcada && <View style={estilos.radioPonto} />}</View>
        ) : (
          <View style={[estilos.caixa, marcada && estilos.caixaMarcada]}>{marcada && <Icone nome="check" tamanho={12} cor="marcaConteudo" />}</View>
        )}
        {unica ? (
          // Nome sobre o valor: preço FINAL na variação base; só o acréscimo nos demais grupos.
          <View style={estilos.textoOpcao}>
            <Texto variante="pequenoForte">{opcao.nome}</Texto>
            {precoBaseCentavos === undefined ? (
              opcao.precoAdicionalCentavos > 0 && (
                <Texto variante="corpoForte" cor="marca">
                  +{formatarPrecoCentavos(opcao.precoAdicionalCentavos)}
                </Texto>
              )
            ) : (
              <Texto variante="corpoForte" cor="marca">
                {formatarPrecoCentavos(precoBaseCentavos + opcao.precoAdicionalCentavos)}
              </Texto>
            )}
          </View>
        ) : (
          <>
            <Texto variante={marcada ? "corpoMedio" : "corpo"} style={estilos.textoOpcao}>
              {opcao.nome}
            </Texto>
            {opcao.precoAdicionalCentavos > 0 && (
              <Texto variante="pequenoForte" cor="marca">
                +{formatarPrecoCentavos(opcao.precoAdicionalCentavos)}
              </Texto>
            )}
          </>
        )}
      </Pressable>
    );
  });

  return (
    <Cartao accessibilityLabel={grupo.nome} style={estilos.bloco}>
      {/* Passo numerado com a REGRA ao lado, como na Web ("2. Guarnições (até 5)"). */}
      <Texto variante="corpoForte">
        {passo}. {grupo.nome} <Texto cor="conteudoSuave">{regraDoGrupo(grupo)}</Texto>
        {!unica && (
          <Texto cor={noLimite ? "aviso" : "conteudoSuave"}>
            {" "}
            · {marcadas}/{grupo.maximoEscolhas} {marcadas === 1 ? "selecionada" : "selecionadas"}
          </Texto>
        )}
      </Texto>
      {grupo.instrucao && (
        <Texto variante="mini" cor="conteudoSuave" style={estilos.instrucao}>
          {grupo.instrucao}
        </Texto>
      )}
      {unica ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.linhaUnica} style={estilos.opcoes}>
          {opcoes}
        </ScrollView>
      ) : (
        <View style={[estilos.opcoes, estilos.duasColunas]}>{opcoes}</View>
      )}
    </Cartao>
  );
}

/** A regra do grupo em português, derivada só de mínimo e máximo (nunca de um rótulo no código). */
function regraDoGrupo(grupo: GrupoOpcoesPublico): string {
  if (grupoDeEscolhaUnica(grupo)) return grupoObrigatorio(grupo) ? "(escolha 1)" : "(escolha até 1, opcional)";
  if (grupo.minimoEscolhas === 0) return `(até ${grupo.maximoEscolhas}, opcional)`;
  if (grupo.minimoEscolhas === grupo.maximoEscolhas) return `(escolha ${grupo.minimoEscolhas})`;
  return `(de ${grupo.minimoEscolhas} a ${grupo.maximoEscolhas})`;
}

/** Quantidade inteira, entre 1 e o limite do contrato. Os botões evitam teclado no celular. */
export function Quantidade({ valor, aoMudar, rotulo }: { valor: number; aoMudar: (quantidade: number) => void; rotulo: string }) {
  const limitar = (quantidade: number) => Math.min(Math.max(Math.trunc(quantidade), 1), QUANTIDADE_MAXIMA_POR_ITEM);
  return (
    <View style={estilos.quantidade}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir quantidade de ${rotulo}`} onPress={() => aoMudar(limitar(valor - 1))} style={estilos.botaoQuantidade}>
        <Icone nome="menos" tamanho={16} />
      </Pressable>
      <Texto variante="corpoForte" style={estilos.valorQuantidade}>
        {valor}
      </Texto>
      <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar quantidade de ${rotulo}`} onPress={() => aoMudar(limitar(valor + 1))} style={estilos.botaoQuantidade}>
        <Icone nome="mais" tamanho={16} />
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { gap: 10 },
  bloco: { padding: Espaco.tres },
  instrucao: { marginTop: Espaco.um },
  observacao: {
    borderColor: Cores.borda,
    borderRadius: Raio.compacto,
    borderWidth: 1,
    color: Cores.conteudo,
    fontSize: 14,
    marginTop: Espaco.tres,
    minHeight: 60,
    paddingHorizontal: Espaco.tres,
    paddingVertical: Espaco.dois,
    textAlignVertical: "top",
  },
  italico: { fontStyle: "italic" },
  preco: { marginTop: Espaco.um },
  acoes: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, marginTop: Espaco.tres },
  adicionar: { alignItems: "center", backgroundColor: Cores.marca, borderRadius: Raio.compacto, flex: 1, flexDirection: "row", gap: Espaco.dois, height: 40, justifyContent: "center", paddingHorizontal: Espaco.quatro },
  inativo: { opacity: 0.5 },
  pressionado: { opacity: 0.85 },
  opcoes: { marginTop: Espaco.tres },
  linhaUnica: { gap: Espaco.dois },
  duasColunas: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  opcao: { alignItems: "center", borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, flexDirection: "row", gap: 10, paddingHorizontal: Espaco.tres },
  opcaoUnica: { minHeight: 64, minWidth: 144 },
  opcaoMultipla: { flexBasis: "47%", flexGrow: 1, minHeight: 48 },
  opcaoMarcada: { backgroundColor: Cores.selecionadoFundo, borderColor: Cores.marca },
  radio: { alignItems: "center", borderColor: Cores.borda, borderRadius: 8, borderWidth: 1, height: 16, justifyContent: "center", width: 16 },
  controleMarcado: { borderColor: Cores.marca },
  radioPonto: { backgroundColor: Cores.marca, borderRadius: 4, height: 8, width: 8 },
  caixa: { alignItems: "center", borderColor: Cores.borda, borderRadius: 3, borderWidth: 1, height: 16, justifyContent: "center", width: 16 },
  caixaMarcada: { backgroundColor: Cores.marca, borderColor: Cores.marca },
  textoOpcao: { flex: 1, minWidth: 0 },
  quantidade: { alignItems: "center", borderColor: Cores.borda, borderRadius: Raio.compacto, borderWidth: 1, flexDirection: "row", height: 40 },
  botaoQuantidade: { alignItems: "center", height: 36, justifyContent: "center", width: 36 },
  valorQuantidade: { textAlign: "center", width: 28 },
});
