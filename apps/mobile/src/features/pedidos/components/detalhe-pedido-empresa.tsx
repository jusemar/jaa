import {
  MOTIVO_CANCELAMENTO_TAMANHO_MAXIMO,
  ROTULO_ACAO_AVANCAR,
  ROTULO_PAGAMENTO_ENTREGA,
  ROTULO_STATUS_ENTREGADOR,
  ROTULO_STATUS_PEDIDO,
  formatarCep,
  formatarEnderecoResumido,
  montarTimelinePedido,
  podeCancelarPedido,
  trocoEsperadoCentavos,
  type EntregaDoPedido,
  type EntregadorDaEmpresa,
  type Pedido,
} from "@jaa/contratos";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { Aviso, Cartao } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { Cores, Espaco, Raio } from "@/constants/theme";
import { formatarHorarioMensagem } from "@/features/conversas/lib/horarios";
import { formatarPrecoCentavos } from "@/features/produtos/lib/precos";
import { Divisoria, Escolha } from "@/features/profissional/components/pecas";
import { MOTIVOS_DE_CANCELAMENTO, OUTRO_MOTIVO, motivoEscolhido, motivoValido, podeAtribuirEntregador } from "../lib/gestao-pedidos";

/*
 * O PEDIDO ABERTO pela empresa — o `DetalhePedido` da Web com as ações de gestão: itens com a montagem
 * gravada, valores, endereço (snapshot), como o cliente paga NA ENTREGA, status, linha do tempo,
 * entregador e a PRÓXIMA ação válida. Tudo aqui é apresentação: quem decide é a API.
 */
export function DetalhePedidoEmpresa({ pedido, children }: { pedido: Pedido; children?: ReactNode }) {
  const troco = trocoEsperadoCentavos(pedido);
  const destino = pedido.destino;
  return (
    <Cartao accessibilityLabel="Detalhe do pedido" style={estilos.cartao}>
      <View style={estilos.bloco}>
        <Texto variante="subtitulo" accessibilityRole="header">
          Pedido #{pedido.numero} — {pedido.cliente.nomeExibicao}
        </Texto>
        <Texto variante="pequeno" cor="conteudoSuave">
          Cliente: {pedido.cliente.nomeExibicao} (@{pedido.cliente.nomeUsuario})
        </Texto>
      </View>

      <View accessibilityLabel="Itens do pedido" style={estilos.bloco}>
        {pedido.itens.map((item) => (
          <View key={item.id} style={estilos.item}>
            <Texto>
              {item.quantidade}× {item.nomeProduto} — {formatarPrecoCentavos(item.precoUnitarioCentavos)} cada = {formatarPrecoCentavos(item.subtotalCentavos)}
            </Texto>
            {item.observacao && (
              <Texto variante="pequeno" cor="conteudoSuave" style={estilos.recuo}>
                Observação: {item.observacao}
              </Texto>
            )}
            {/* SNAPSHOT da montagem: grupo, opção e acréscimo como estavam na compra. */}
            {item.escolhas.map((escolha, indice) => (
              <Texto key={`${escolha.grupoNome}-${escolha.opcaoNome}-${indice}`} variante="pequeno" cor="conteudoSuave" style={estilos.recuo}>
                {escolha.grupoNome}: {escolha.opcaoNome}
                {escolha.precoAdicionalCentavos > 0 && ` (+${formatarPrecoCentavos(escolha.precoAdicionalCentavos)})`}
              </Texto>
            ))}
          </View>
        ))}
      </View>

      <View style={estilos.bloco}>
        <Valor rotulo="Subtotal" valor={formatarPrecoCentavos(pedido.subtotalCentavos)} />
        <Valor rotulo="Taxa de entrega" valor={pedido.freteFinalCentavos === 0 ? "Grátis" : formatarPrecoCentavos(pedido.freteFinalCentavos)} />
        <View style={estilos.valor}>
          <Texto variante="subtitulo">Total</Texto>
          <Texto variante="subtitulo">{formatarPrecoCentavos(pedido.totalCentavos)}</Texto>
        </View>
      </View>

      <Divisoria />

      {destino ? (
        <View style={estilos.bloco}>
          <Texto variante="corpoMedio">Entregar em</Texto>
          <Texto>{formatarEnderecoResumido(destino)}</Texto>
          <Texto variante="pequeno" cor="conteudoSuave">
            {destino.bairro}, {destino.cidade}/{destino.uf} · CEP {formatarCep(destino.cep)}
          </Texto>
          {destino.pontoReferencia && (
            <Texto variante="pequeno" cor="conteudoSuave">
              Referência: {destino.pontoReferencia}
            </Texto>
          )}
          <View style={estilos.linha}>
            <Icone nome="local" tamanho={14} cor="marca" />
            <Texto variante="pequeno" cor="marca">
              Ponto de entrega confirmado
            </Texto>
          </View>
        </View>
      ) : (
        <Texto variante="pequeno" cor="conteudoSuave">
          Este pedido é anterior ao ponto de entrega confirmado.
        </Texto>
      )}

      <View style={estilos.bloco}>
        <Texto>Pagamento: {ROTULO_PAGAMENTO_ENTREGA[pedido.formaPagamentoNaEntrega]}</Texto>
        {pedido.trocoParaCentavos !== null && (
          <Texto>
            Troco para: {formatarPrecoCentavos(pedido.trocoParaCentavos)}
            {troco !== null && troco > 0 && <Texto cor="conteudoSuave"> (levar {formatarPrecoCentavos(troco)} de troco)</Texto>}
          </Texto>
        )}
      </View>

      <Divisoria />

      <View style={estilos.bloco}>
        <Texto variante="corpoMedio">Status: {ROTULO_STATUS_PEDIDO[pedido.status]}</Texto>
        {pedido.motivoCancelamento && (
          <Texto variante="pequeno" cor="perigo">
            Motivo do cancelamento: {pedido.motivoCancelamento}
          </Texto>
        )}
        <LinhaDoTempo pedido={pedido} />
      </View>

      {children}
    </Cartao>
  );
}

