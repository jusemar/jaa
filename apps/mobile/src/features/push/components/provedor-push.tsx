import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Linking } from "react-native";
import { listarConversas } from "@/features/conversas/lib/api-conversas";
import { rotaDaConversa } from "@/features/conversas/lib/abrir-conversa";
import { useIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";
import { criarRegistradorDoAparelho, lerPermissao, pedirPermissao, prepararCanal, registrarEsteAparelho } from "../lib/registro-push";
import { destinoDoToque, ofertaDeAvisos, type OfertaDeAvisos, type SituacaoPermissao } from "../lib/regras-push";

/*
 * PUSH na sessão: registra o aparelho (quando a pessoa já permitiu), oferece a permissão sem insistir e
 * abre a conversa que o toque pede — trocando antes para a identidade certa (ex.: a empresa), sempre
 * confirmada pelo servidor. Montado dentro da identidade ativa: só existe com sessão de conta completa
 * (sem sessão, a entrada aparece primeiro e o toque guardado é atendido depois de entrar).
 */
interface ValorPush {
  permissao: SituacaoPermissao | null;
  // O que o cartão "Ativar avisos no celular" deve oferecer agora.
  oferta: OfertaDeAvisos;
  ativar: () => Promise<void>;
  abrirConfiguracoes: () => void;
  dispensar: () => void;
}

const ContextoPush = createContext<ValorPush | null>(null);
const CHAVE_DISPENSADO = "jaa.push.oferta-dispensada";

export function ProvedorPush({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { operaveis, pessoal, ativa, selecionar } = useIdentidadeAtiva();
  const [permissao, setPermissao] = useState<SituacaoPermissao | null>(null);
  const [dispensado, setDispensado] = useState(true);
  // Toque que chegou antes de as identidades estarem prontas: espera por elas.
  const toquePendente = useRef<unknown>(null);
  // App FECHADO aberto pelo toque: a resposta fica guardada pelo sistema até ser lida.
  const [toqueInicial] = useState(lerToqueInicial);
  // Cada notificação abre uma vez só (o ouvinte e a resposta guardada podem trazer o mesmo toque).
  const tratados = useRef(new Set<string>());

  /*
   * Um registrador por CONTA (a pessoal identifica a conta, como no cofre do aparelho): registra uma
   * vez por sessão, não repete PUT com o mesmo token e nunca roda dois ao mesmo tempo. Sem a conta
   * carregada ainda, nada é registrado.
   */
  const contaId = pessoal?.identidadeId ?? null;
  const registrador = useMemo(() => (contaId ? criarRegistradorDoAparelho(contaId) : null), [contaId]);
  const registrar = useCallback(async (tokenDoEvento?: string) => {
    if (registrador) await registrarEsteAparelho(registrador, tokenDoEvento);
  }, [registrador]);

  const atualizar = useCallback(async () => {
    const atual = await lerPermissao().catch(() => null);
    setPermissao(atual);
    if (atual?.status === "granted") await registrar();
  }, [registrar]);

  // Canal primeiro (o Android 13+ exige um para perguntar) e a escolha de "Agora não".
  useEffect(() => {
    void (async () => {
      await prepararCanal().catch(() => undefined);
      setDispensado((await SecureStore.getItemAsync(CHAVE_DISPENSADO).catch(() => null)) === "1");
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      await atualizar();
    })();
    /*
     * Token novo (renovado pelo sistema — e TAMBÉM a cada pedido de token do próprio app): usa o token
     * do evento, nunca pede outro (pedir dispararia outro evento: foi o loop do versionCode 3).
     */
    const token = Notifications.addPushTokenListener(({ data }) => {
      if (typeof data === "string") void registrar(data);
    });
    // Voltou das configurações (ou de outro app): a permissão pode ter mudado.
    const estado = AppState.addEventListener("change", (situacao) => {
      if (situacao === "active") void atualizar();
    });
    return () => {
      token.remove();
      estado.remove();
    };
  }, [atualizar, registrar]);

  const abrir = useCallback(
    async (bruto: unknown) => {
      const destino = destinoDoToque(bruto, operaveis, ativa?.identidadeId ?? null);
      if (destino.tipo === "ignorar") return;
      // Outra identidade (ex.: a empresa, agindo como pessoa): o servidor confirma ANTES de navegar.
      if (destino.trocarIdentidade && !(await selecionar(destino.dados.identidadeId))) return;
      /*
       * A tela da conversa precisa dos dados públicos de quem está do outro lado (o push não os leva).
       * A conversa que acabou de receber a mensagem está no topo da lista desta identidade; se não estiver
       * (conversa ocultada, lista mudou), abre a lista de Conversas.
       */
      const lista = await listarConversas();
      const item = lista.ok ? lista.dados.conversas.find((conversa) => conversa.id === destino.dados.conversaId) : undefined;
      if (item) router.push(rotaDaConversa(item.id, item.outraIdentidade));
      else router.navigate("/");
    },
    [operaveis, ativa, selecionar, router],
  );

  const tratarToque = useCallback(
    (resposta: Notifications.NotificationResponse) => {
      const toque = dadosDoToque(resposta, tratados.current);
      if (!toque) return;
      if (ativa) void abrir(toque);
      else toquePendente.current = toque;
    },
    [ativa, abrir],
  );

  // Toque com o app aberto ou em segundo plano.
  useEffect(() => {
    const assinatura = Notifications.addNotificationResponseReceivedListener(tratarToque);
    return () => assinatura.remove();
  }, [tratarToque]);

  // Com as identidades prontas: o toque que abriu o app ou o que chegou antes delas.
  useEffect(() => {
    if (!ativa) return;
    const dados = toquePendente.current ?? (toqueInicial ? dadosDoToque(toqueInicial, tratados.current) : null);
    toquePendente.current = null;
    if (dados !== null) void abrir(dados);
  }, [ativa, abrir, toqueInicial]);

  const ativar = useCallback(async () => {
    const resposta = await pedirPermissao().catch(() => null);
    setPermissao(resposta);
    if (resposta?.status === "granted") await registrar();
  }, [registrar]);

  const dispensar = useCallback(() => {
    setDispensado(true);
    void SecureStore.setItemAsync(CHAVE_DISPENSADO, "1").catch(() => undefined);
  }, []);

  const valor = useMemo<ValorPush>(
    () => ({ permissao, oferta: ofertaDeAvisos(permissao, dispensado), ativar, abrirConfiguracoes: () => void Linking.openSettings(), dispensar }),
    [permissao, dispensado, ativar, dispensar],
  );

  return <ContextoPush.Provider value={valor}>{children}</ContextoPush.Provider>;
}

export function usePush(): ValorPush {
  const valor = useContext(ContextoPush);
  if (!valor) throw new Error("usePush precisa estar dentro de <ProvedorPush>.");
  return valor;
}

function lerToqueInicial(): Notifications.NotificationResponse | null {
  return Notifications.getLastNotificationResponse();
}

// O `data` de um toque na PRÓPRIA notificação (não em ações extras), uma vez por notificação.
function dadosDoToque(resposta: Notifications.NotificationResponse, tratados: Set<string>): unknown {
  if (resposta.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const id = resposta.notification.request.identifier;
  if (tratados.has(id)) return null;
  tratados.add(id);
  Notifications.clearLastNotificationResponse();
  const dados: unknown = resposta.notification.request.content.data;
  return dados ?? null;
}
