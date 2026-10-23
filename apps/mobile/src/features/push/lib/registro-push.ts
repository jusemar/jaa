import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { Cores } from "@/constants/theme";
import { requisitarApi } from "@/lib/api";
import { gerarIdCliente } from "@/lib/id-cliente";
import { apresentacaoEmPrimeiroPlano, canalAndroidDeMensagens, type SituacaoPermissao } from "./regras-push";

/*
 * PUSH no aparelho: canal, permissão e o registro DESTA instalação na conta da sessão. Nenhuma regra de
 * quem recebe o quê mora aqui — o servidor decide; o app só diz "este aparelho, este token".
 * O token nunca vai para log.
 */

const CHAVE_INSTALACAO = "jaa.push.instalacao";
const sem = { parse: () => undefined };

/*
 * Id ESTÁVEL desta instalação (some ao desinstalar). UUID local, sem nenhum identificador do aparelho;
 * não depende da conta (trocar de conta no aparelho transfere a mesma instalação). Não é segredo nem dá
 * acesso a nada: só diz ao servidor qual linha atualizar — e remover exige a sessão da conta dona. O
 * gerador é o mesmo do `idCliente` (o React Native não tem `crypto.randomUUID`).
 */
async function instalacaoId(): Promise<string> {
  const guardado = await SecureStore.getItemAsync(CHAVE_INSTALACAO);
  if (guardado) return guardado;
  const novo = gerarIdCliente();
  await SecureStore.setItemAsync(CHAVE_INSTALACAO, novo);
  return novo;
}

// Com o app aberto, o realtime já avisou: o push não vira banner nem som (ver `apresentacaoEmPrimeiroPlano`).
Notifications.setNotificationHandler({ handleNotification: async () => apresentacaoEmPrimeiroPlano() });

/**
 * Canal "Mensagens" do Android, com importância ALTA (aparece no topo, com som padrão), criado ANTES de
 * pedir a permissão: no Android 13+ o diálogo só aparece quando o app já tem um canal.
 */
export async function prepararCanal(): Promise<void> {
  if (Platform.OS !== "android") return;
  const { id, ...canal } = canalAndroidDeMensagens();
  await Notifications.setNotificationChannelAsync(id, {
    ...canal,
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: Cores.marca,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

export async function lerPermissao(): Promise<SituacaoPermissao> {
  const atual = await Notifications.getPermissionsAsync();
  return { status: atual.status, podePerguntar: atual.canAskAgain };
}

export async function pedirPermissao(): Promise<SituacaoPermissao> {
  const resposta = await Notifications.requestPermissionsAsync();
  return { status: resposta.status, podePerguntar: resposta.canAskAgain };
}

/**
 * Registra (ou atualiza) este aparelho na conta da sessão — só com a permissão já concedida. Chamado ao
 * entrar, ao voltar para o app e quando o sistema renova o token. Falhar não atrapalha nada: o app
 * continua com o realtime; tenta de novo na próxima vez.
 *
 * Sem Firebase no binário, o token não existe: devolve false e segue sem push.
 */
export async function registrarEsteAparelho(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    if ((await Notifications.getPermissionsAsync()).status !== "granted") return false;
    const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
    if (typeof projectId !== "string") return false;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const resposta = await requisitarApi("/dispositivos-push", sem, {
      method: "PUT",
      body: JSON.stringify({ instalacaoId: await instalacaoId(), token, plataforma: "android" }),
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

/**
 * Logout: tira este aparelho da conta ANTES de encerrar a sessão (depois dela, a API já não saberia de
 * quem é). Tempo curto e qualquer falha só é registrada — sair nunca fica preso nisto. Se não deu (sem
 * rede), o servidor ainda corta pela sessão: apagada no sign-out, o aparelho deixa de receber.
 */
export async function removerEsteAparelho(): Promise<void> {
  try {
    const guardado = await SecureStore.getItemAsync(CHAVE_INSTALACAO);
    if (!guardado) return;
    const resultado = await Promise.race([
      requisitarApi(`/dispositivos-push/${encodeURIComponent(guardado)}`, sem, { method: "DELETE" }),
      new Promise<null>((pronto) => setTimeout(() => pronto(null), 3000)),
    ]);
    if (!resultado?.ok) console.warn("Push: não foi possível tirar este aparelho da conta antes de sair (o servidor corta pela sessão).");
  } catch {
    console.warn("Push: falha ao tirar este aparelho da conta antes de sair (o servidor corta pela sessão).");
  }
}
