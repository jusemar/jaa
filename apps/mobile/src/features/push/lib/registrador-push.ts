/*
 * REGISTRO DESTE APARELHO NA API, sem loop e sem repetição. Regra pura (o Android entra pelas
 * dependências), testada em `registrador-push.test.ts`.
 *
 * Por que existe: no Android, pedir o token ao sistema também dispara o evento "token novo"
 * (`expo-notifications`, `PushTokenModule.kt`). Se o ouvinte desse evento pedisse o token de novo, cada
 * pedido gerava outro evento — no APK 0.7.0 (versionCode 3) isso virou milhares de PUT por minuto e
 * prendeu as demais chamadas do app. Daí as três regras:
 * 1. o evento traz o token: ele é usado DIRETO, sem pedir outro ao sistema;
 * 2. a API só é chamada quando conta, instalação ou token mudaram desde o último registro aceito;
 * 3. um registro por vez: o que chega durante outro espera a vez e é conferido de novo pela regra 2.
 */

export interface DependenciasRegistradorPush {
  // Token nativo (FCM) pedido ao sistema — SÓ quando não veio de um evento.
  tokenDoAparelho: () => Promise<string>;
  // Token Expo a partir do nativo já conhecido (não pede nada ao sistema).
  tokenExpo: (tokenDoAparelho: string) => Promise<string>;
  instalacaoId: () => Promise<string>;
  // PUT /dispositivos-push; true = aceito.
  enviar: (registro: { instalacaoId: string; token: string }) => Promise<boolean>;
}

export interface RegistradorPush {
  // Sem token = pedir ao sistema (entrada, volta ao app, permissão concedida); com token = evento.
  registrar: (tokenDoEvento?: string) => Promise<boolean>;
}

/**
 * Um registrador por CONTA na sessão: a conta faz parte da chave, e uma sessão nova (entrar de novo,
 * trocar de conta) cria outro registrador — então registra uma vez e reassocia a instalação no servidor.
 */
export function criarRegistradorPush(contaId: string, dependencias: DependenciasRegistradorPush): RegistradorPush {
  let registrado: string | null = null;
  let emAndamento: Promise<boolean> | null = null;
  // Token de evento que chegou durante um registro: conferido logo depois (só o mais recente importa).
  let pendente: string | undefined;

  async function executar(tokenDoEvento: string | undefined): Promise<boolean> {
    try {
      const tokenDoAparelho = tokenDoEvento ?? (await dependencias.tokenDoAparelho());
      const instalacaoId = await dependencias.instalacaoId();
      const chave = `${contaId}|${instalacaoId}|${tokenDoAparelho}`;
      if (chave === registrado) return true;
      const aceito = await dependencias.enviar({ instalacaoId, token: await dependencias.tokenExpo(tokenDoAparelho) });
      if (aceito) registrado = chave;
      return aceito;
    } catch {
      // Sem token, sem rede: o app segue com o realtime; a próxima entrada/volta tenta de novo.
      return false;
    }
  }

  // Só a primeira volta pode pedir o token ao sistema; as seguintes usam tokens de evento — então o
  // ciclo termina (cada pedido ao sistema gera no máximo um evento).
  async function ciclo(primeiro: string | undefined): Promise<boolean> {
    let resultado = await executar(primeiro);
    while (pendente !== undefined) {
      const proximo = pendente;
      pendente = undefined;
      resultado = await executar(proximo);
    }
    return resultado;
  }

  return {
    registrar(tokenDoEvento) {
      if (emAndamento) {
        if (tokenDoEvento !== undefined) pendente = tokenDoEvento;
        return emAndamento;
      }
      const atual = ciclo(tokenDoEvento).finally(() => {
        emAndamento = null;
      });
      emAndamento = atual;
      return atual;
    },
  };
}

/**
 * Logout: tira a instalação da conta antes do sign-out, com tempo curto. Nunca lança: sair não pode
 * ficar preso nisto (o servidor ainda corta pela sessão, apagada no sign-out).
 */
export async function removerInstalacaoDaConta(dependencias: {
  instalacaoGuardada: () => Promise<string | null>;
  apagar: (instalacaoId: string) => Promise<boolean>;
  avisar: (texto: string) => void;
  limiteMs?: number;
}): Promise<void> {
  try {
    const instalacaoId = await dependencias.instalacaoGuardada();
    if (!instalacaoId) return;
    const apagou = await Promise.race([dependencias.apagar(instalacaoId), new Promise<false>((pronto) => setTimeout(() => pronto(false), dependencias.limiteMs ?? 3000))]);
    if (!apagou) dependencias.avisar("Push: não foi possível tirar este aparelho da conta antes de sair (o servidor corta pela sessão).");
  } catch {
    dependencias.avisar("Push: falha ao tirar este aparelho da conta antes de sair (o servidor corta pela sessão).");
  }
}
