import { ROTULO_PERIODO_PEDIDOS, rotuloTotalDeEntregas, type EntregaConcluida, type HistoricoEntregas, type PeriodoHistoricoEntregas } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Aviso, Carregando, Cartao, EstadoVazio, Selo } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco } from "@/constants/theme";
import { CampoDeData } from "@/features/pedidos/components/tela-pedidos-empresa";
import { dataDeHojeNoCampo, dataDoCampo, dataParaCampo, problemaDoPeriodo } from "@/features/pedidos/lib/paginacao-pedidos";
import { CampoDeEscolha, FolhaDeEscolha, mensagemDe } from "@/features/produtos/components/pecas";
import { listarHistoricoDeEntregas } from "../lib/api-entregas";
import { OPCOES_DE_PERIODO, PERIODO_INICIAL, TEXTO_HISTORICO_VAZIO, consultaDoHistorico, formatarConclusao, juntarPaginas, periodoValido, type PeriodoDoHistorico } from "../lib/historico-entregas";

/**
 * HISTÓRICO do entregador numa empresa: as entregas que ELE concluiu ali, por período e uma página por
 * vez. Tudo vem do servidor (quem recebe o crédito, os limites do período no fuso da empresa, a ordem);
 * a tela só escolhe o período e pede a página seguinte. O filtro é o mesmo de Pedidos.
 */
