import type { Contato } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AvatarIdentidade } from "@/components/ui/avatar";
import { Botao } from "@/components/ui/botao";
import { Aviso, Carregando, Cartao, EstadoVazio, Secao, SeloEmpresa } from "@/components/ui/superficies";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco } from "@/constants/theme";
import { listarContatos, removerContato } from "../lib/api-contatos";
import { PesquisaJaa } from "./pesquisa-jaa";

/*
 * AGENDA da identidade atuante — a `AreaContatos` da Web. A lista é UNILATERAL: são as pessoas e
 * empresas que EU salvei; salvar alguém não me coloca na agenda dela, e remover não avisa ninguém.
 *
 * A pesquisa fica no topo porque é assim que se usa uma agenda: procura-se antes de rolar.
 */
export function TelaContatos({ aoAbrirConversa }: { aoAbrirConversa: (nomeUsuario: string) => void }) {
  const [contatos, setContatos] = useState<Contato[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  async function recarregar() {
    const resposta = await listarContatos();
    if (resposta.ok) {
      setContatos(resposta.dados.contatos);
      setErro(null);
    } else setErro(resposta.mensagem);
  }

  useEffect(() => {
    let ativo = true;
    void listarContatos().then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) setContatos(resposta.dados.contatos);
      else setErro(resposta.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function remover(contato: Contato) {
    const resposta = await removerContato(contato.identidade.identidadeId);
    if (!resposta.ok) {
      setErro(resposta.mensagem);
      return;
    }
    setContatos((atual) => atual?.filter((outro) => outro.identidade.identidadeId !== contato.identidade.identidadeId) ?? null);
  }

  return (
    <Tela
      atualizando={atualizando}
      aoAtualizar={() => {
        setAtualizando(true);
        void recarregar().finally(() => setAtualizando(false));
      }}>
      <Secao titulo="Pesquisar no Jaaa" descricao="Procure pelo nome ou @usuario. Seus contatos aparecem primeiro.">
        <PesquisaJaa aoAbrirConversa={aoAbrirConversa} aoSalvarContato={() => void recarregar()} />
      </Secao>

      <Secao titulo="Meus contatos" descricao={contatos ? `${contatos.length} salvo${contatos.length === 1 ? "" : "s"}` : undefined}>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {contatos === null && !erro && <Carregando texto="Carregando contatos…" />}
        {contatos?.length === 0 && (
          <EstadoVazio
            titulo="Sua agenda está vazia"
            descricao="Procure alguém pelo nome ou @usuario na busca acima e toque em Salvar. Você pode conversar com qualquer pessoa mesmo sem salvá-la."
          />
        )}
        {contatos && contatos.length > 0 && (
          <Cartao accessibilityLabel="Meus contatos">
            {contatos.map((contato, indice) => (
              <View key={contato.identidade.identidadeId} style={[estilos.linha, indice > 0 && estilos.divisor]}>
                <Pressable accessibilityRole="button" onPress={() => aoAbrirConversa(contato.identidade.nomeUsuario)} style={({ pressed }) => [estilos.contato, pressed && estilos.pressionado]}>
                  <AvatarIdentidade identidade={contato.identidade} />
                  <View style={estilos.texto}>
                    <View style={estilos.nome}>
                      <Texto variante="corpoMedio" numberOfLines={1} style={estilos.encolhe}>
                        {contato.apelido ?? contato.identidade.nomeExibicao}
                      </Texto>
                      {contato.identidade.tipo === "empresarial" && <SeloEmpresa />}
                    </View>
                    <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1}>
                      @{contato.identidade.nomeUsuario}
                    </Texto>
                  </View>
                </Pressable>
                <Botao aparencia="discreto" compacto rotulo="Remover" accessibilityLabel={`Remover ${contato.identidade.nomeExibicao} dos contatos`} onPress={() => void remover(contato)} />
              </View>
            ))}
          </Cartao>
        )}
      </Secao>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  linha: { alignItems: "center", flexDirection: "row", gap: Espaco.dois, paddingHorizontal: Espaco.dois },
  divisor: { borderTopColor: Cores.borda, borderTopWidth: 1 },
  contato: { alignItems: "center", flex: 1, flexDirection: "row", gap: Espaco.tres, minHeight: 64, minWidth: 0, paddingHorizontal: Espaco.um },
  pressionado: { backgroundColor: Cores.superficieSuave },
  texto: { flex: 1, minWidth: 0 },
  nome: { alignItems: "center", flexDirection: "row", gap: 6 },
  encolhe: { flexShrink: 1 },
});
