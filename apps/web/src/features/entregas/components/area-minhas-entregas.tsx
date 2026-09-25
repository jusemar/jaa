"use client";

import {
  EVENTO_ENTREGA_ATUALIZADA,
  EVENTO_SAIDA_ATUALIZADA,
  EVENTO_SITUACAO_OPERACIONAL,
  EVENTO_VINCULO_ENTREGADOR,
  eventoSaidaAtualizadaSchema,
  eventoVinculoEntregadorSchema,
  eventoSituacaoOperacionalSchema,
  paradasAtivas,
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_STATUS_PEDIDO,
  entregaEstaAtiva,
  eventoEntregaAtualizadaSchema,
  formatarCep,
  formatarEnderecoResumido,
  entregadorPodeEscolherDisponibilidade,
  rotuloDisponibilidade,
  ROTULO_STATUS_ENTREGADOR,
  type ConviteEntregador,
  type EntregaAtribuida,
  type SaidaEntrega,
  type SituacaoOperacional,
  type VinculoEntregador,
} from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import {
  alterarMinhaDisponibilidade,
  concluirMinhaProximaParada,
  iniciarMinhaSaida,
  listarMeusConvites,
  listarMeusVinculos,
  listarMinhasEntregas,
  listarMinhasSaidas,
  listarMinhasSituacoes,
  recusarMinhaSaida,
  reordenarSequencia,
  responderConvite,
} from "../lib/api-entregas";
import { MapaPercursoMapbox } from "./mapa-percurso-mapbox";
import {
  AvisoLocalizacao,
  DetalhesEstadoOperacional,
  usePresencaNaBase,
} from "./presenca-na-base";
import { SequenciaDaSaida } from "./saida-apresentacao";
import { ResumoPercurso } from "./percurso-saida";

export function entregasForaDasSaidas(
  entregas: EntregaAtribuida[],
  saidas: SaidaEntrega[],
): EntregaAtribuida[] {
  const pedidosEmSaidas = new Set(
    saidas.flatMap((saida) => saida.paradas.map((parada) => parada.pedidoId)),
  );
  return entregas.filter((entrega) => !pedidosEmSaidas.has(entrega.pedidoId));
}

/**
 * "MINHAS ENTREGAS": área do ENTREGADOR, separada da administração da empresa.
 * Mostra só o que está atribuído a ele AGORA e só o necessário para entregar — sem telefone do
 * cliente, sem outros pedidos e sem nada do painel da empresa.
 */