export function HistoricoDaEmpresa({ entregadorId }: { entregadorId: string }) {
  const [periodo, setPeriodo] = useState<PeriodoDoHistorico>(PERIODO_INICIAL);
  // Datas do personalizado como estão DIGITADAS (DD/MM/AAAA; incompletas não viram consulta).
  const [datasDigitadas, setDatasDigitadas] = useState<{ inicial: string; final: string } | null>(null);
  const [escolhendoPeriodo, setEscolhendoPeriodo] = useState(false);
  const [entregas, setEntregas] = useState<EntregaConcluida[]>([]);
  const [pagina, setPagina] = useState<Pick<HistoricoEntregas, "proximoCursor" | "total"> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const consulta = consultaDoHistorico(periodo);
  const problemaDasDatas = datasDigitadas ? problemaDoPeriodo({ periodo: "personalizado", dataInicial: dataDoCampo(datasDigitadas.inicial), dataFinal: dataDoCampo(datasDigitadas.final) }) : null;

  // Primeira página do período: outro período (ou outra empresa) é outra lista.
  useEffect(() => {
    let ativo = true;
    void listarHistoricoDeEntregas(entregadorId, consulta).then((resposta) => {
      if (!ativo) return;
      setCarregando(false);
      if (!resposta.ok) {
        setErro(mensagemDe(resposta));
        return;
      }
      setErro(null);
      setEntregas(resposta.dados.entregas);
      setPagina({ proximoCursor: resposta.dados.proximoCursor, total: resposta.dados.total });
    });
    return () => {
      ativo = false;
    };
  }, [entregadorId, consulta, tentativa]);

  async function carregarMais() {
    if (!pagina?.proximoCursor || carregandoMais) return;
    setCarregandoMais(true);
    const consultaDaPagina = consulta;
    const resposta = await listarHistoricoDeEntregas(entregadorId, consultaDoHistorico(periodo, pagina.proximoCursor));
    setCarregandoMais(false);
    if (!resposta.ok) {
      setErro(mensagemDe(resposta));
      return;
    }
    // O período mudou enquanto a página vinha: ela pertence a outra lista.
    if (consultaDaPagina !== consultaDoHistorico(periodo)) return;
    setErro(null);
    setEntregas((atuais) => juntarPaginas(atuais, resposta.dados.entregas));
    setPagina({ proximoCursor: resposta.dados.proximoCursor, total: resposta.dados.total });
  }

  function trocar(novo: PeriodoDoHistorico) {
    // Período incompleto não vira consulta; o mesmo período já está na tela.
    if (!periodoValido(novo) || consultaDoHistorico(novo) === consulta) return;
    setEntregas([]);
    setPagina(null);
    setErro(null);
    setCarregando(true);
    setPeriodo(novo);
  }

  function tentarDeNovo() {
    setErro(null);
    setCarregando(true);
    setTentativa((atual) => atual + 1);
  }

  function escolherPeriodo(novo: PeriodoHistoricoEntregas) {
    if (novo !== "personalizado") {
      setDatasDigitadas(null);
      trocar({ periodo: novo });
      return;
    }
    // Abre com o dia de hoje nas duas datas (já é um período válido) e a pessoa ajusta a partir daí.
    const hoje = dataDeHojeNoCampo();
    const datas = { dataInicial: periodo.dataInicial ?? hoje, dataFinal: periodo.dataFinal ?? hoje };
    setDatasDigitadas({ inicial: dataParaCampo(datas.dataInicial), final: dataParaCampo(datas.dataFinal) });
    trocar({ periodo: "personalizado", ...datas });
  }

  function mudarDatas(digitadas: { inicial: string; final: string }) {
    setDatasDigitadas(digitadas);
    // Só período COMPLETO e em ordem vira consulta; enquanto isso a lista mostra o último válido.
    trocar({ periodo: "personalizado", dataInicial: dataDoCampo(digitadas.inicial), dataFinal: dataDoCampo(digitadas.final) });
  }

  const periodoNaTela = datasDigitadas ? "personalizado" : periodo.periodo;

  return (
    <View style={estilos.coluna}>
      {/* PERÍODO pela conclusão da entrega, no fuso da empresa — quem calcula é o servidor. */}
      <View style={estilos.periodo}>
        <CampoDeEscolha rotulo="Período" valor={ROTULO_PERIODO_PEDIDOS[periodoNaTela]} aoAbrir={() => setEscolhendoPeriodo(true)} />
        {datasDigitadas && (
          <View style={estilos.datas}>
            <CampoDeData rotulo="Data inicial" valor={datasDigitadas.inicial} aoMudar={(inicial) => mudarDatas({ ...datasDigitadas, inicial })} />
            <CampoDeData rotulo="Data final" valor={datasDigitadas.final} aoMudar={(final) => mudarDatas({ ...datasDigitadas, final })} />
          </View>
        )}
        {problemaDasDatas && (
          <Texto variante="pequeno" cor="aviso" accessibilityLiveRegion="polite">
            {problemaDasDatas}
          </Texto>
        )}
      </View>

      {erro && (
        <View style={estilos.periodo}>
          <Aviso tom="erro">{erro}</Aviso>
          {entregas.length === 0 && <Botao rotulo="Tentar de novo" aparencia="secundario" compacto onPress={tentarDeNovo} />}
        </View>
      )}

      {carregando ? (
        <Carregando texto="Carregando histórico…" />
      ) : entregas.length > 0 ? (
        <>
          {pagina && (
            <Texto variante="pequeno" cor="conteudoSuave" accessibilityLiveRegion="polite">
              {rotuloTotalDeEntregas(pagina.total)}
            </Texto>
          )}
          <Cartao style={estilos.lista} accessibilityLabel="Entregas concluídas">
            {entregas.map((entrega, indice) => (
              <View key={entrega.id} style={[estilos.item, indice > 0 && estilos.divisoria]}>
                <View style={estilos.texto}>
                  <Texto variante="corpoForte">Pedido #{entrega.numeroPedido}</Texto>
                  <Texto variante="pequeno" cor="conteudoSuave">
                    {formatarConclusao(entrega.concluidaEm)}
                  </Texto>
                </View>
                <Selo rotulo="Entregue" tom="marca" />
              </View>
            ))}
          </Cartao>
          {pagina?.proximoCursor && <Botao rotulo={carregandoMais ? "Carregando…" : "Carregar mais"} aparencia="secundario" disabled={carregandoMais} onPress={() => void carregarMais()} />}
        </>
      ) : (
        !erro && <EstadoVazio titulo="Nenhuma entrega no período" descricao={TEXTO_HISTORICO_VAZIO[periodo.periodo]} />
      )}

      <FolhaDeEscolha titulo="Período" aberta={escolhendoPeriodo} atual={periodoNaTela} itens={OPCOES_DE_PERIODO} aoEscolher={(opcao) => escolherPeriodo(opcao as PeriodoHistoricoEntregas)} aoFechar={() => setEscolhendoPeriodo(false)} />
    </View>
  );
}

const estilos = StyleSheet.create({
  coluna: { gap: Espaco.tres },
  periodo: { gap: Espaco.dois },
  datas: { flexDirection: "row", gap: Espaco.tres },
  lista: { paddingHorizontal: Espaco.quatro },
  item: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: 56, paddingVertical: Espaco.dois },
  divisoria: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth },
  texto: { flex: 1, gap: 2, minWidth: 0 },
});
