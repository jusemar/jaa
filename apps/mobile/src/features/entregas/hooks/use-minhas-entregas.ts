import {
  EVENTO_ENTREGA_ATUALIZADA,
  EVENTO_SAIDA_ATUALIZADA,
  EVENTO_SITUACAO_OPERACIONAL,
  EVENTO_VINCULO_ENTREGADOR,
  eventoEntregaAtualizadaSchema,
  eventoSaidaAtualizadaSchema,
  eventoSituacaoOperacionalSchema,
  eventoVinculoEntregadorSchema,
  type SaidaEntrega,
  type SituacaoOperacional,
} from "@jaa/contratos";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { obterClienteRealtime } from "@/lib/realtime/cliente-realtime";
import { listarMeusConvites, listarMeusVinculos, listarMinhasEntregas, listarMinhasSituacoes, listarSaidas } from "../lib/api-entregas";
import { SEM_ENTREGAS, aplicarEntrega, aplicarSaida, aplicarSituacao, aplicarVinculo, type MinhasEntregas } from "../lib/minhas-entregas";

/**
 * Estado de "Minhas entregas" — o mesmo da Web: cinco leituras da API e os QUATRO eventos em tempo
 * real que a Web escuta (`saida:atualizada`, `entrega:atualizada`, `entregador:situacao`, vínculo).
 * O que chega pelo socket é só aviso: reconectar e voltar ao primeiro plano releem tudo do servidor.
 * Nada de consulta periódica.
 */
export function useMinhasEntregas() {
  const [estado, setEstado] = useState<MinhasEntregas>(SEM_ENTREGAS);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const [saidas, entregas, vinculos, convites, situacoes] = await Promise.all([listarSaidas(), listarMinhasEntregas(), listarMeusVinculos(), listarMeusConvites(), listarMinhasSituacoes()]);
    setCarregando(false);
    // A lista de saídas é a que sustenta a tela: sem ela, dizemos que falhou.
    setErro(saidas.ok ? null : saidas.mensagem);
    setEstado((atual) => ({
      saidas: saidas.ok ? saidas.dados.saidas : atual.saidas,
      entregas: entregas.ok ? entregas.dados.entregas : atual.entregas,
      vinculos: vinculos.ok ? vinculos.dados.vinculos : atual.vinculos,
      convites: convites.ok ? convites.dados.convites : atual.convites,
      situacoes: situacoes.ok ? situacoes.dados.situacoes : atual.situacoes,
    }));
  }, []);

  useEffect(() => {
    const socket = obterClienteRealtime();
    const aoSaida = (evento: unknown) => {
      const lido = eventoSaidaAtualizadaSchema.safeParse(evento);
      if (lido.success) setEstado((atual) => ({ ...atual, saidas: aplicarSaida(atual.saidas, lido.data.saida) }));
    };
    const aoEntrega = (evento: unknown) => {
      const lido = eventoEntregaAtualizadaSchema.safeParse(evento);
      if (lido.success) setEstado((atual) => ({ ...atual, entregas: aplicarEntrega(atual.entregas, lido.data.pedidoId, lido.data.entrega) }));
    };
    const aoSituacao = (evento: unknown) => {
      const lido = eventoSituacaoOperacionalSchema.safeParse(evento);
      if (lido.success) setEstado((atual) => ({ ...atual, situacoes: aplicarSituacao(atual.situacoes, lido.data.situacao) }));
    };
    const aoVinculo = (evento: unknown) => {
      const lido = eventoVinculoEntregadorSchema.safeParse(evento);
      if (lido.success) setEstado((atual) => ({ ...atual, ...aplicarVinculo(atual, lido.data.convite, lido.data.vinculo) }));
    };
    const reler = () => void recarregar();

    reler();
    socket.on(EVENTO_SAIDA_ATUALIZADA, aoSaida);
    socket.on(EVENTO_ENTREGA_ATUALIZADA, aoEntrega);
    socket.on(EVENTO_SITUACAO_OPERACIONAL, aoSituacao);
    socket.on(EVENTO_VINCULO_ENTREGADOR, aoVinculo);
    // Reconectou: o que aconteceu enquanto esteve fora não chega por evento.
    socket.on("connect", reler);
    const assinatura = AppState.addEventListener("change", (situacao) => {
      if (situacao === "active") reler();
    });
    return () => {
      socket.off(EVENTO_SAIDA_ATUALIZADA, aoSaida);
      socket.off(EVENTO_ENTREGA_ATUALIZADA, aoEntrega);
      socket.off(EVENTO_SITUACAO_OPERACIONAL, aoSituacao);
      socket.off(EVENTO_VINCULO_ENTREGADOR, aoVinculo);
      socket.off("connect", reler);
      assinatura.remove();
    };
  }, [recarregar]);

  const adotarSaida = useCallback((saida: SaidaEntrega) => setEstado((atual) => ({ ...atual, saidas: aplicarSaida(atual.saidas, saida) })), []);
  const removerSaida = useCallback(
    (saida: SaidaEntrega) =>
      setEstado((atual) => {
        const pedidos = new Set(saida.paradas.map((parada) => parada.pedidoId));
        return { ...atual, saidas: atual.saidas.filter((item) => item.id !== saida.id), entregas: atual.entregas.filter((entrega) => !pedidos.has(entrega.pedidoId)) };
      }),
    [],
  );
  const adotarSituacao = useCallback((situacao: SituacaoOperacional) => setEstado((atual) => ({ ...atual, situacoes: aplicarSituacao(atual.situacoes, situacao) })), []);
  const adotarDisponibilidade = useCallback(
    (vinculoId: string, disponivel: boolean) => setEstado((atual) => ({ ...atual, vinculos: atual.vinculos.map((item) => (item.id === vinculoId ? { ...item, disponivel } : item)) })),
    [],
  );

  return {
    ...estado,
    carregando,
    erro,
    recarregar,
    atualizar: useCallback(() => {
      setCarregando(true);
      void recarregar();
    }, [recarregar]),
    adotarSaida,
    removerSaida,
    adotarSituacao,
    adotarDisponibilidade,
  };
}
