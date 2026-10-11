import { NOME_CATEGORIA_TAMANHO_MAXIMO, type CategoriaProduto } from "@jaa/contratos";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Aviso, Cartao, EstadoVazio, Selo } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco } from "@/constants/theme";
import { atualizarCategoria, criarCategoria, removerCategoria } from "../lib/api-produtos";
import { mensagemDe } from "./pecas";

/**
 * CATEGORIAS da empresa — o mesmo gerenciador da Web. Apagar uma categoria NÃO apaga produto: os
 * produtos dela voltam para "Sem categoria", e a confirmação diz isso com o número de afetados.
 */
export function GerenciadorCategorias({ empresaId, categorias, aoMudar }: { empresaId: string; categorias: CategoriaProduto[]; aoMudar: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nova, setNova] = useState("");
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [emEdicao, setEmEdicao] = useState<{ id: string; nome: string } | null>(null);

  async function executar(acao: () => Promise<{ ok: true } | { ok: false; status: number; mensagem: string }>, aoConcluir?: () => void) {
    setOcupado(true);
    setErro(null);
    try {
      const resultado = await acao();
      if (!resultado.ok) setErro(mensagemDe(resultado));
      else {
        aoConcluir?.();
        aoMudar();
      }
    } finally {
      setOcupado(false);
    }
  }

  function criar() {
    const nome = nova.trim();
    // Nome vazio nunca é um toque mudo: a recusa é dita no próprio campo.
    if (!nome) {
      setErroNome("Escreva o nome da categoria para adicionar.");
      return;
    }
    setErroNome(null);
    void executar(
      () => criarCategoria(empresaId, { nome, posicao: categorias.length }),
      () => setNova(""),
    );
  }

  function pedirParaApagar(categoria: CategoriaProduto) {
    const aviso = categoria.produtos > 0 ? `Os ${categoria.produtos} produtos dela continuam existindo e voltam para "Sem categoria".` : undefined;
    Alert.alert(`Apagar "${categoria.nome}"?`, aviso, [
      { text: "Cancelar", style: "cancel" },
      { text: "Apagar", style: "destructive", onPress: () => void executar(() => removerCategoria(empresaId, categoria.id)) },
    ]);
  }

  return (
    <Cartao style={estilos.cartao}>
      <CampoTexto
        rotulo="Nova categoria"
        value={nova}
        maxLength={NOME_CATEGORIA_TAMANHO_MAXIMO}
        placeholder="Monte seu prato, Bebidas, Sobremesas…"
        erro={erroNome}
        returnKeyType="done"
        onSubmitEditing={criar}
        onChangeText={(texto) => {
          setNova(texto);
          if (erroNome !== null) setErroNome(null);
        }}
      />
      <Botao rotulo="Adicionar categoria" carregando={ocupado && emEdicao === null && nova.trim() !== ""} textoCarregando="Adicionando…" disabled={ocupado} onPress={criar} />

      {categorias.length === 0 ? (
        <EstadoVazio titulo="Nenhuma categoria" descricao="Categorias organizam o catálogo em seções. Um produto sem categoria continua à venda normalmente." />
      ) : (
        <View accessibilityLabel="Categorias">
          {categorias.map((categoria) => (
            <View key={categoria.id} style={estilos.item}>
              {emEdicao?.id === categoria.id ? (
                <>
                  <CampoTexto rotulo="Nome" value={emEdicao.nome} maxLength={NOME_CATEGORIA_TAMANHO_MAXIMO} autoFocus onChangeText={(nome) => setEmEdicao({ id: categoria.id, nome })} />
                  <View style={estilos.acoes}>
                    <Botao
                      rotulo="Salvar"
                      compacto
                      disabled={ocupado || emEdicao.nome.trim() === ""}
                      onPress={() =>
                        void executar(
                          () => atualizarCategoria(empresaId, categoria.id, { nome: emEdicao.nome.trim() }),
                          () => setEmEdicao(null),
                        )
                      }
                    />
                    <Botao rotulo="Cancelar" aparencia="discreto" compacto onPress={() => setEmEdicao(null)} />
                  </View>
                </>
              ) : (
                <>
                  <View style={estilos.linha}>
                    <Texto variante="corpoMedio" numberOfLines={2} style={estilos.flex}>
                      {categoria.nome}
                    </Texto>
                    <Selo rotulo={`${categoria.produtos} produto${categoria.produtos === 1 ? "" : "s"}`} />
                  </View>
                  <View style={estilos.acoes}>
                    <Botao rotulo="Renomear" aparencia="secundario" compacto disabled={ocupado} onPress={() => setEmEdicao({ id: categoria.id, nome: categoria.nome })} />
                    <Botao rotulo="Apagar" aparencia="perigo" compacto disabled={ocupado} onPress={() => pedirParaApagar(categoria)} />
                  </View>
                </>
              )}
            </View>
          ))}
        </View>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  item: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth, gap: Espaco.dois, paddingVertical: Espaco.tres },
  linha: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  acoes: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
});
