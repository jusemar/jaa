import { isRunningInExpoGo } from "expo";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { PermissionsAndroid, Platform } from "react-native";
import { enviarLocalizacaoDaBase } from "./api-entregas";
import { INTERVALO_PRESENCA_SEGUNDO_PLANO_MS, TAREFA_PRESENCA, aposResposta, leituraDaPosicao, lerVinculosGuardados, situacaoDaPresenca, type SituacaoPresencaSegundoPlano } from "./presenca-base";

/*
 * PRESENÇA NA BASE EM SEGUNDO PLANO — a parte que fala com o aparelho. Mesma infraestrutura do
 * rastreamento da entrega (expo-location + expo-task-manager + serviço em primeiro plano do Android,
 * com as permissões que o app já declara), em OUTRA tarefa, mais leve, e nunca ao mesmo tempo que ele.
 *
 * - liga quando a pessoa aceita entregas de alguma empresa E concedeu "permitir o tempo todo";
 * - desliga quando ela deixa de aceitar em todas, sai da conta, começa uma entrega (o rastreamento
 *   assume) ou o servidor responde que não há mais o que confirmar — inclusive com a tela fechada;
 * - o Android mostra o aviso fixo "Presença na base" enquanto ela roda: a pessoa sempre sabe.
 *
 * A lista de vínculos fica no armazenamento seguro do aparelho: a tarefa pode ser acordada pelo
 * sistema sem a tela (e sem a memória do app) e precisa saber por quem confirmar. Nenhuma coordenada
 * é guardada.
 */

const CHAVE_VINCULOS = "jaa.presenca.vinculos";
const SEGUNDO_PLANO_DISPONIVEL = !isRunningInExpoGo();

const OPCOES: Location.LocationTaskOptions = {
  /*
   * Precisão alta de propósito: o servidor recusa leitura com incerteza maior que o raio da base
   * (150 m por padrão), e a precisão "equilibrada" dentro de um prédio costuma passar disso — a
   * presença venceria com a pessoa parada lá. O custo é controlado pelo intervalo, não pela precisão.
   */
  accuracy: Location.Accuracy.High,
  timeInterval: INTERVALO_PRESENCA_SEGUNDO_PLANO_MS,
  // Zero: quem espera na base está PARADO. Com distância mínima, parado não geraria leitura nenhuma.
  distanceInterval: 0,
  foregroundService: {
    notificationTitle: "Presença na base",
    notificationBody: "O Jaaa confirma que você está na base para manter seu lugar na fila.",
    notificationColor: "#0f766e",
  },
  showsBackgroundLocationIndicator: true,
  pausesUpdatesAutomatically: false,
};

async function lerVinculos(): Promise<string[]> {
  return lerVinculosGuardados(await SecureStore.getItemAsync(CHAVE_VINCULOS).catch(() => null));
}

async function gravarVinculos(vinculos: readonly string[]): Promise<void> {
  if (vinculos.length === 0) await SecureStore.deleteItemAsync(CHAVE_VINCULOS).catch(() => undefined);
  else await SecureStore.setItemAsync(CHAVE_VINCULOS, JSON.stringify(vinculos)).catch(() => undefined);
}

// Mesma checagem do rastreamento: binário sem RECEIVE_BOOT_COMPLETED fecharia ao agendar a tarefa.
async function binarioSuporta(): Promise<boolean> {
  if (!SEGUNDO_PLANO_DISPONIVEL) return false;
  if (Platform.OS !== "android") return true;
  try {
    return await PermissionsAndroid.check("android.permission.RECEIVE_BOOT_COMPLETED" as Parameters<typeof PermissionsAndroid.check>[0]);
  } catch {
    return false;
  }
}

async function tarefaLigada(): Promise<boolean> {
  return SEGUNDO_PLANO_DISPONIVEL && (await Location.hasStartedLocationUpdatesAsync(TAREFA_PRESENCA).catch(() => false));
}

async function desligarTarefa(): Promise<void> {
  if (await tarefaLigada()) await Location.stopLocationUpdatesAsync(TAREFA_PRESENCA).catch(() => undefined);
}