function Valor({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.valor}>
      <Texto variante="pequeno" cor="conteudoSuave">
        {rotulo}
      </Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        {valor}
      </Texto>
    </View>
  );
}

/**
 * Linha do tempo da GESTÃO (a compacta da Web): concluídas com o horário real, a atual em destaque e
 * as futuras apagadas — estas vêm da máquina de estados só para exibir.
 */
function LinhaDoTempo({ pedido }: { pedido: Pick<Pedido, "status" | "historico"> }) {
  return (
    <View accessibilityLabel="Acompanhamento do pedido" style={estilos.tempo}>
      {montarTimelinePedido(pedido.status, pedido.historico).map((etapa) => {
        const situacao = etapa.situacao === "concluida" ? "concluída" : etapa.situacao === "atual" ? "etapa atual" : "próxima etapa";
        return (
          <View key={etapa.status} accessible accessibilityLabel={`${ROTULO_STATUS_PEDIDO[etapa.status]}, ${situacao}`} style={estilos.etapa}>
            <View style={estilos.marca}>
              {etapa.situacao === "concluida" ? <Icone nome="check" tamanho={14} cor="marca" /> : <View style={[estilos.ponto, etapa.situacao === "atual" && estilos.pontoAtual]} />}
            </View>
            <Texto variante={etapa.situacao === "atual" ? "pequenoForte" : "pequeno"} cor={etapa.situacao === "futura" ? "conteudoSuave" : "conteudo"} style={estilos.flex}>
              {ROTULO_STATUS_PEDIDO[etapa.status]}
              {etapa.ocorridoEm && <Texto variante="pequeno" cor="conteudoSuave">{` — ${formatarHorarioMensagem(etapa.ocorridoEm)}`}</Texto>}
            </Texto>
          </View>
        );
      })}
    </View>
  );
}

/**
 * ENTREGADOR do pedido (visão da empresa): quem está levando, com quem já esteve e a ação de
 * atribuir/trocar — só com o pedido pronto ou na rua. O cliente não vê nada disto.
 */
