import { POLITICA_RASTREAMENTO, decidirEnvioDePosicao, type EnviarPosicaoEntrada, type LeituraGps, type SituacaoRastreamento } from "@jaa/contratos";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { enviarPosicao } from "./api-entregas";
import { lerFilaLocal, gravarFilaLocal, lerSaidaRastreada, gravarSaidaRastreada } from "./deposito-rastreamento";

/*
 * RASTREAMENTO NO APARELHO — só durante a saída EM ANDAMENTO.
 *
 * O que este módulo garante (e o que ele NÃO promete):
 * - começa quando existe saída em andamento do entregador e para quando ela termina. Fora disso o Jaa
 *   não coleta localização nenhuma: acabou a entrega, acabou o rastreamento;
 * - aplica a POLÍTICA compartilhada (`@jaa/contratos`) antes de gastar rede e bateria: leitura
 *   imprecisa é descartada, parado não vira requisição e há "sinal de vida" no intervalo máximo;
 * - o sistema operacional pode negar, limitar ou interromper o background. Quando isso acontece, a
 *   interface DIZ (situação `somente_primeiro_plano`, `permissao_negada`, `gps_desligado`), em vez de
 *   prometer um acompanhamento contínuo que não depende do Jaa.
 *
 * ATENÇÃO (documentado no README): rastreamento em background exige DEVELOPMENT BUILD. O Expo Go não
 * representa o comportamento real de background em Android nem em iOS.
 */

export const TAREFA_RASTREAMENTO = "jaa-rastreamento-entrega";

/** Configuração do coletor. Centralizada para ajuste com teste em aparelho real. */
const OPCOES_LOCALIZACAO: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: POLITICA_RASTREAMENTO.intervaloMinimoMs,
  distanceInterval: POLITICA_RASTREAMENTO.distanciaMinimaMetros,
  // Android: serviço em primeiro plano com aviso — exigência do sistema e transparência com a pessoa.
  foregroundService: {
    notificationTitle: "Entrega em andamento",
    notificationBody: "O Jaa está compartilhando sua localização com a empresa durante esta saída.",
    notificationColor: "#0f766e",
  },
  // iOS: indicador azul visível enquanto o app usa localização em background.
  showsBackgroundLocationIndicator: true,
  pausesUpdatesAutomatically: false,
};

const paraLeitura = (posicao: Location.LocationObject): LeituraGps => ({
  latitude: posicao.coords.latitude,
  longitude: posicao.coords.longitude,
  precisaoMetros: posicao.coords.accuracy ?? null,
  capturadaEm: new Date(posicao.timestamp),
});

const paraEnvio = (posicao: Location.LocationObject): EnviarPosicaoEntrada => ({
  latitude: Number(posicao.coords.latitude.toFixed(6)),
  longitude: Number(posicao.coords.longitude.toFixed(6)),
  precisaoMetros: posicao.coords.accuracy ?? null,
  velocidadeMetrosPorSegundo: posicao.coords.speed !== null && posicao.coords.speed >= 0 ? posicao.coords.speed : null,
  direcaoGraus: posicao.coords.heading !== null && posicao.coords.heading >= 0 ? posicao.coords.heading : null,
  capturadaEm: new Date(posicao.timestamp).toISOString(),
});

/**
 * Processa as leituras (vindas do background ou do primeiro plano): aplica a política, envia e trata
 * a perda de conexão. A fila local é CURTA de propósito — o que importa é a posição atual, não a
 * trilha; despejar coordenadas velhas no servidor ao reconectar não ajuda ninguém.
 */
