import { POLITICA_RASTREAMENTO, decidirEnvioDePosicao, type EnviarPosicaoEntrada, type LeituraGps, type SituacaoRastreamento } from "@jaa/contratos";
import { isRunningInExpoGo } from "expo";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { PermissionsAndroid, Platform } from "react-native";
import { enviarPosicao } from "./api-entregas";
import { lerFilaLocal, gravarFilaLocal, lerSaidaRastreada, gravarSaidaRastreada } from "./deposito-rastreamento";
import { pausarPresenca, retomarPresenca } from "./presenca-segundo-plano";

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

/*
 * No Expo Go a localização em BACKGROUND não existe (no Android, de jeito nenhum): chamar essas APIs lá
 * só produz um aviso do sistema por cima da tela. O app então nem tenta — o acompanhamento fica "só com
 * o app aberto", que é exatamente o que a interface já sabe dizer.
 */
const BACKGROUND_DISPONIVEL = !isRunningInExpoGo();

/*
 * Configuração do coletor. Dois cuidados que vieram do teste em aparelho real (o cliente não via o
 * mapa porque NENHUMA posição chegava ao servidor):
 * - precisão ALTA: a "equilibrada" dentro de um prédio costuma vir com incerteza acima de 100 m, e a
 *   política descarta essa leitura (com razão) — o aparelho ficava sem nada para enviar;
 * - distância mínima ZERO: com distância mínima o Android não entrega leitura nenhuma a quem está
 *   parado (na porta do cliente, no semáforo), e sem leitura não existe nem o "sinal de vida". Quem
 *   decide o que vira requisição continua sendo a POLÍTICA (`decidirEnvioDePosicao`): parado, só o
 *   sinal de vida no intervalo máximo. O custo de rede não muda; o de GPS vale só durante a entrega.
 */
const PRECISAO_DA_ENTREGA = Location.Accuracy.High;
const OPCOES_LOCALIZACAO: Location.LocationTaskOptions = {
  accuracy: PRECISAO_DA_ENTREGA,
  timeInterval: POLITICA_RASTREAMENTO.intervaloMinimoMs,
  distanceInterval: 0,
  // Android: serviço em primeiro plano com aviso — exigência do sistema e transparência com a pessoa.
  foregroundService: {
    notificationTitle: "Entrega em andamento",
    notificationBody: "O Jaaa está compartilhando sua localização com a empresa durante esta saída.",
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

/*
 * O agendador de tarefas em segundo plano grava um job PERSISTENTE, e o Android derruba o app se o
 * manifesto não tiver RECEIVE_BOOT_COMPLETED. Permissão "normal": declarada = concedida. Um binário
 * anterior à correção (sem ela no manifesto) NÃO pode iniciar a tarefa: ali o acompanhamento fica só
 * com o app aberto, que é o que a interface já sabe dizer — em vez de fechar na cara do entregador.
 */
export async function binarioSuportaSegundoPlano(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    return await PermissionsAndroid.check("android.permission.RECEIVE_BOOT_COMPLETED" as Parameters<typeof PermissionsAndroid.check>[0]);
  } catch {
    return false;
  }
}

// Android 13+: o aviso do serviço de localização só aparece com esta permissão. Recusar não impede o
// rastreamento — só esconde o aviso —, então o resultado não muda a situação.
async function pedirAvisoDoServico(): Promise<void> {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) return;
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
}

export interface PermissoesRastreamento {
  situacao: SituacaoRastreamento;
  // false = dá para acompanhar só com o app aberto; o Jaa avisa em vez de prometer o impossível.
  background: boolean;
}

/**
 * Pede as permissões na ordem que Android e iOS exigem: primeiro plano primeiro, depois background.
 * `pedir: false` só CONFERE o que já foi concedido (retomada ao abrir o app): nenhum diálogo do
 * sistema aparece sem um toque da pessoa.
 */
