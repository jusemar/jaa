"use client";

import { periodoHistoricoEntregasSchema, rotuloTotalDeEntregas, type EntregaConcluida, type HistoricoEntregas, type PeriodoPedidos } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Carregando, Selo } from "@/components/ui/primitivos";
import { FiltroDePeriodo } from "@/features/pedidos/components/lista-pedidos-empresa";
import { dataDeHojeNoCampo, problemaDoPeriodo } from "@/features/pedidos/lib/paginacao-pedidos";
import { listarHistoricoDeEntregas } from "../lib/api-entregas";
import { PERIODO_INICIAL, TEXTO_HISTORICO_VAZIO, consultaDoHistorico, formatarConclusao, juntarPaginas, periodoValido, type PeriodoDoHistorico } from "../lib/historico-entregas";

/**
 * HISTÓRICO do entregador numa empresa: as entregas que ELE concluiu ali, por período e uma página por
 * vez. Tudo vem do servidor (quem recebe o crédito, os limites do período no fuso da empresa, a ordem);
 * a tela só escolhe o período — com o MESMO filtro de Pedidos — e pede a página seguinte.
 */
export function HistoricoDaEmpresa({ entregadorId }: { entregadorId: string }) {
  const [periodo, setPeriodo] = useState<PeriodoDoHistorico>(PERIODO_INICIAL);
  // Datas do personalizado como estão nos campos (podem estar incompletas — aí a consulta não muda).
  const [datasNosCampos, setDatasNosCampos] = useState<{ dataInicial: string; dataFinal: string } | null>(null);
  const [entregas, setEntregas] = useState<EntregaConcluida[]>([]);
  const [pagina, setPagina] = useState<Pick<HistoricoEntregas, "proximoCursor" | "total"> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const consulta = consultaDoHistorico(periodo);
  const problemaDasDatas = datasNosCampos ? problemaDoPeriodo({ periodo: "personalizado", ...datasNosCampos }) : null;

  // Primeira página do período: outro período (ou outra empresa) é outra lista.
  useEffect(() => {
    let ativo = true;
    void listarHistoricoDeEntregas(entregadorId, consulta).then((resposta) => {
      if (!ativo) return;
      setCarregando(false);
      if (!resposta.ok) {
        setErro(resposta.mensagem);
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
      setErro(resposta.mensagem);
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

  function escolherPeriodo(novo: PeriodoPedidos) {
    const escolhido = periodoHistoricoEntregasSchema.safeParse(novo);
    if (!escolhido.success) return;
    if (escolhido.data !== "personalizado") {
      setDatasNosCampos(null);
      trocar({ periodo: escolhido.data });
      return;
    }
    // Abre com o dia de hoje nas duas datas (já é um período válido) e a pessoa ajusta a partir daí.
    const hoje = dataDeHojeNoCampo();
    const datas = { dataInicial: periodo.dataInicial ?? hoje, dataFinal: periodo.dataFinal ?? hoje };
    setDatasNosCampos(datas);
    trocar({ periodo: "personalizado", ...datas });
  }

  function mudarDatas(datas: { dataInicial: string; dataFinal: string }) {
    setDatasNosCampos(datas);
    // Só período COMPLETO e em ordem vira consulta; enquanto isso a lista mostra o último válido.
    trocar({ periodo: "personalizado", ...datas });
  }

  function tentarDeNovo() {
    setErro(null);
    setCarregando(true);
    setTentativa((atual) => atual + 1);
  }

  return (
    <div data-historico-de-entregas className="flex flex-col gap-3">
      <FiltroDePeriodo
        idDoCampo="historico-entregas-periodo"
        opcoes={periodoHistoricoEntregasSchema.options}
        periodo={datasNosCampos ? "personalizado" : periodo.periodo}
        dataInicial={datasNosCampos?.dataInicial ?? ""}
        dataFinal={datasNosCampos?.dataFinal ?? ""}
        problema={problemaDasDatas}
        aoEscolherPeriodo={escolherPeriodo}
        aoMudarDatas={mudarDatas}
      />

      {erro && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-perigo">
            {erro}
          </p>
          {entregas.length === 0 && (
            <button type="button" data-tentar-historico onClick={tentarDeNovo} className="rounded-jaa border px-2 py-1 text-xs">
              Tentar de novo
            </button>
          )}
        </div>
      )}

      {carregando ? (
        <Carregando texto="Carregando histórico…" />
      ) : entregas.length > 0 ? (
        <>
          {pagina && (
            <p data-total-do-historico aria-live="polite" className="text-xs text-conteudo-suave">
              {rotuloTotalDeEntregas(pagina.total)}
            </p>
          )}
          <ol aria-label="Entregas concluídas" className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm">
            {entregas.map((entrega) => (
              <li key={entrega.id} data-entrega-concluida={entrega.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                <span className="font-medium">Pedido #{entrega.numeroPedido}</span>
                <span className="flex items-center gap-3">
                  <time dateTime={entrega.concluidaEm} className="text-xs tabular-nums text-conteudo-suave">
                    {formatarConclusao(entrega.concluidaEm)}
                  </time>
                  <Selo tom="marca">Entregue</Selo>
                </span>
              </li>
            ))}
          </ol>
          {pagina?.proximoCursor && (
            <button
              type="button"
              data-carregar-mais-historico
              disabled={carregandoMais}
              onClick={() => void carregarMais()}
              className="self-center rounded-jaa border border-borda px-3 py-1.5 text-xs font-medium transition-colors hover:bg-superficie-suave disabled:cursor-not-allowed disabled:opacity-40"
            >
              {carregandoMais ? "Carregando…" : "Carregar mais"}
            </button>
          )}
        </>
      ) : (
        !erro && (
          <p data-historico-vazio className="text-sm text-conteudo-suave">
            {TEXTO_HISTORICO_VAZIO[periodo.periodo]}
          </p>
        )
      )}
    </div>
  );
}