export async function processarLeituras(saidaId: string, posicoes: Location.LocationObject[]): Promise<void> {
  const estado = await lerFilaLocal();
  let anterior: LeituraGps | null = estado.ultimaEnviada ? { ...estado.ultimaEnviada, capturadaEm: new Date(estado.ultimaEnviada.capturadaEm) } : null;
  const pendentes = [...estado.pendentes];

  for (const posicao of posicoes) {
    const decisao = decidirEnvioDePosicao(anterior, paraLeitura(posicao));
    if (!decisao.enviar) continue;
    pendentes.push(paraEnvio(posicao));
    anterior = paraLeitura(posicao);
  }

  // Sem conexão a fila cresce; o limite mantém as MAIS RECENTES e descarta o que já não é operacional.
  const paraEnviar = pendentes.slice(-POLITICA_RASTREAMENTO.maximoPendentes);
  const naoEnviadas: EnviarPosicaoEntrada[] = [];
  let ultimaEnviada = estado.ultimaEnviada;

  for (const leitura of paraEnviar) {
    const resultado = await enviarPosicao(saidaId, leitura);
    if (resultado.ok) {
      ultimaEnviada = { latitude: leitura.latitude, longitude: leitura.longitude, capturadaEm: leitura.capturadaEm };
      continue;
    }
    // 409/404: a operação acabou ou não é dele — parar é o certo, e a fila não serve para mais nada.
    if (resultado.status === 409 || resultado.status === 404) {
      await pararRastreamento();
      await gravarFilaLocal({ pendentes: [], ultimaEnviada: null });
      return;
    }
    // Sem rede (status 0) ou erro momentâneo: guarda para a próxima volta.
    naoEnviadas.push(leitura);
  }

  await gravarFilaLocal({ pendentes: naoEnviadas.slice(-POLITICA_RASTREAMENTO.maximoPendentes), ultimaEnviada });
}

/*
 * Tarefa de background: recebe as leituras do sistema mesmo com o app fechado/tela bloqueada.
 * Precisa ser definida no escopo do módulo (o sistema reinicia o app e procura a tarefa pelo nome).
 */
TaskManager.defineTask(TAREFA_RASTREAMENTO, async ({ data, error }) => {
  if (error) return;
  const leituras = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  if (leituras.length === 0) return;
  // A saída rastreada fica gravada no aparelho: o background não tem a tela para perguntar.
  const saidaId = await lerSaidaRastreada();
  if (!saidaId) return;
  await processarLeituras(saidaId, leituras);
});

export interface PermissoesRastreamento {
  situacao: SituacaoRastreamento;
  // false = dá para acompanhar só com o app aberto; o Jaa avisa em vez de prometer o impossível.
  background: boolean;
}

/** Pede as permissões na ordem que Android e iOS exigem: primeiro plano primeiro, depois background. */
export async function pedirPermissoes(): Promise<PermissoesRastreamento> {
  if (!(await Location.hasServicesEnabledAsync())) return { situacao: "gps_desligado", background: false };

  const primeiroPlano = await Location.requestForegroundPermissionsAsync();
  if (!primeiroPlano.granted) return { situacao: "permissao_negada", background: false };

  const background = await Location.requestBackgroundPermissionsAsync();
  return background.granted ? { situacao: "ativo", background: true } : { situacao: "somente_primeiro_plano", background: false };
}

/**
 * Liga o rastreamento DESTA saída. Chamado quando a saída está em andamento — nunca "sempre que o
 * app abre". Sem permissão de background, o acompanhamento existe só com o app aberto, e a situação
 * devolvida diz exatamente isso.
 */
export async function iniciarRastreamento(saidaId: string): Promise<SituacaoRastreamento> {
  const permissoes = await pedirPermissoes();
  if (permissoes.situacao !== "ativo" && permissoes.situacao !== "somente_primeiro_plano") return permissoes.situacao;

  await gravarSaidaRastreada(saidaId);
  if (!permissoes.background) return "somente_primeiro_plano";

  const jaRodando = await Location.hasStartedLocationUpdatesAsync(TAREFA_RASTREAMENTO);
  if (!jaRodando) await Location.startLocationUpdatesAsync(TAREFA_RASTREAMENTO, OPCOES_LOCALIZACAO);
  return "ativo";
}

/** Desliga o rastreamento: saída concluída, cancelada, perdida ou recusada pelo servidor. */
export async function pararRastreamento(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(TAREFA_RASTREAMENTO)) {
    await Location.stopLocationUpdatesAsync(TAREFA_RASTREAMENTO);
  }
  await gravarSaidaRastreada(null);
}

export async function rastreamentoEstaAtivo(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(TAREFA_RASTREAMENTO);
}

/**
 * Coleta em PRIMEIRO PLANO: usada enquanto o app está aberto (e é o único caminho quando o sistema só
 * concede permissão "durante o uso"). Devolve a função que encerra a assinatura.
 */
export async function observarEmPrimeiroPlano(saidaId: string): Promise<() => void> {
  const assinatura = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: POLITICA_RASTREAMENTO.intervaloMinimoMs,
      distanceInterval: POLITICA_RASTREAMENTO.distanciaMinimaMetros,
    },
    (posicao) => {
      void processarLeituras(saidaId, [posicao]);
    },
  );
  return () => assinatura.remove();
}