export function AreaMinhasEntregas() {
  const [entregas, setEntregas] = useState<EntregaAtribuida[]>([]);
  const [convites, setConvites] = useState<ConviteEntregador[]>([]);
  const [vinculos, setVinculos] = useState<VinculoEntregador[]>([]);
  const [saidas, setSaidas] = useState<SaidaEntrega[]>([]);
  const [situacoes, setSituacoes] = useState<SituacaoOperacional[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const entregasSemSaida = entregasForaDasSaidas(entregas, saidas);

  const aplicarSituacao = useCallback((situacao: SituacaoOperacional) => {
    setSituacoes((atuais) =>
      atuais.map((item) =>
        item.entregadorId === situacao.entregadorId ? situacao : item,
      ),
    );
  }, []);

  // Enquanto ele estiver aceitando entregas de alguma empresa, o aparelho informa o que mediu.
  const { permissao, permitir } = usePresencaNaBase(situacoes, aplicarSituacao);

  useEffect(() => {
    let ativo = true;
    void Promise.all([
      listarMinhasEntregas(),
      listarMeusConvites(),
      listarMeusVinculos(),
      listarMinhasSaidas(),
      listarMinhasSituacoes(),
    ]).then(
      ([lista, pendentes, meusVinculos, minhasSaidas, minhasSituacoes]) => {
        if (!ativo) return;
        if (lista.ok) setEntregas(lista.dados.entregas);
        else setErro(lista.mensagem);
        if (pendentes.ok) setConvites(pendentes.dados.convites);
        if (meusVinculos.ok) setVinculos(meusVinculos.dados.vinculos);
        if (minhasSaidas.ok) setSaidas(minhasSaidas.dados.saidas);
        if (minhasSituacoes.ok) setSituacoes(minhasSituacoes.dados.situacoes);
      },
    );
    return () => {
      ativo = false;
    };
  }, []);

  const recarregar = useCallback(async () => {
    const [lista, pendentes, meusVinculos, minhasSaidas, minhasSituacoes] =
      await Promise.all([
        listarMinhasEntregas(),
        listarMeusConvites(),
        listarMeusVinculos(),
        listarMinhasSaidas(),
        listarMinhasSituacoes(),
      ]);
    if (lista.ok) setEntregas(lista.dados.entregas);
    if (pendentes.ok) setConvites(pendentes.dados.convites);
    if (meusVinculos.ok) setVinculos(meusVinculos.dados.vinculos);
    if (minhasSaidas.ok) setSaidas(minhasSaidas.dados.saidas);
    if (minhasSituacoes.ok) setSituacoes(minhasSituacoes.dados.situacoes);
  }, []);

  /*
   * A sequência do Jaa é sugestão: quem conhece a região é quem está na rua. Mover uma parada envia a
   * nova ordem inteira com a versão que a tela viu — se alguém mudou antes, a API recusa e recarregamos.
   */
  async function mover(saida: SaidaEntrega, pedidoId: string, direcao: -1 | 1) {
    const ordem = paradasAtivas(saida).map((parada) => parada.pedidoId);
    const de = ordem.indexOf(pedidoId);
    const para = de + direcao;
    if (de < 0 || para < 0 || para >= ordem.length) return;
    [ordem[de], ordem[para]] = [ordem[para] as string, ordem[de] as string];

    setOcupado(true);
    try {
      const resultado = await reordenarSequencia(
        saida.id,
        saida.versaoSequencia,
        ordem,
      );
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        await recarregar();
        return;
      }
      setErro(null);
      setSaidas((atuais) =>
        atuais.map((item) =>
          item.id === resultado.dados.id ? resultado.dados : item,
        ),
      );
    } finally {
      setOcupado(false);
    }
  }

  /*
   * SAIR PARA ENTREGA: depois da liberação, o entregador saiu com os pedidos. A saída passa a "em andamento" (só então o
   * rastreamento vale) e cada pedido pronto vira "saiu para entrega" — tudo decidido pela API.
   * A tela já troca pelo retorno; o evento realtime confirma para a empresa e para as outras abas.
   */
  async function iniciar(saida: SaidaEntrega) {
    if (
      !window.confirm(
        `Sair para entrega por ${saida.empresa.nome}? Os pedidos passam a "saiu para entrega".`,
      )
    )
      return;
    setOcupado(true);
    try {
      const resultado = await iniciarMinhaSaida(saida.id);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        await recarregar();
        return;
      }
      setErro(null);
      setSaidas((atuais) =>
        atuais.map((item) =>
          item.id === resultado.dados.id ? resultado.dados : item,
        ),
      );
      // Os pedidos mudaram de status: a lista de entregas também precisa refletir.
      await recarregar();
    } finally {
      setOcupado(false);
    }
  }

  async function recusar(saida: SaidaEntrega) {
    if (
      !window.confirm(
        "Recusar esta rota?\n\nEla voltará para a fila de entrega e poderá ser direcionada a outro entregador.",
      )
    )
      return;
    setOcupado(true);
    try {
      const resultado = await recusarMinhaSaida(saida.id);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        await recarregar();
        return;
      }
      setErro(null);
      setSucesso("Rota recusada. Ela voltou para a fila de entrega.");
      setSaidas((atuais) => atuais.filter((item) => item.id !== saida.id));
      const pedidosDaSaida = new Set(
        saida.paradas.map((parada) => parada.pedidoId),
      );
      setEntregas((atuais) =>
        atuais.filter((entrega) => !pedidosDaSaida.has(entrega.pedidoId)),
      );
      await recarregar();
    } finally {
      setOcupado(false);
    }
  }

  async function concluirParada(
    saida: SaidaEntrega,
    pedidoId: string,
    numeroPedido: number,
  ) {
    if (!window.confirm(`Confirmar entrega do Pedido #${numeroPedido}?`))
      return;
    setOcupado(true);
    try {
      const resultado = await concluirMinhaProximaParada(saida.id, pedidoId);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        await recarregar();
        return;
      }
      setErro(null);
      setSucesso(`Pedido #${numeroPedido} marcado como entregue.`);
      await recarregar();
    } finally {
      setOcupado(false);
    }
  }

  // Ficar disponível/indisponível é decisão dele, por empresa — e não mexe nas entregas já atribuídas.
  async function alterarDisponibilidade(
    vinculo: VinculoEntregador,
    disponivel: boolean,
  ) {
    setOcupado(true);
    try {
      const resultado = await alterarMinhaDisponibilidade(
        vinculo.id,
        disponivel,
      );
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setErro(null);
      setVinculos((atuais) =>
        atuais.map((item) =>
          item.id === vinculo.id
            ? { ...item, disponivel: resultado.dados.disponivel }
            : item,
        ),
      );
    } finally {
      setOcupado(false);
    }
  }

  /*
   * Realtime: a empresa atribuiu, trocou, mudou o status ou revogou o acesso. `entrega: null` significa
   * que ela saiu da minha lista — a tela remove na hora o que eu não posso mais ver.
   */
  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoAtualizar = (evento: unknown) => {
      const resultado = eventoEntregaAtualizadaSchema.safeParse(evento);
      if (!resultado.success) return;
      const { pedidoId, entrega } = resultado.data;
      setEntregas((atuais) => {
        const semEla = atuais.filter((item) => item.pedidoId !== pedidoId);
        return entrega && entregaEstaAtiva(entrega.status)
          ? [entrega, ...semEla]
          : semEla;
      });
    };
    // A saída mudou (empresa iniciou, parada concluída, reordenação em outra aba).
    const aoAtualizarSaida = (evento: unknown) => {
      const resultado = eventoSaidaAtualizadaSchema.safeParse(evento);
      if (!resultado.success) return;
      const atualizada = resultado.data.saida;
      setSaidas((atuais) => {
        if (!atualizada.entregador)
          return atuais.filter((item) => item.id !== atualizada.id);
        return atuais.some((item) => item.id === atualizada.id)
          ? atuais.map((item) =>
              item.id === atualizada.id ? atualizada : item,
            )
          : [atualizada, ...atuais];
      });
    };
    /*
     * Convite/vínculo de entregador mudou (a empresa convidou, ativou ou desativou). É o que faz o
     * convite aparecer na hora — antes ele era gravado e ninguém avisava quem estava conectado.
     */
    const aoVinculo = (evento: unknown) => {
      const resultado = eventoVinculoEntregadorSchema.safeParse(evento);
      if (!resultado.success) return;
      const { convite, vinculo } = resultado.data;
      setConvites((atuais) => {
        const semEle = atuais.filter(
          (item) => item.id !== (convite?.id ?? vinculo?.id),
        );
        return convite ? [convite, ...semEle] : semEle;
      });
      setVinculos((atuais) => {
        const semEle = atuais.filter((item) => item.id !== vinculo?.id);
        return vinculo ? [vinculo, ...semEle] : semEle;
      });
    };

    // Minha própria situação mudou (entrei/saí da base, a fila andou, peguei uma saída).
    const aoAtualizarSituacao = (evento: unknown) => {
      const resultado = eventoSituacaoOperacionalSchema.safeParse(evento);
      if (resultado.success) aplicarSituacao(resultado.data.situacao);
    };
    socket.on(EVENTO_ENTREGA_ATUALIZADA, aoAtualizar);
    socket.on(EVENTO_SAIDA_ATUALIZADA, aoAtualizarSaida);
    socket.on(EVENTO_SITUACAO_OPERACIONAL, aoAtualizarSituacao);
    socket.on(EVENTO_VINCULO_ENTREGADOR, aoVinculo);
    return () => {
      socket.off(EVENTO_ENTREGA_ATUALIZADA, aoAtualizar);
      socket.off(EVENTO_SAIDA_ATUALIZADA, aoAtualizarSaida);
      socket.off(EVENTO_SITUACAO_OPERACIONAL, aoAtualizarSituacao);
      socket.off(EVENTO_VINCULO_ENTREGADOR, aoVinculo);
    };
  }, [aplicarSituacao]);

  async function responder(
    convite: ConviteEntregador,
    resposta: "aceitar" | "recusar",
  ) {
    const resultado = await responderConvite(convite.id, resposta);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
    await recarregar();
  }

  // Sem vínculo, convite nem entrega, a pessoa não é entregadora: a área nem aparece.
  if (
    entregas.length === 0 &&
    convites.length === 0 &&
    vinculos.length === 0 &&
    saidas.length === 0
  )
    return null;

  return (
    <div className="flex flex-col gap-3">
      {/* CONVITES PARA ENTREGAR: proposta de vínculo — não é trabalho atribuído. */}
      <ConvitesParaEntregar
        convites={convites}
        aoResponder={(convite, resposta) => void responder(convite, resposta)}
      />

      <section
        aria-label="Minhas entregas"
        className="flex flex-col gap-3 rounded-jaa border border-borda p-3"
      >
        <h2 className="text-base font-semibold">Minhas entregas</h2>

        <EmpresasEmQueTrabalho
          vinculos={vinculos}
          situacoes={situacoes}
          ocupado={ocupado}
          aoAlterarDisponibilidade={(vinculo, disponivel) =>
            void alterarDisponibilidade(vinculo, disponivel)
          }
        />

        <AvisoLocalizacao permissao={permissao} />
        {permissao !== "ativa" && permissao !== "indisponivel" ? (
          <button
            type="button"
            data-permitir-localizacao
            onClick={permitir}
            className="self-start rounded-jaa border px-2 py-1 text-xs"
          >
            Permitir localização
          </button>
        ) : null}

        {/* Saídas: os pedidos que ele leva juntos, na sequência que pode reordenar. */}
        {saidas.map((saida) => (
          <div
            key={saida.id}
            data-saida={saida.id}
            className="flex flex-col gap-2 rounded-jaa border border-borda p-2"
          >
            <p className="text-sm font-medium">
              {saida.zonaPrincipal
                ? `Rota ${[saida.zonaPrincipal.nome, ...saida.zonasCombinadas.map((zona) => zona.nome)].join(" + ")}`
                : "Rota manual"}{" "}
              · {paradasAtivas(saida).length}{" "}
              {paradasAtivas(saida).length === 1 ? "entrega" : "entregas"}
            </p>
            <AcaoIniciarSaida
              saida={saida}
              ocupado={ocupado}
              aoIniciar={() => void iniciar(saida)}
              aoRecusar={() => void recusar(saida)}
            />
            <ResumoPercurso saida={saida} />
            <MapaDaSaidaRecolhivel saida={saida} />
            <SequenciaDaSaida
              saida={saida}
              entregas={entregas}
              mostrarPercurso={false}
              ocupado={ocupado}
              aoMover={(pedidoId, direcao) =>
                void mover(saida, pedidoId, direcao)
              }
              aoConcluir={(pedidoId, numeroPedido) =>
                void concluirParada(saida, pedidoId, numeroPedido)
              }
            />
          </div>
        ))}

        {entregasSemSaida.length > 0 ? (
          <ListaMinhasEntregas entregas={entregasSemSaida} />
        ) : null}
        {saidas.length === 0 && entregas.length === 0 ? (
          <ListaMinhasEntregas entregas={[]} />
        ) : null}

        {sucesso ? (
          <p role="status" className="text-sm text-marca">
            {sucesso}
          </p>
        ) : null}

        {erro && (
          <p role="alert" className="text-sm text-perigo">
            {erro}
          </p>
        )}
      </section>
    </div>
  );
}