async function ligarTarefa(): Promise<boolean> {
  try {
    if (await tarefaLigada()) return true;
    // Android 13+: o aviso fixo só aparece com esta permissão; recusar não impede a presença.
    if (Platform.OS === "android" && Number(Platform.Version) >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
    await Location.startLocationUpdatesAsync(TAREFA_PRESENCA, OPCOES);
    return true;
  } catch {
    // O sistema recusou o serviço (economia de bateria, restrição do fabricante): fica só com o app aberto.
    return false;
  }
}

/*
 * A TAREFA: acordada pelo sistema a cada leitura, com ou sem a tela. Envia a leitura mais recente por
 * cada vínculo e obedece ao servidor — é ele quem diz se ainda há o que confirmar.
 * Precisa ser definida no escopo do módulo (o sistema reinicia o app e procura a tarefa pelo nome),
 * por isso este arquivo é importado na raiz do app.
 */
TaskManager.defineTask(TAREFA_PRESENCA, async ({ data, error }) => {
  if (error) return;
  const posicao = (data as { locations?: Location.LocationObject[] } | undefined)?.locations?.at(-1);
  if (!posicao) return;

  let vinculos = await lerVinculos();
  let emEntrega = false;
  const leitura = leituraDaPosicao(posicao);
  for (const vinculoId of [...vinculos]) {
    const resposta = await enviarLocalizacaoDaBase(vinculoId, leitura);
    const depois = aposResposta(vinculos, vinculoId, resposta.ok ? { ok: true, dados: resposta.dados } : { ok: false, status: resposta.status });
    vinculos = depois.vinculos;
    emEntrega ||= depois.emEntrega;
  }
  await gravarVinculos(vinculos);
  // Ninguém mais para confirmar, ou começou uma entrega (o rastreamento assume): a tarefa se desliga.
  if (vinculos.length === 0 || emEntrega) await desligarTarefa();
});

export async function permissaoSegundoPlanoConcedida(): Promise<boolean> {
  return (await Location.getBackgroundPermissionsAsync().catch(() => null))?.granted ?? false;
}

/** Pede "permitir o tempo todo". Só é chamado por um toque da pessoa; o primeiro plano vem antes. */
export async function pedirPermissaoSegundoPlano(): Promise<boolean> {
  if (!(await binarioSuporta())) return false;
  return (await Location.requestBackgroundPermissionsAsync().catch(() => null))?.granted ?? false;
}

/**
 * Deixa a tarefa no estado certo para a situação atual: liga, mantém ou desliga. Chamada sempre que
 * muda quem está aceitando entregas ou começa/termina uma entrega. Devolve o que ficou valendo, para
 * a tela dizer a verdade ("só com o app aberto" quando falta a permissão).
 */
export async function sincronizarPresencaSegundoPlano(condicoes: { vinculos: readonly string[]; emEntrega: boolean }): Promise<SituacaoPresencaSegundoPlano> {
  await gravarVinculos(condicoes.vinculos);
  const situacao = situacaoDaPresenca({ ...condicoes, permissaoSegundoPlano: await permissaoSegundoPlanoConcedida(), binarioSuporta: await binarioSuporta() });
  if (situacao !== "ativa") {
    await desligarTarefa();
    return situacao;
  }
  return (await ligarTarefa()) ? "ativa" : "somente_primeiro_plano";
}

/** Começou uma entrega: a localização passa a ser do rastreamento. Os vínculos ficam guardados. */
export async function pausarPresenca(): Promise<void> {
  await desligarTarefa();
}

/** Terminou a entrega: se ele continua aceitando entregas, a presença volta — mesmo sem a tela. */
export async function retomarPresenca(): Promise<void> {
  const situacao = situacaoDaPresenca({ vinculos: await lerVinculos(), emEntrega: false, permissaoSegundoPlano: await permissaoSegundoPlanoConcedida(), binarioSuporta: await binarioSuporta() });
  if (situacao === "ativa") await ligarTarefa();
}

/** Saiu da conta: nada mais é confirmado por este aparelho. */
export async function encerrarPresenca(): Promise<void> {
  await gravarVinculos([]);
  await desligarTarefa();
}
