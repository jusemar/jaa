import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { Cores } from "@/constants/theme";
import { requisitarApi } from "@/lib/api";
import { gerarIdCliente } from "@/lib/id-cliente";
import { criarRegistradorPush, removerInstalacaoDaConta, type RegistradorPush } from "./registrador-push";
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
 * Registrador DESTA conta na sessão (`registrador-push.ts`: sem loop, sem PUT repetido, um por vez).
 * Sem Firebase no binário ou sem `projectId`, pedir o token falha: o registro devolve false e o app
 * segue sem push.
 */
export function criarRegistradorDoAparelho(contaId: string): RegistradorPush {
  return criarRegistradorPush(contaId, {
    tokenDoAparelho: async () => {
      const { data } = await Notifications.getDevicePushTokenAsync();
      if (typeof data !== "string") throw new Error("Token do aparelho em formato inesperado.");
      return data;
    },
    tokenExpo: async (tokenDoAparelho) => {
      const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
      if (typeof projectId !== "string") throw new Error("Projeto EAS ausente na configuração.");
      // Com `devicePushToken`, a biblioteca NÃO pede outro token ao sistema (que dispararia outro evento).
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken: { type: "android", data: tokenDoAparelho } });
      return data;
    },
    instalacaoId,
    enviar: async ({ instalacaoId: id, token }) => {
      const resposta = await requisitarApi("/dispositivos-push", sem, { method: "PUT", body: JSON.stringify({ instalacaoId: id, token, plataforma: "android" }) });
      return resposta.ok;
    },
  });
}

/**
 * Registra (ou atualiza) este aparelho na conta da sessão — só no Android e com a permissão já
 * concedida. `tokenDoEvento` = o token que o evento "token novo" trouxe (usado direto). O token nunca
 * vai para log.
 */
export async function registrarEsteAparelho(registrador: RegistradorPush, tokenDoEvento?: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const permissao = await Notifications.getPermissionsAsync().catch(() => null);
  if (permissao?.status !== "granted") return false;
  return registrador.registrar(tokenDoEvento);
}

/**
 * Logout: tira este aparelho da conta ANTES de encerrar a sessão (depois dela, a API já não saberia de
 * quem é). Tempo curto e qualquer falha só é registrada — sair nunca fica preso nisto. Se não deu (sem
 * rede), o servidor ainda corta pela sessão: apagada no sign-out, o aparelho deixa de receber.
 */
export function removerEsteAparelho(): Promise<void> {
  return removerInstalacaoDaConta({
    instalacaoGuardada: () => SecureStore.getItemAsync(CHAVE_INSTALACAO),
    apagar: async (id) => (await requisitarApi(`/dispositivos-push/${encodeURIComponent(id)}`, sem, { method: "DELETE" })).ok,
    avisar: (texto) => console.warn(texto),
  });
}
