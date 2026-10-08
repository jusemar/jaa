import { TERMO_BUSCA_TAMANHO_MINIMO, type ResultadoBusca } from "@jaa/contratos";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { AvatarIdentidade } from "@/components/ui/avatar";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { SeloEmpresa } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { pesquisarNoJaa, salvarContato } from "../lib/api-contatos";

/**
 * PESQUISAR NO JAA — a busca única da Web: pessoa OU empresa, nos MEUS CONTATOS primeiro e depois no
 * Jaa. Tocar no resultado abre a conversa — não existe botão "Abrir conversa".
 *
 * O telefone nunca aparece nos resultados; por telefone só é encontrado quem optou por isso.
 * (A procura de profissionais por atividade, que a Web oferece junto, ainda não foi trazida para o app.)
 */
const ESPERA_DIGITACAO_MS = 300;

export function PesquisaJaa({ aoAbrirConversa, aoSalvarContato }: { aoAbrirConversa: (nomeUsuario: string) => void; aoSalvarContato?: () => void }) {
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<{ contatos: ResultadoBusca[]; externos: ResultadoBusca[] } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);

  // Debounce: digitar não vira uma consulta por tecla.
  const termoProcurado = termo.trim();
  const termoValido = termoProcurado.length >= TERMO_BUSCA_TAMANHO_MINIMO;

  useEffect(() => {
    if (!termoValido) {
      const limpeza = setTimeout(() => {
        setResultado(null);
        setBuscando(false);
      }, 0);
      return () => clearTimeout(limpeza);
    }
    const marca = ++requisicaoAtual.current;
    const temporizador = setTimeout(() => {
      setBuscando(true);
      void pesquisarNoJaa(termoProcurado).then((resposta) => {
        // Resposta de uma digitação antiga não sobrescreve a atual.
        if (marca !== requisicaoAtual.current) return;
        setBuscando(false);
        if (resposta.ok) {
          setResultado(resposta.dados);
          setErro(null);
        } else setErro(resposta.mensagem);
      });
    }, ESPERA_DIGITACAO_MS);
    return () => clearTimeout(temporizador);
  }, [termoProcurado, termoValido]);

  async function salvar(item: ResultadoBusca) {
    setSalvando(item.identidade.identidadeId);
    try {
      const resposta = await salvarContato(item.identidade.identidadeId);
      if (!resposta.ok) {
        setErro(resposta.mensagem);
        return;
      }
      setErro(null);
      aoSalvarContato?.();
      // Passa a constar como contato sem precisar refazer a busca.
      setResultado((atual) =>
        atual
          ? {
              contatos: [{ ...item, ehContato: true }, ...atual.contatos.filter((outro) => outro.identidade.identidadeId !== item.identidade.identidadeId)],
              externos: atual.externos.filter((outro) => outro.identidade.identidadeId !== item.identidade.identidadeId),
            }
          : atual,
      );
    } finally {
      setSalvando(null);
    }
  }

  function abrir(nomeUsuario: string) {
    // Escolheu alguém: a busca se fecha e a conversa abre.
    setTermo("");
    aoAbrirConversa(nomeUsuario);
  }

  const semResultados = resultado !== null && resultado.contatos.length === 0 && resultado.externos.length === 0 && !buscando;

  return (
    <View style={estilos.container}>
      {/* Campo com o ícone à esquerda, na mesma superfície clara da navegação — como na Web. */}
      <View style={estilos.campo}>
        <Icone nome="busca" tamanho={16} />
        <TextInput
          value={termo}
          onChangeText={setTermo}
          placeholder="Pesquisar no Jaaa"
          placeholderTextColor={Cores.conteudoSuave}
          accessibilityLabel="Pesquisar no Jaaa"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={estilos.entrada}
        />
        {termo !== "" && (
          <Pressable accessibilityRole="button" accessibilityLabel="Limpar pesquisa" hitSlop={10} onPress={() => setTermo("")}>
            <Icone nome="fechar" tamanho={16} />
          </Pressable>
        )}
      </View>

      {buscando && (
        <Texto variante="pequeno" cor="conteudoSuave" style={estilos.margem}>
          Procurando…
        </Texto>
      )}
      {semResultados && (
        <Texto variante="pequeno" cor="conteudoSuave" style={estilos.margem}>
          Nada encontrado para “{termoProcurado}”.
        </Texto>
      )}

      {resultado && resultado.contatos.length > 0 && <GrupoResultados titulo="Meus contatos" itens={resultado.contatos} aoAbrirConversa={abrir} />}
      {resultado && resultado.externos.length > 0 && (
        <GrupoResultados titulo="No Jaaa" itens={resultado.externos} aoAbrirConversa={abrir} aoSalvar={(item) => void salvar(item)} salvando={salvando} />
      )}

      {erro && (
        <Texto variante="pequeno" cor="perigo" accessibilityRole="alert" style={estilos.margem}>
          {erro}
        </Texto>
      )}
    </View>
  );
}

