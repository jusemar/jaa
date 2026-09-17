import { ROTULO_SITUACAO_RASTREAMENTO, type SaidaEntrega, type SituacaoRastreamento } from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FluxoLogin } from "@/features/autenticacao/components/fluxo-login";
import { concluirCadastro, type ContaMobile } from "@/features/autenticacao/lib/api-conta";
import { listarMinhasSaidas, saidaEmAndamento } from "../lib/api-entregas";
import { iniciarRastreamento, observarEmPrimeiroPlano, pararRastreamento, rastreamentoEstaAtivo } from "../lib/rastreamento";

/**
 * Experiência MÍNIMA do entregador: ver a saída em andamento, autorizar a localização e saber, sem
 * rodeios, se o acompanhamento está ativo. Administração da empresa continua sendo no Web.
 *
 * A tela não decide nada de negócio: a saída (e portanto o rastreamento) vem do servidor.
 */
export function TelaEntrega() {
  const [conta, setConta] = useState<ContaMobile | null>(null);
  const [carregandoConta, setCarregandoConta] = useState(true);
  const [saida, setSaida] = useState<SaidaEntrega | null>(null);
  const [situacao, setSituacao] = useState<SituacaoRastreamento>("sem_operacao");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const resultado = await listarMinhasSaidas();
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return;
    }
    setErro(null);
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

  // Sessão do Better Auth guardada no aparelho: reabrir o app não pede login de novo.
  useEffect(() => {
    void concluirCadastro.buscar().then((atual) => {
      setConta(atual && atual.cadastroCompleto ? atual : null);
      setCarregandoConta(false);
    });
  }, []);

  useEffect(() => {
    if (!conta) return;
    void carregar();
    // Voltar ao primeiro plano é o momento natural de reconferir a operação e o rastreamento.
    const assinatura = AppState.addEventListener("change", (estado) => {
      if (estado === "active") void carregar();
    });
    return () => assinatura.remove();
  }, [carregar, conta]);

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

  if (carregandoConta) {
    return (
      <ThemedView style={estilos.container}>
        <ThemedText>Carregando…</ThemedText>
      </ThemedView>
    );
  }

  // Sem sessão, a primeira coisa é entrar — o rastreamento exige entregador autenticado.
  if (!conta) {
    return (
      <ThemedView style={estilos.container}>
        <FluxoLogin aoEntrar={setConta} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={estilos.container}>
      <ThemedText type="title">Minha entrega</ThemedText>
      <ThemedText type="small">Você está como {conta.identidadePessoal?.nomeExibicao ?? "entregador"}.</ThemedText>

      {!saida && <ThemedText>{ROTULO_SITUACAO_RASTREAMENTO.sem_operacao}</ThemedText>}

      {saida && (
        <View style={estilos.bloco}>
          <ThemedText type="subtitle">
            {saida.empresa.nome} · {paradasAtivas.length} {paradasAtivas.length === 1 ? "entrega" : "entregas"}
          </ThemedText>
          {paradasAtivas.map((parada, indice) => (
            <ThemedText key={parada.id} type="small">
              {indice + 1}. {parada.cliente.nomeExibicao} — {parada.destino.logradouro}, {parada.destino.numero}
            </ThemedText>
          ))}

          <ThemedText type="small">{ROTULO_SITUACAO_RASTREAMENTO[situacao]}</ThemedText>
          {situacao !== "ativo" && (
            <Pressable accessibilityRole="button" onPress={() => void ativar()} style={estilos.botao}>
              <ThemedText type="smallBold">Ativar localização desta saída</ThemedText>
            </Pressable>
          )}
        </View>
      )}

      {erro && <ThemedText type="small">{erro}</ThemedText>}
    </ThemedView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, gap: 12, padding: 16 },
  bloco: { gap: 6 },
  botao: { alignSelf: "flex-start", borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
});