export function MapaDaSaidaRecolhivel({ saida }: { saida: SaidaEntrega }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((atual) => !atual)}
        className="self-start rounded-jaa border px-3 py-1.5 text-xs"
      >
        {aberto ? "Ocultar mapa" : "Exibir mapa"}
      </button>
      {aberto ? <MapaPercursoMapbox saida={saida} /> : null}
    </>
  );
}

/**
 * Ação de início da saída, só depois da liberação para retirada. Uma rota apenas PREPARADA já está
 * organizada, mas ainda não autoriza a saída física.
 */
export function AcaoIniciarSaida({
  saida,
  ocupado,
  aoIniciar,
  aoRecusar,
}: {
  saida: SaidaEntrega;
  ocupado: boolean;
  aoIniciar: () => void;
  aoRecusar?: () => void;
}) {
  if (saida.status === "liberada_retirada") {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-iniciar-saida={saida.id}
          disabled={ocupado}
          onClick={aoIniciar}
          className="min-h-11 rounded-full bg-marca px-5 text-sm font-medium text-marca-conteudo disabled:opacity-50"
        >
          SAIR PARA ENTREGA
        </button>
        {aoRecusar ? (
          <button
            type="button"
            data-recusar-saida={saida.id}
            disabled={ocupado}
            onClick={aoRecusar}
            className="min-h-11 rounded-jaa-compacto border border-aviso px-5 text-sm font-medium text-conteudo transition-colors hover:bg-realce disabled:opacity-50 sm:min-h-10"
          >
            Recusar rota
          </button>
        ) : null}
      </div>
    );
  }
  if (saida.status === "preparada") {
    return (
      <p className="text-xs text-conteudo-suave">
        Aguardando liberação para retirada
      </p>
    );
  }
  if (saida.status === "em_andamento") {
    return null;
  }
  return null;
}