export async function pedirPermissoes(pedir = true): Promise<PermissoesRastreamento> {
  if (!(await Location.hasServicesEnabledAsync())) return { situacao: "gps_desligado", background: false };

  const primeiroPlano = pedir ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
  if (!primeiroPlano.granted) return { situacao: "permissao_negada", background: false };

  if (!BACKGROUND_DISPONIVEL || !(await binarioSuportaSegundoPlano())) return { situacao: "somente_primeiro_plano", background: false };
  const background = pedir ? await Location.requestBackgroundPermissionsAsync() : await Location.getBackgroundPermissionsAsync();
  return background.granted ? { situacao: "ativo", background: true } : { situacao: "somente_primeiro_plano", background: false };
}

/**
 * Liga o rastreamento DESTA saída. Chamado quando a saída está em andamento — nunca "sempre que o
 * app abre". Sem permissão de background, o acompanhamento existe só com o app aberto, e a situação
 * devolvida diz exatamente isso.
 */
export async function iniciarRastreamento(saidaId: string, { pedir = true }: { pedir?: boolean } = {}): Promise<SituacaoRastreamento> {
  const permissoes = await pedirPermissoes(pedir);
  if (permissoes.situacao !== "ativo" && permissoes.situacao !== "somente_primeiro_plano") return permissoes.situacao;

  await gravarSaidaRastreada(saidaId);
  // A PRIMEIRA posição sai agora, sem esperar o coletor: o cliente da vez vê o entregador no mapa
  // assim que a rota começa (ou assim que o app volta a abrir no meio dela).
  void enviarPosicaoAtual(saidaId);
  // A entrega começou: a localização passa a ser DESTA tarefa. A de presença na base é desligada
  // antes — nunca as duas ao mesmo tempo.
  await pausarPresenca();
  if (!permissoes.background) return "somente_primeiro_plano";

  try {
    const jaRodando = await Location.hasStartedLocationUpdatesAsync(TAREFA_RASTREAMENTO);
    if (!jaRodando) {
      await pedirAvisoDoServico();
      await Location.startLocationUpdatesAsync(TAREFA_RASTREAMENTO, OPCOES_LOCALIZACAO);
    }
    return "ativo";
  } catch {
    // O sistema recusou o serviço em segundo plano (economia de bateria, restrição do fabricante):
    // o acompanhamento continua com o app aberto, e a tela diz isso.
    return "somente_primeiro_plano";
  }
}

async function enviarPosicaoAtual(saidaId: string): Promise<void> {
  try {
    await processarLeituras(saidaId, [await Location.getCurrentPositionAsync({ accuracy: PRECISAO_DA_ENTREGA })]);
  } catch {
    // Sem leitura agora (GPS sem sinal): o coletor entrega a próxima.
  }
}

/** Desliga o rastreamento: saída concluída, cancelada, perdida ou recusada pelo servidor. */
export async function pararRastreamento(): Promise<void> {
  if (BACKGROUND_DISPONIVEL && (await Location.hasStartedLocationUpdatesAsync(TAREFA_RASTREAMENTO))) {
    await Location.stopLocationUpdatesAsync(TAREFA_RASTREAMENTO);
  }
  await gravarSaidaRastreada(null);
  // Sem entrega em andamento: se ele continua aceitando entregas, a presença na base volta a ser
  // confirmada em segundo plano (é o que o recoloca na fila ao voltar à base com a tela bloqueada).
  await retomarPresenca();
}

export async function rastreamentoEstaAtivo(): Promise<boolean> {
  return BACKGROUND_DISPONIVEL && Location.hasStartedLocationUpdatesAsync(TAREFA_RASTREAMENTO);
}

/**
 * Coleta em PRIMEIRO PLANO: usada enquanto o app está aberto (e é o único caminho quando o sistema só
 * concede permissão "durante o uso"). Devolve a função que encerra a assinatura.
 */
export async function observarEmPrimeiroPlano(saidaId: string): Promise<() => void> {
  const assinatura = await Location.watchPositionAsync(
    // As mesmas escolhas do coletor em segundo plano (ver `OPCOES_LOCALIZACAO`).
    { accuracy: PRECISAO_DA_ENTREGA, timeInterval: POLITICA_RASTREAMENTO.intervaloMinimoMs, distanceInterval: 0 },
    (posicao) => {
      void processarLeituras(saidaId, [posicao]);
    },
  );
  return () => assinatura.remove();
}