function GrupoResultados({
  titulo,
  itens,
  aoAbrirConversa,
  aoSalvar,
  salvando,
}: {
  titulo: string;
  itens: ResultadoBusca[];
  aoAbrirConversa: (nomeUsuario: string) => void;
  aoSalvar?: (item: ResultadoBusca) => void;
  salvando?: string | null;
}) {
  return (
    <View style={estilos.grupo}>
      <Texto variante="pequenoMedio" cor="conteudoSuave" style={[estilos.margem, estilos.tituloGrupo]}>
        {titulo}
      </Texto>
      <View accessibilityLabel={titulo} style={estilos.lista}>
        {itens.map((item, indice) => (
          <View key={item.identidade.identidadeId} style={[estilos.linha, indice > 0 && estilos.divisor]}>
            {/* Tocar no resultado abre a conversa: sem botão "Abrir conversa". */}
            <Pressable accessibilityRole="button" onPress={() => aoAbrirConversa(item.identidade.nomeUsuario)} style={({ pressed }) => [estilos.resultado, pressed && estilos.pressionado]}>
              <AvatarIdentidade identidade={item.identidade} />
              <View style={estilos.textoResultado}>
                <View style={estilos.nome}>
                  <Texto variante="corpoMedio" numberOfLines={1} style={estilos.encolhe}>
                    {item.apelido ?? item.identidade.nomeExibicao}
                  </Texto>
                  {item.identidade.tipo === "empresarial" && <SeloEmpresa />}
                </View>
                <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1}>
                  @{item.identidade.nomeUsuario}
                </Texto>
              </View>
            </Pressable>
            {aoSalvar && !item.ehContato && (
              <Botao
                aparencia="secundario"
                compacto
                rotulo="Salvar"
                accessibilityLabel={`Salvar ${item.identidade.nomeExibicao} nos contatos`}
                disabled={salvando === item.identidade.identidadeId}
                onPress={() => aoSalvar(item)}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { gap: Espaco.dois },
  campo: {
    alignItems: "center",
    backgroundColor: Cores.superficie,
    borderColor: Cores.borda,
    borderRadius: Raio.compacto,
    borderWidth: 1,
    flexDirection: "row",
    gap: Espaco.dois,
    minHeight: 44,
    paddingHorizontal: Espaco.tres,
  },
  entrada: { color: Cores.conteudo, flex: 1, fontSize: 14, minWidth: 0, paddingVertical: 0 },
  margem: { paddingHorizontal: Espaco.um },
  grupo: { gap: Espaco.um },
  tituloGrupo: { fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  lista: { backgroundColor: Cores.superficie, borderColor: Cores.borda, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  linha: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, paddingHorizontal: Espaco.dois },
  divisor: { borderTopColor: Cores.borda, borderTopWidth: 1 },
  resultado: { alignItems: "center", flex: 1, flexDirection: "row", gap: Espaco.tres, minHeight: 56, minWidth: 0, paddingHorizontal: Espaco.um },
  pressionado: { backgroundColor: Cores.superficieSuave },
  textoResultado: { flex: 1, minWidth: 0 },
  nome: { alignItems: "center", flexDirection: "row", gap: 6 },
  encolhe: { flexShrink: 1 },
});