/**
 * CONVITES PARA ENTREGAR: área própria, separada do trabalho. Aceitar aqui cria o vínculo — e NÃO
 * deixa a pessoa disponível: quem decide aceitar entregas agora é ela, em "Empresas em que trabalho".
 */
export function ConvitesParaEntregar({
  convites,
  aoResponder,
}: {
  convites: ConviteEntregador[];
  aoResponder: (
    convite: ConviteEntregador,
    resposta: "aceitar" | "recusar",
  ) => void;
}) {
  if (convites.length === 0) return null;

  return (
    <section
      aria-label="Convites para entregar"
      className="flex flex-col gap-2 rounded-jaa border border-ouro/60 bg-aviso/5 p-3"
    >
      <h2 className="text-base font-semibold">Convites para entregar</h2>
      <ol
        aria-label="Convites de entrega"
        className="flex flex-col gap-2 text-sm"
      >
        {convites.map((convite) => (
          <li
            key={convite.id}
            data-convite={convite.id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="flex min-w-0 flex-col">
              <span>
                {convite.empresa.nome} convidou você para fazer entregas.
              </span>
              <span className="text-xs text-conteudo-suave">
                Ao aceitar, você só poderá receber entregas quando estiver com
                status Disponível e na base local.
              </span>
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                data-aceitar-convite
                onClick={() => aoResponder(convite, "aceitar")}
                className="rounded bg-marca px-3 py-1.5 text-xs text-white"
              >
                Aceitar convite
              </button>
              <button
                type="button"
                data-recusar-convite
                onClick={() => aoResponder(convite, "recusar")}
                className="rounded-jaa border px-3 py-1.5 text-xs"
              >
                Recusar
              </button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * "Empresas em que trabalho": o entregador escolhe, POR EMPRESA, se está aceitando novas entregas.
 * Ficar indisponível não devolve nem cancela o que já é dele — só interrompe NOVAS atribuições.
 * Vínculo inativo aparece como tal, sem opção de disponibilidade (isso é decisão da empresa).
 */
export function EmpresasEmQueTrabalho({
  vinculos,
  situacoes = [],
  ocupado,
  aoAlterarDisponibilidade,
}: {
  vinculos: VinculoEntregador[];
  situacoes?: SituacaoOperacional[];
  ocupado: boolean;
  aoAlterarDisponibilidade: (
    vinculo: VinculoEntregador,
    disponivel: boolean,
  ) => void;
}) {
  if (vinculos.length === 0) return null;

  return (
    <ol
      aria-label="Empresas em que trabalho"
      className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm"
    >
      {vinculos.map((vinculo) => {
        const situacao = situacoes.find(
          (item) => item.entregadorId === vinculo.id,
        );
        return (
          <li
            key={vinculo.id}
            data-vinculo={vinculo.id}
            className="flex flex-wrap items-start justify-between gap-2 px-3 py-2"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{vinculo.empresa.nome}</span>
              {entregadorPodeEscolherDisponibilidade(vinculo.status) ? (
                <span
                  data-disponibilidade={
                    vinculo.disponivel ? "disponivel" : "indisponivel"
                  }
                  className={`text-xs ${vinculo.disponivel ? "text-marca" : "text-conteudo-suave"}`}
                >
                  Disponibilidade: {rotuloDisponibilidade(vinculo.disponivel)}
                </span>
              ) : (
                <span
                  data-vinculo-status={vinculo.status}
                  className="text-xs text-conteudo-suave"
                >
                  {ROTULO_STATUS_ENTREGADOR[vinculo.status]}
                </span>
              )}
              {situacao ? (
                <DetalhesEstadoOperacional situacao={situacao} />
              ) : null}
            </span>
            {entregadorPodeEscolherDisponibilidade(vinculo.status) && (
              <button
                type="button"
                data-alternar-disponibilidade
                disabled={ocupado}
                onClick={() =>
                  aoAlterarDisponibilidade(vinculo, !vinculo.disponivel)
                }
                className="shrink-0 rounded-jaa border px-2 py-1 text-xs disabled:opacity-50"
              >
                {vinculo.disponivel ? "Ficar indisponível" : "Ficar disponível"}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function ListaMinhasEntregas({
  entregas,
}: {
  entregas: EntregaAtribuida[];
}) {
  if (entregas.length === 0)
    return (
      <p className="text-sm text-conteudo-suave">
        Nenhuma entrega atribuída a você agora.
      </p>
    );

  return (
    <ol
      aria-label="Entregas atribuídas"
      className="flex flex-col divide-y divide-borda rounded-jaa border border-borda text-sm"
    >
      {entregas.map((entrega) => (
        <li
          key={entrega.pedidoId}
          data-entrega={entrega.pedidoId}
          className="flex flex-col gap-0.5 px-3 py-2"
        >
          <span className="font-medium">
            Pedido #{entrega.numeroPedido} · {entrega.empresa.nome}
          </span>
          <span className="text-xs">
            {formatarEnderecoResumido(entrega.destino)}
          </span>
          <span className="text-xs text-conteudo-suave">
            {entrega.destino.bairro}, {entrega.destino.cidade}/
            {entrega.destino.uf} · CEP {formatarCep(entrega.destino.cep)}
          </span>
          {entrega.destino.pontoReferencia && (
            <span className="text-xs text-conteudo-suave">
              Referência: {entrega.destino.pontoReferencia}
            </span>
          )}
          <span className="text-xs text-conteudo-suave">
            Cliente: {entrega.cliente.nomeExibicao}
          </span>
          <span className="text-xs">
            {entrega.itens
              .map((item) => `${item.quantidade}× ${item.nomeProduto}`)
              .join(", ")}{" "}
            · {formatarPrecoCentavos(entrega.totalCentavos)}
          </span>
          {/* Como receber é informação operacional essencial para quem entrega. */}
          <span
            data-pagamento-entrega={entrega.formaPagamentoNaEntrega}
            className="text-xs"
          >
            {ROTULO_PAGAMENTO_ENTREGA[entrega.formaPagamentoNaEntrega]}
            {entrega.trocoParaCentavos !== null &&
              ` · Troco para ${formatarPrecoCentavos(entrega.trocoParaCentavos)}`}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <span
              data-status-entrega={entrega.status}
              className="text-xs text-conteudo-suave"
            >
              {ROTULO_STATUS_PEDIDO[entrega.status]}
            </span>
            <span data-ponto-entrega className="text-xs text-marca">
              📍 Ponto de entrega confirmado
            </span>
            {/* Usa o ponto SNAPSHOT do pedido; navegação por rota é etapa futura. */}
            <a
              data-abrir-no-mapa
              href={`https://www.openstreetmap.org/?mlat=${entrega.destino.latitude}&mlon=${entrega.destino.longitude}#map=18/${entrega.destino.latitude}/${entrega.destino.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-jaa border px-2 py-0.5 text-xs"
            >
              Abrir no mapa
            </a>
          </span>
        </li>
      ))}
    </ol>
  );
}
