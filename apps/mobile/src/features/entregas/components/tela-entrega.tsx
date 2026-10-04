import { ROTULO_SITUACAO_RASTREAMENTO, ROTULO_STATUS_SAIDA, type SaidaEntrega, type SituacaoRastreamento } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Aviso, Cartao, EstadoVazio, Secao, Selo } from "@/components/ui/superficies";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco } from "@/constants/theme";
import { useContextoConta } from "@/features/conta/components/provedor-contexto-conta";
import { capacidadeDoTipo } from "@/features/conta/lib/contexto-conta";
import { listarMinhasSaidas, saidaEmAndamento } from "../lib/api-entregas";
import { iniciarRastreamento, observarEmPrimeiroPlano, pararRastreamento, rastreamentoEstaAtivo } from "../lib/rastreamento";

/**
 * Área do ENTREGADOR no app: a saída em andamento, as paradas e o estado REAL da localização.
 * Administração da empresa continua sendo no Web.
 *
 * A tela não decide nada de negócio: a saída (e portanto o rastreamento) vem do servidor, e quem a
 * pessoa é vem do contexto central da conta. O login fica no portão do app, não aqui.
 */
export function TelaEntrega() {
  const { contexto, capacidades } = useContextoConta();
  const [saidas, setSaidas] = useState<SaidaEntrega[]>([]);
  const [saida, setSaida] = useState<SaidaEntrega | null>(null);
  const [situacao, setSituacao] = useState<SituacaoRastreamento>("sem_operacao");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const resultado = await listarMinhasSaidas();
    setCarregando(false);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    setSaidas(resultado.dados.saidas);
    const atual = saidaEmAndamento(resultado.dados.saidas);
    setSaida(atual);
    // Acabou a operação: o rastreamento para aqui também, não só quando o servidor recusa.
    if (!atual) {
      await pararRastreamento();
      setSituacao("sem_operacao");
    } else if (await rastreamentoEstaAtivo()) {
      setSituacao("ativo");
    }
  }, []);

  useEffect(() => {
    void carregar();
    // Voltar ao primeiro plano é o momento natural de reconferir a operação e o rastreamento.
    const assinatura = AppState.addEventListener("change", (estado) => {
      if (estado === "active") void carregar();
    });
    return () => assinatura.remove();
  }, [carregar]);

  // Sem permissão de background, o acompanhamento existe enquanto o app estiver aberto.
  useEffect(() => {
    if (!saida || situacao !== "somente_primeiro_plano") return;
    let encerrar: (() => void) | null = null;
    void observarEmPrimeiroPlano(saida.id).then((parar) => {
      encerrar = parar;
    });
    return () => encerrar?.();
  }, [saida, situacao]);

  async function ativar() {
    if (!saida) return;
    setSituacao(await iniciarRastreamento(saida.id));
  }

  const paradasAtivas = saida?.paradas.filter((parada) => parada.encerradaEm === null) ?? [];
  // Rotas que ainda não estão na rua (preparadas, liberadas para retirada...).
  const outrasSaidas = saidas.filter((item) => item.id !== saida?.id);
  const entregador = capacidadeDoTipo(capacidades, "entregador_empresa");
  const convites = entregador?.resumo.convitesPendentes ?? 0;
  const nome = contexto?.identidadePessoal?.nomeExibicao;

  return (
    <Tela
      atualizando={carregando}
      aoAtualizar={() => {
        setCarregando(true);
        void carregar();
      }}>
      <Secao titulo="Minhas entregas" {...(nome ? { descricao: `Você está como ${nome}.` } : {})}>
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {convites > 0 && (
        <Aviso tom="atencao">
          {convites === 1 ? "Você tem 1 convite para entregar." : `Você tem ${convites} convites para entregar.`} Responda pelo Jaa Web, em Entregas.
        </Aviso>
      )}

      {saida && (
        <Cartao style={estilos.cartao}>
          <View style={estilos.linhaTopo}>
            <Selo rotulo={ROTULO_STATUS_SAIDA[saida.status]} tom="marca" />
            <Texto variante="pequeno" cor="conteudoSuave">
              {paradasAtivas.length} {paradasAtivas.length === 1 ? "entrega" : "entregas"}
            </Texto>
          </View>
          <Texto variante="subtitulo">{saida.empresa.nome}</Texto>

          <View style={estilos.paradas}>
            {paradasAtivas.map((parada, indice) => (
              <View key={parada.id} style={estilos.parada}>
                <View style={[estilos.numero, indice === 0 && estilos.numeroProxima]}>
                  <Texto variante="pequenoForte" cor={indice === 0 ? "marcaConteudo" : "marcaSuaveConteudo"}>
                    {indice + 1}
                  </Texto>
                </View>
                <View style={estilos.textoParada}>
                  <Texto variante="corpoForte">{parada.cliente.nomeExibicao}</Texto>
                  <Texto variante="pequeno" cor="conteudoSuave">
                    {parada.destino.logradouro}, {parada.destino.numero} · {parada.destino.bairro}
                  </Texto>
                  {indice === 0 && (
                    <Texto variante="pequenoForte" cor="marca">
                      Próxima entrega
                    </Texto>
                  )}
                </View>
              </View>
            ))}
          </View>

          <View style={estilos.rastreamento}>
            <Icone nome="localizacao" cor={situacao === "ativo" ? "marca" : "conteudoSuave"} />
            <Texto variante="pequeno" cor="conteudoSuave" style={estilos.flex}>
              {ROTULO_SITUACAO_RASTREAMENTO[situacao]}
            </Texto>
          </View>
          {situacao !== "ativo" && <Botao rotulo="Ativar localização desta saída" larguraTotal onPress={() => void ativar()} />}
        </Cartao>
      )}

      {outrasSaidas.map((outra) => {
        const ativas = outra.paradas.filter((parada) => parada.encerradaEm === null).length;
        return (
          <Cartao key={outra.id} style={estilos.cartao}>
            <View style={estilos.linhaTopo}>
              <Selo rotulo={ROTULO_STATUS_SAIDA[outra.status]} tom="atencao" />
              <Texto variante="pequeno" cor="conteudoSuave">
                {ativas} {ativas === 1 ? "entrega" : "entregas"}
              </Texto>
            </View>
            <Texto variante="subtitulo">{outra.empresa.nome}</Texto>
            <Texto variante="pequeno" cor="conteudoSuave">
              Esta rota ainda não está em andamento. Iniciar, recusar e reordenar ficam no Jaa Web por enquanto; quando ela estiver na rua, aparece aqui com a localização.
            </Texto>
          </Cartao>
        );
      })}

      {!carregando && !erro && saidas.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma saída em andamento"
          descricao={
            entregador?.estado === "ativa"
              ? ROTULO_SITUACAO_RASTREAMENTO.sem_operacao
              : "Quando uma empresa convidar você para entregar e houver uma rota sua na rua, ela aparece aqui."
          }
        />
      )}
      </Secao>
    </Tela>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  linhaTopo: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  paradas: { gap: Espaco.tres },
  parada: { flexDirection: "row", gap: Espaco.tres },
  numero: { alignItems: "center", backgroundColor: Cores.marcaSuave, borderRadius: 14, height: 28, justifyContent: "center", width: 28 },
  numeroProxima: { backgroundColor: Cores.marca },
  textoParada: { flex: 1, gap: Espaco.meio },
  rastreamento: { alignItems: "center", backgroundColor: Cores.superficieSuave, borderRadius: 8, flexDirection: "row", gap: Espaco.dois, padding: Espaco.tres },
});
