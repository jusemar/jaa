import {
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_SITUACAO_RASTREAMENTO,
  ROTULO_STATUS_PEDIDO,
  entregadorPodeEscolherDisponibilidade,
  formatarEnderecoResumido,
  type ConviteEntregador,
  type EntregaAtribuida,
  type ParadaSaida,
  type SaidaEntrega,
  type SituacaoOperacional,
  type SituacaoRastreamento,
  type VinculoEntregador,
} from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, Switch, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { Icone } from "@/components/ui/icone";
import { Aviso, Cartao, EstadoVazio, Secao } from "@/components/ui/superficies";
import { Tela } from "@/components/ui/tela";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { avisarUmaVez } from "@/lib/sons/avisar";
import { useContextoConta } from "@/features/conta/components/provedor-contexto-conta";
import { useAbrirConversa } from "@/features/conversas/hooks/use-abrir-conversa";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { useMinhasEntregas } from "../hooks/use-minhas-entregas";
import { usePresencaNaBase } from "../hooks/use-presenca-na-base";
import { alterarMinhaDisponibilidade, concluirMinhaProximaParada, iniciarMinhaSaida, recalcularRota, recusarMinhaSaida, reordenarSequencia, responderConvite, saidaEmAndamento } from "../lib/api-entregas";
import { entregasForaDasSaidas, estadoEmUmaLinha, ordenarSaidas, urlDeNavegacao } from "../lib/minhas-entregas";
import { iniciarRastreamento, observarEmPrimeiroPlano, pararRastreamento } from "../lib/rastreamento";
import { CartaoSaida } from "./cartao-saida";

/**
 * "MINHAS ENTREGAS" no app — a MESMA operação da área do entregador na Web, com as mesmas rotas da
 * API: disponibilidade e base, convites, a rota liberada (sair para entrega / recusar), a rota na rua
 * (paradas, concluir, reordenar, recalcular), mapa, itens e as conversas de sempre.
 *
 * A tela não decide nada de negócio: cada ação é um pedido à API, que confere quem é o entregador e
 * se o estado permite. O que a tela mostra vem do servidor e dos eventos em tempo real.
 */