export function EntregaDoPedidoEmpresa({
  pedido,
  entrega,
  entregadores,
  ocupado,
  aoAtribuir,
}: {
  pedido: Pedido;
  entrega: EntregaDoPedido | null;
  // Só quem pode receber AGORA (vínculo ativo e disponível); o servidor confere de novo.
  entregadores: EntregadorDaEmpresa[];
  ocupado: boolean;
  aoAtribuir: (entregadorId: string) => void;
}) {
  const [escolhendo, setEscolhendo] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const atual = entrega?.entregadorAtual ?? null;

  return (
    <View style={estilos.caixa}>
      <Texto variante="corpoMedio">Entregador</Texto>
      <Texto>
        {atual ? `${atual.pessoa.nomeExibicao} (@${atual.pessoa.nomeUsuario})` : "Nenhum"}
        {atual && atual.status !== "ativo" && <Texto cor="aviso"> — {ROTULO_STATUS_ENTREGADOR[atual.status]}</Texto>}
      </Texto>

      {podeAtribuirEntregador(pedido.status) && !escolhendo && <Botao rotulo={atual ? "Trocar entregador" : "Atribuir entregador"} aparencia="secundario" compacto disabled={ocupado} onPress={() => setEscolhendo(true)} />}

      {escolhendo && (
        <View accessibilityRole="radiogroup" accessibilityLabel="Escolher entregador" style={estilos.bloco}>
          {entregadores.length === 0 ? (
            <Texto variante="pequeno" cor="conteudoSuave">
              Nenhum entregador ativo e disponível agora.
            </Texto>
          ) : (
            <View style={estilos.escolhas}>
              {entregadores.map((entregador) => (
                <Escolha key={entregador.id} papel="radio" marcada={escolhido === entregador.id} rotulo={entregador.pessoa.nomeExibicao} desabilitada={ocupado} aoAlternar={() => setEscolhido(entregador.id)} />
              ))}
            </View>
          )}
          <View style={estilos.acoes}>
            <Botao
              rotulo="Confirmar atribuição"
              compacto
              disabled={ocupado || escolhido === null}
              onPress={() => {
                if (escolhido) aoAtribuir(escolhido);
                setEscolhendo(false);
                setEscolhido(null);
              }}
            />
            <Botao rotulo="Cancelar" aparencia="secundario" compacto onPress={() => setEscolhendo(false)} />
          </View>
        </View>
      )}

      {/* Auditoria operacional: quem esteve com o pedido antes continua registrado. */}
      {entrega && entrega.historico.length > 0 && (
        <View accessibilityLabel="Histórico de entregadores">
          {entrega.historico.map((evento) => (
            <Texto key={evento.id} variante="pequeno" cor="conteudoSuave">
              {formatarHorarioMensagem(evento.atribuidoEm)} — {evento.entregador.nomeExibicao}
              {evento.encerradoEm && ` (encerrado${evento.motivoEncerramento ? `: ${evento.motivoEncerramento}` : ""})`}
            </Texto>
          ))}
        </View>
      )}
    </View>
  );
}

/** O pedido já está numa saída que AINDA NÃO saiu: uma pergunta curta antes de tirá-lo de lá. */
export function ConfirmarTransferencia({ nomeEntregador, ocupado, aoConfirmar, aoCancelar }: { nomeEntregador: string | null; ocupado: boolean; aoConfirmar: () => void; aoCancelar: () => void }) {
  return (
    <View accessibilityRole="alert" style={[estilos.caixa, estilos.caixaAviso]}>
      <Texto variante="corpoMedio">Este pedido já está em uma saída que ainda não saiu. Deseja atribuí-lo a {nomeEntregador ?? "este entregador"}?</Texto>
      <Texto variante="pequeno" cor="conteudoSuave">
        Ele sai daquela saída; os outros pedidos dela continuam como estão.
      </Texto>
      <View style={estilos.acoes}>
        <Botao rotulo="Atribuir mesmo assim" compacto carregando={ocupado} textoCarregando="Atribuindo…" disabled={ocupado} onPress={aoConfirmar} />
        <Botao rotulo="Cancelar" aparencia="secundario" compacto disabled={ocupado} onPress={aoCancelar} />
      </View>
    </View>
  );
}

/**
 * Ações operacionais: só a PRÓXIMA ação válida (nunca sete botões de status) e, enquanto fizer sentido,
 * o cancelamento — que exige confirmação explícita e um motivo curto.
 */
