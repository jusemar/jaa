import type { Coordenadas, EstadoRota, MotivoFallbackRota } from "@jaa/contratos";
import { planejadorAproximadoLocal } from "./planejador-rota.js";

/*
 * MOTOR DE ROTAS DO JAA — a fronteira entre o domínio da entrega e QUALQUER provedor de roteamento.
 *
 * O domínio fala em origem, paradas, sequência e percurso. Nenhum endpoint, parâmetro ou formato de
 * fornecedor aparece aqui (nem em saídas, pedidos ou zonas): trocar Mapbox por outro provedor é
 * escrever outra implementação de `ProvedorRoteamento`.
 *
 * Duas operações DIFERENTES, deliberadamente separadas:
 * - OTIMIZAR: "em que ordem visitar estas paradas?" (sugestão);
 * - PERCURSO: "qual é o caminho real pelas ruas NESTA ordem?" (geometria, distância e duração).
 * Quem reordena é o entregador; o motor só recalcula o percurso da ordem que ele escolheu.
 */

export interface ParadaDeRota {
  pedidoId: string;
  // Ponto SNAPSHOT confirmado pelo cliente naquele pedido — nunca geocodificado de novo.
  coordenadas: Coordenadas;
}

export interface Percurso {
  // Traçado pelas ruas, na ordem de percurso. Só existe quando um provedor real o devolveu.
  geometria: Coordenadas[];
  distanciaMetros: number;
  // Duração do TRAJETO estimada pelo provedor. Não é previsão de entrega ao cliente.
  duracaoSegundos: number;
}

export interface SequenciaOtimizada {
  ordem: string[];
  // Alguns provedores devolvem o percurso junto da otimização; quando não, o motor pede à parte.
  percurso?: Percurso | undefined;
}

export interface ProvedorRoteamento {
  readonly nome: string;
  /*
   * Quantas PARADAS o provedor aceita em cada operação (sem contar a origem). Acima disso o motor
   * não chama: nada é truncado e a saída cai no fallback com o motivo registrado.
   */
  readonly maximoParadasOtimizacao: number;
  readonly maximoParadasPercurso: number;
  // Rota ABERTA: sai da origem e termina na última parada (o entregador não volta à empresa).
  otimizarSequencia(origem: Coordenadas, paradas: ParadaDeRota[]): Promise<SequenciaOtimizada>;
  calcularPercurso(origem: Coordenadas, paradas: ParadaDeRota[]): Promise<Percurso>;
}

export interface RotaCalculada {
  ordem: string[];
  estado: EstadoRota;
  motivoFallback: MotivoFallbackRota | null;
  provedor: string | null;
  origem: Coordenadas | null;
  sequenciaDoProvedor: boolean;
  percurso: Percurso | null;
}

// Uma linha por chamada (ou recusa) — a base da observabilidade de consumo por empresa.
export interface RegistroConsumoRota {
  operacao: "otimizacao" | "percurso";
  resultado: "sucesso" | "falha" | "nao_aplicavel";
  provedor: string;
  paradas: number;
  motivo: MotivoFallbackRota | null;
  duracaoMs: number | null;
}

export interface ResultadoMotor {
  rota: RotaCalculada;
  consumos: RegistroConsumoRota[];
}

export interface MotorDeRotas {
  // Planejamento inicial: sugere a ordem e, quando possível, já devolve o percurso real dela.
  planejar(origem: Coordenadas | null, paradas: ParadaDeRota[]): Promise<ResultadoMotor>;
  /*
   * A ordem JÁ está decidida (o entregador reordenou): só calcula o caminho real dela.
   * Nunca reotimiza — a escolha de quem está na rua prevalece.
   */
  recalcularPercurso(origem: Coordenadas | null, paradas: ParadaDeRota[]): Promise<ResultadoMotor>;
}

const SEM_PROVEDOR = "aproximacao-local";

async function ordemAproximada(origem: Coordenadas | null, paradas: ParadaDeRota[]): Promise<string[]> {
  const plano = await planejadorAproximadoLocal.sugerirSequencia(
    paradas.map((parada) => ({ pedidoId: parada.pedidoId, coordenadas: parada.coordenadas })),
    origem ?? undefined,
  );
  return plano.ordem;
}

function fallback(ordem: string[], origem: Coordenadas | null, motivo: MotivoFallbackRota): RotaCalculada {
  // Em fallback NÃO existem distância, duração ou traçado: nada é inventado para preencher a tela.
  return { ordem, estado: "aproximacao_local", motivoFallback: motivo, provedor: null, origem, sequenciaDoProvedor: false, percurso: null };
}