export function TelaEntrega() {
  const { contexto } = useContextoConta();
  const minhas = useMinhasEntregas();
  const { saidas, entregas, vinculos, convites, situacoes, recarregar } = minhas;
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<SituacaoRastreamento>("sem_operacao");
  const conversa = useAbrirConversa(contexto?.identidadePessoal?.id ?? "");
  const naRua = saidaEmAndamento(saidas);
  const naRuaId = naRua?.id ?? null;
  // Durante uma entrega a presença em segundo plano fica desligada: a localização é do rastreamento.
  const presenca = usePresencaNaBase(situacoes, minhas.adotarSituacao, naRuaId !== null);

  // O rastreamento só existe com saída EM ANDAMENTO: acabou a operação, ele para aqui também.
  useEffect(() => {
    let ativo = true;
    void (async () => {
      if (!naRuaId) {
        await pararRastreamento();
        if (ativo) setSituacao("sem_operacao");
      } else {
        /*
         * Rota EM ANDAMENTO: garante que o rastreamento DESTA saída está ligado — inclusive quando o
         * app foi fechado e reaberto no meio da entrega (sem isso o aparelho parava de enviar posição
         * sem avisar). Só confere permissões já concedidas: nenhum diálogo aparece sozinho.
         */
        const retomada = await iniciarRastreamento(naRuaId, { pedir: false });
        if (ativo) setSituacao(retomada);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [naRuaId]);

  // Sem permissão de background, o acompanhamento existe enquanto o app estiver aberto.
  useEffect(() => {
    if (!naRuaId || situacao !== "somente_primeiro_plano") return;
    let encerrar: (() => void) | null = null;
    void observarEmPrimeiroPlano(naRuaId).then((parar) => {
      encerrar = parar;
    });
    return () => encerrar?.();
  }, [naRuaId, situacao]);

  /** Uma ação por vez: trava os botões, mostra a recusa da API e relê a situação real. */
  async function executar<T>(acao: () => Promise<{ ok: true; dados: T } | { ok: false; mensagem: string }>, aoDarCerto: (dados: T) => void | Promise<void>): Promise<boolean> {
    setOcupado(true);
    setSucesso(null);
    try {
      const resultado = await acao();
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        await recarregar();
        return false;
      }
      setErro(null);
      await aoDarCerto(resultado.dados);
      return true;
    } finally {
      setOcupado(false);
    }
  }

  const confirmar = (titulo: string, texto: string, rotulo: string, aoConfirmar: () => void) =>
    Alert.alert(titulo, texto, [
      { text: "Cancelar", style: "cancel" },
      { text: rotulo, onPress: aoConfirmar },
    ]);

  /*
   * SAIR PARA ENTREGA: a mesma rota da Web. A saída passa a "em andamento" e cada pedido pronto vira
   * "saiu para entrega" — decidido pela API. Só então a localização da saída passa a valer.
   */
  const iniciar = (saida: SaidaEntrega) =>
    confirmar("Sair para entrega?", `Você vai sair com os pedidos de ${saida.empresa.nome}. Eles passam a "saiu para entrega".`, "Sair para entrega", () => {
      void executar(
        () => iniciarMinhaSaida(saida.id),
        async (atualizada) => {
          minhas.adotarSaida(atualizada);
          setSucesso("Rota iniciada. Boa entrega!");
          setSituacao(await iniciarRastreamento(atualizada.id));
          await recarregar();
        },
      );
    });

  const recusar = (saida: SaidaEntrega) =>
    confirmar("Recusar esta rota?", "Ela voltará para a fila de entrega e poderá ser direcionada a outro entregador.", "Recusar rota", () => {
      void executar(
        () => recusarMinhaSaida(saida.id),
        async () => {
          minhas.removerSaida(saida);
          setSucesso("Rota recusada. Ela voltou para a fila de entrega.");
          await recarregar();
        },
      );
    });

  const concluir = (saida: SaidaEntrega, parada: ParadaSaida) =>
    confirmar("Confirmar entrega?", `Pedido #${parada.numeroPedido} · ${parada.cliente.nomeExibicao}`, "Marcar como entregue", () => {
      void executar(
        () => concluirMinhaProximaParada(saida.id, parada.pedidoId),
        async (atualizada) => {
          minhas.adotarSaida(atualizada);
          avisarUmaVez("sucesso", `entrega:${parada.pedidoId}`);
          setSucesso(`Pedido #${parada.numeroPedido} marcado como entregue.`);
          await recarregar();
        },
      );
    });

  const salvarOrdem = (saida: SaidaEntrega, ordem: string[]) => executar(() => reordenarSequencia(saida.id, saida.versaoSequencia, ordem), minhas.adotarSaida);

  const recalcular = (saida: SaidaEntrega) =>
    executar(
      () => recalcularRota(saida.id, saida.versaoSequencia),
      (atualizada) => {
        minhas.adotarSaida(atualizada);
        setSucesso(atualizada.rota?.estado === "percurso_real" ? "Rota recalculada pelas ruas." : "Ordem reorganizada por aproximação — o cálculo pelas ruas não está disponível agora.");
      },
    );

  const alternarDisponibilidade = (vinculo: VinculoEntregador) =>
    void executar(
      () => alterarMinhaDisponibilidade(vinculo.id, !vinculo.disponivel),
      async (atualizado) => {
        minhas.adotarDisponibilidade(vinculo.id, atualizado.disponivel);
        await recarregar();
      },
    );

  const responder = (convite: ConviteEntregador, resposta: "aceitar" | "recusar") => void executar(() => responderConvite(convite.id, resposta), recarregar);

  const semSaida = entregasForaDasSaidas(entregas, saidas);
  const nome = contexto?.identidadePessoal?.nomeExibicao;
  const ehEntregador = vinculos.length > 0 || convites.length > 0 || saidas.length > 0 || entregas.length > 0;
  const falha = erro ?? conversa.erro ?? minhas.erro;

  return (
    <Tela atualizando={minhas.carregando} aoAtualizar={minhas.atualizar}>
      <Secao titulo="Minhas entregas" {...(nome ? { descricao: `Você está como ${nome}.` } : {})}>
        {falha && <Aviso tom="erro">{falha}</Aviso>}
        {sucesso && <Aviso>{sucesso}</Aviso>}

        {convites.map((convite) => (
          <Cartao key={convite.id} style={estilos.bloco}>
            <Texto variante="corpoForte">{convite.empresa.nome} convidou você para fazer entregas.</Texto>
            <Texto variante="pequeno" cor="conteudoSuave">
              Ao aceitar, você só poderá receber entregas quando estiver com status Disponível e na base local.
            </Texto>
            <View style={estilos.linhaDeBotoes}>
              <Botao rotulo="Aceitar convite" compacto disabled={ocupado} onPress={() => responder(convite, "aceitar")} />
              <Botao rotulo="Recusar" aparencia="secundario" compacto disabled={ocupado} onPress={() => responder(convite, "recusar")} />
            </View>
          </Cartao>
        ))}

        {vinculos.length > 0 && (
          <Cartao style={estilos.lista} accessibilityLabel="Empresas em que trabalho">
            {vinculos.map((vinculo, indice) => (
              <EmpresaEmQueTrabalho
                key={vinculo.id}
                vinculo={vinculo}
                situacao={situacoes.find((item) => item.entregadorId === vinculo.id)}
                primeira={indice === 0}
                ocupado={ocupado}
                aoAlternar={() => alternarDisponibilidade(vinculo)}
              />
            ))}
          </Cartao>
        )}

        {/* A base só detecta quem chegou com a localização do aparelho — e só enquanto ele aceita entregas. */}
        {presenca.aceitando && presenca.permissao !== "ativa" && (
          <LinhaDeLocalizacao
            titulo={TITULO_PERMISSAO[presenca.permissao]}
            texto={TEXTO_PERMISSAO[presenca.permissao]}
            {...(presenca.permissao === "indisponivel" ? {} : { acao: "Ativar", aoTocar: presenca.permitir })}
          />
        )}
        {/* Localização ok, mas só com o app aberto: bloquear a tela faria perder o lugar na fila. */}
        {presenca.aceitando && presenca.permissao === "ativa" && presenca.segundoPlano === "somente_primeiro_plano" && (
          <LinhaDeLocalizacao titulo="Presença só com o Jaaa aberto" texto={'Permita a localização "o tempo todo" para manter seu lugar na fila com a tela bloqueada.'} acao="Permitir" aoTocar={presenca.permitir} />
        )}

        {ordenarSaidas(saidas).map((saida) => (
          <CartaoSaida
            key={saida.id}
            saida={saida}
            entregas={entregas}
            ocupado={ocupado || conversa.abrindo}
            aoConversar={(nomeUsuario) => void conversa.abrirCom(nomeUsuario)}
            aoIniciar={() => iniciar(saida)}
            aoRecusar={() => recusar(saida)}
            aoConcluir={(parada) => concluir(saida, parada)}
            aoSalvarOrdem={(ordem) => salvarOrdem(saida, ordem)}
            aoRecalcularRota={() => recalcular(saida)}
            rastreamento={
              saida.id === naRuaId ? (
                <LinhaDeLocalizacao
                  ativa={situacao === "ativo"}
                  titulo={situacao === "ativo" ? "Localização ativa" : "Localização da entrega"}
                  texto={ROTULO_SITUACAO_RASTREAMENTO[situacao]}
                  {...(situacao === "ativo" ? {} : { acao: "Ativar", aoTocar: () => void iniciarRastreamento(saida.id).then(setSituacao) })}
                />
              ) : undefined
            }
          />
        ))}

        {semSaida.map((entrega) => (
          <EntregaAvulsa key={entrega.pedidoId} entrega={entrega} />
        ))}

        {!minhas.carregando && !falha && saidas.length === 0 && semSaida.length === 0 && (
          <EstadoVazio
            titulo="Nenhuma entrega atribuída a você agora"
            descricao={ehEntregador ? "Quando uma rota for direcionada a você, ela aparece aqui na hora, com um aviso sonoro." : "Quando uma empresa convidar você para entregar, o convite aparece aqui."}
          />
        )}
      </Secao>
    </Tela>
  );
}

/**
 * Uma empresa em que a pessoa entrega: UMA linha de estado (o servidor já diz se ele aceita e se está
 * na base) e um interruptor — ligado = aceitando entregas desta empresa. A cor acompanha o texto,
 * nunca o substitui.
 */
function EmpresaEmQueTrabalho({ vinculo, situacao, primeira, ocupado, aoAlternar }: { vinculo: VinculoEntregador; situacao: SituacaoOperacional | undefined; primeira: boolean; ocupado: boolean; aoAlternar: () => void }) {
  const estado = estadoEmUmaLinha(vinculo, situacao);
  const cor = estado.tom === "ativo" ? "marca" : estado.tom === "atencao" ? "aviso" : "conteudoSuave";
  return (
    <View style={[estilos.empresa, !primeira && estilos.divisoria]}>
      <View style={estilos.textoDaEmpresa}>
        <Texto variante="corpoForte" numberOfLines={1}>
          {vinculo.empresa.nome}
        </Texto>
        <Texto variante="pequenoMedio" cor={cor}>
          ● {estado.texto}
        </Texto>
        {situacao && !situacao.baseConfigurada && (
          <Texto variante="mini" cor="aviso">
            A empresa ainda não confirmou o ponto da base.
          </Texto>
        )}
      </View>
      {entregadorPodeEscolherDisponibilidade(vinculo.status) && (
        <Switch
          accessibilityLabel={`Aceitar entregas de ${vinculo.empresa.nome}`}
          accessibilityHint={vinculo.disponivel ? "Desligue para ficar indisponível" : "Ligue para ficar disponível"}
          value={vinculo.disponivel}
          disabled={ocupado}
          onValueChange={aoAlternar}
          trackColor={{ false: Cores.borda, true: Cores.marcaSuave }}
          thumbColor={vinculo.disponivel ? Cores.marca : Cores.superficie}
        />
      )}
    </View>
  );
}

const TITULO_PERMISSAO = { ausente: "Localização desativada", negada: "Localização negada", indisponivel: "Localização do aparelho desligada" } as const;
const TEXTO_PERMISSAO = {
  ausente: "Ative para a presença automática na base.",
  negada: "Libere nos ajustes do aparelho para entrar na fila da base.",
  indisponivel: "Ligue o GPS para entrar na fila da base.",
} as const;

/** Uma linha para o estado da localização: o que está acontecendo e, se couber, a ação ao lado. */
function LinhaDeLocalizacao({ titulo, texto, ativa = false, acao, aoTocar }: { titulo: string; texto: string; ativa?: boolean; acao?: string; aoTocar?: () => void }) {
  return (
    <View style={estilos.localizacao}>
      <Icone nome="localizacao" tamanho={18} cor={ativa ? "marca" : "aviso"} />
      <View style={estilos.textoDaEmpresa}>
        <Texto variante="pequenoForte">{titulo}</Texto>
        <Texto variante="mini" cor="conteudoSuave">
          {texto}
        </Texto>
      </View>
      {acao && aoTocar && <Botao rotulo={acao} aparencia="realce" compacto onPress={aoTocar} />}
    </View>
  );
}

/** Entrega atribuída fora de uma rota (atribuição avulsa da empresa): só o necessário para entregar. */
function EntregaAvulsa({ entrega }: { entrega: EntregaAtribuida }) {
  const { destino } = entrega;
  return (
    <Cartao style={estilos.bloco}>
      <Texto variante="corpoForte">
        Pedido #{entrega.numeroPedido} · {entrega.empresa.nome}
      </Texto>
      <Texto variante="corpoMedio">{formatarEnderecoResumido(destino)}</Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        {destino.bairro}, {destino.cidade}/{destino.uf}
        {destino.pontoReferencia ? ` · Referência: ${destino.pontoReferencia}` : ""}
      </Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        Cliente: {entrega.cliente.nomeExibicao}
      </Texto>
      <Texto variante="pequeno">
        {entrega.itens.map((item) => `${item.quantidade}× ${item.nomeProduto}`).join(", ")} · {formatarPrecoCentavos(entrega.totalCentavos)}
      </Texto>
      <Texto variante="pequenoForte">
        {ROTULO_PAGAMENTO_ENTREGA[entrega.formaPagamentoNaEntrega]}
        {entrega.trocoParaCentavos !== null && ` · Troco para ${formatarPrecoCentavos(entrega.trocoParaCentavos)}`}
      </Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        Status: {ROTULO_STATUS_PEDIDO[entrega.status]}
      </Texto>
      <Botao rotulo="Navegar" aparencia="secundario" compacto onPress={() => void Linking.openURL(urlDeNavegacao(destino, `Pedido ${entrega.numeroPedido}`)).catch(() => undefined)} />
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  bloco: { gap: Espaco.dois, padding: Espaco.quatro },
  lista: { paddingHorizontal: Espaco.quatro },
  linhaDeBotoes: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  empresa: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: 56, paddingVertical: Espaco.dois },
  divisoria: { borderTopColor: Cores.borda, borderTopWidth: 1 },
  textoDaEmpresa: { flex: 1, gap: 2, minWidth: 0 },
  localizacao: { alignItems: "center", backgroundColor: Cores.superficieSuave, borderRadius: Raio.compacto, flexDirection: "row", gap: Espaco.dois, paddingHorizontal: Espaco.tres, paddingVertical: Espaco.dois },
});