export function AcoesPedidoEmpresa({ pedido, ocupado, aoAvancar, aoCancelar }: { pedido: Pedido; ocupado: boolean; aoAvancar: () => void; aoCancelar: (motivo: string) => void }) {
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState<string>(MOTIVOS_DE_CANCELAMENTO[0] ?? OUTRO_MOTIVO);
  const [outroMotivo, setOutroMotivo] = useState("");
  const rotuloAvancar = ROTULO_ACAO_AVANCAR[pedido.status];
  const podeCancelar = podeCancelarPedido(pedido.status);
  const escolhido = motivoEscolhido(motivo, outroMotivo);

  if (!rotuloAvancar && !podeCancelar) {
    return (
      <Texto variante="pequeno" cor="conteudoSuave">
        Este pedido está encerrado.
      </Texto>
    );
  }

  return (
    <View style={estilos.bloco}>
      {rotuloAvancar && <Botao rotulo={rotuloAvancar} larguraTotal carregando={ocupado} disabled={ocupado} onPress={aoAvancar} />}
      {podeCancelar && !cancelando && <Botao rotulo="Cancelar pedido" aparencia="perigo" larguraTotal disabled={ocupado} onPress={() => setCancelando(true)} />}

      {/* Cancelar não acontece por um toque: exige motivo e confirmação. */}
      {cancelando && (
        <View accessibilityLabel="Cancelar pedido" style={[estilos.caixa, estilos.caixaPerigo]}>
          <Texto>Cancelar este pedido? O cliente verá o cancelamento e o motivo.</Texto>
          <View accessibilityRole="radiogroup" accessibilityLabel="Motivo" style={estilos.escolhas}>
            {MOTIVOS_DE_CANCELAMENTO.map((opcao) => (
              <Escolha key={opcao} papel="radio" marcada={motivo === opcao} rotulo={opcao} desabilitada={ocupado} aoAlternar={() => setMotivo(opcao)} />
            ))}
          </View>
          {motivo === OUTRO_MOTIVO && <CampoTexto rotulo="Qual motivo?" value={outroMotivo} onChangeText={setOutroMotivo} maxLength={MOTIVO_CANCELAMENTO_TAMANHO_MAXIMO} placeholder="Explique em poucas palavras" />}
          <View style={estilos.acoes}>
            <Botao
              rotulo="Confirmar cancelamento"
              aparencia="perigo"
              compacto
              disabled={ocupado || !motivoValido(escolhido)}
              onPress={() => {
                aoCancelar(escolhido);
                setCancelando(false);
              }}
            />
            <Botao rotulo="Manter pedido" aparencia="secundario" compacto onPress={() => setCancelando(false)} />
          </View>
        </View>
      )}
    </View>
  );
}

export function ErroDoPedido({ mensagem }: { mensagem: string | null }) {
  return mensagem ? <Aviso tom="erro">{mensagem}</Aviso> : null;
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  bloco: { gap: Espaco.um },
  item: { gap: 2 },
  recuo: { paddingLeft: Espaco.quatro },
  valor: { alignItems: "baseline", flexDirection: "row", gap: Espaco.tres, justifyContent: "space-between" },
  linha: { alignItems: "center", flexDirection: "row", gap: Espaco.um },
  tempo: { gap: 2, paddingTop: Espaco.um },
  etapa: { alignItems: "center", flexDirection: "row", gap: Espaco.dois },
  marca: { alignItems: "center", height: 16, justifyContent: "center", width: 16 },
  ponto: { borderColor: Cores.borda, borderRadius: Raio.total, borderWidth: 2, height: 10, width: 10 },
  pontoAtual: { backgroundColor: Cores.marca, borderColor: Cores.marca },
  caixa: { borderColor: Cores.borda, borderRadius: Raio.bloco, borderWidth: 1, gap: Espaco.dois, padding: Espaco.tres },
  caixaAviso: { backgroundColor: "#FBF6E8", borderColor: "#DBCDA6" },
  caixaPerigo: { backgroundColor: Cores.perigoSuave, borderColor: "#F6B3B6" },
  escolhas: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  acoes: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
});