function motivoDaFalha(erro: unknown): MotivoFallbackRota {
  return erro instanceof ErroRespostaProvedor ? "resposta_invalida" : "provedor_indisponivel";
}

// Resposta que chegou, mas não é utilizável (formato inesperado, paradas faltando, etc.).
export class ErroRespostaProvedor extends Error {}

/**
 * Motor padrão: usa o provedor quando ele existe, cabe e responde; cai para a aproximação local
 * determinística em qualquer outro caso. O provedor NUNCA é ponto único de falha da operação.
 */
export function criarMotorDeRotas(provedor: ProvedorRoteamento | null): MotorDeRotas {
  async function executar(
    operacao: "otimizacao" | "percurso",
    origem: Coordenadas | null,
    paradas: ParadaDeRota[],
    acao: (provedor: ProvedorRoteamento, origem: Coordenadas) => Promise<RotaCalculada>,
  ): Promise<ResultadoMotor> {
    const consumos: RegistroConsumoRota[] = [];
    const registrar = (registro: RegistroConsumoRota) => consumos.push(registro);
    const nome = provedor?.nome ?? SEM_PROVEDOR;

    const recusar = async (motivo: MotivoFallbackRota): Promise<ResultadoMotor> => {
      registrar({ operacao, resultado: "nao_aplicavel", provedor: nome, paradas: paradas.length, motivo, duracaoMs: null });
      return { rota: fallback(await ordemAproximada(origem, paradas), origem, motivo), consumos };
    };

    if (!provedor) return recusar("provedor_nao_configurado");
    // Sem o ponto da base não há de onde sair: a ordem continua, o percurso não.
    if (!origem) return recusar("sem_base_confirmada");
    const capacidade = operacao === "otimizacao" ? provedor.maximoParadasOtimizacao : provedor.maximoParadasPercurso;
    // Capacidade excedida: nenhum pedido é descartado — a saída inteira segue, só sem percurso real.
    if (paradas.length > capacidade) return recusar("capacidade_excedida");

    const inicio = Date.now();
    try {
      const rota = await acao(provedor, origem);
      registrar({ operacao, resultado: "sucesso", provedor: nome, paradas: paradas.length, motivo: null, duracaoMs: Date.now() - inicio });
      return { rota, consumos };
    } catch (erro) {
      const motivo = motivoDaFalha(erro);
      registrar({ operacao, resultado: "falha", provedor: nome, paradas: paradas.length, motivo, duracaoMs: Date.now() - inicio });
      return { rota: fallback(await ordemAproximada(origem, paradas), origem, motivo), consumos };
    }
  }

  return {
    async planejar(origem, paradas) {
      // Uma parada só não tem o que otimizar; o percurso dela ainda vale (origem → destino).
      if (paradas.length === 1) return this.recalcularPercurso(origem, paradas);

      return executar("otimizacao", origem, paradas, async (usado, pontoDeOrigem) => {
        const otimizada = await usado.otimizarSequencia(pontoDeOrigem, paradas);
        const ordenadas = otimizada.ordem
          .map((pedidoId) => paradas.find((parada) => parada.pedidoId === pedidoId))
          .filter((parada): parada is ParadaDeRota => parada !== undefined);
        // Ordem que perdeu ou inventou parada não é aproveitável: melhor cair no fallback.
        if (ordenadas.length !== paradas.length) throw new ErroRespostaProvedor("Sequência do provedor não cobre todas as paradas.");

        const percurso = otimizada.percurso ?? (await usado.calcularPercurso(pontoDeOrigem, ordenadas));
        return {
          ordem: otimizada.ordem,
          estado: "percurso_real",
          motivoFallback: null,
          provedor: usado.nome,
          origem: pontoDeOrigem,
          sequenciaDoProvedor: true,
          percurso,
        };
      });
    },

    async recalcularPercurso(origem, paradas) {
      const ordem = paradas.map((parada) => parada.pedidoId);
      return executar("percurso", origem, paradas, async (usado, pontoDeOrigem) => ({
        ordem,
        estado: "percurso_real",
        motivoFallback: null,
        provedor: usado.nome,
        origem: pontoDeOrigem,
        // A ordem é de quem pediu (entregador ou sequência já gravada): o provedor não a reescreve.
        sequenciaDoProvedor: false,
        percurso: await usado.calcularPercurso(pontoDeOrigem, paradas),
      }));
    },
  };
}
