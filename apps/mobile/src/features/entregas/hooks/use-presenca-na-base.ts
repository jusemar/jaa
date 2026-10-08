import type { SituacaoOperacional } from "@jaa/contratos";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppVisivel } from "@/lib/use-app-visivel";
import { enviarLocalizacaoDaBase } from "../lib/api-entregas";
import { leituraDaPosicao, vinculosAceitando, type SituacaoPresencaSegundoPlano } from "../lib/presenca-base";
import { pedirPermissaoSegundoPlano, sincronizarPresencaSegundoPlano } from "../lib/presenca-segundo-plano";

/*
 * PRESENÇA NA BASE pelo app.
 *
 * O aparelho informa só o que MEDIU (coordenada, precisão e horário); quem decide se ele está na base
 * é o servidor. A leitura serve só para presença e não é guardada. Dois caminhos, uma regra:
 * - com o app ABERTO, uma leitura a cada 30 s (resposta rápida ao chegar na base);
 * - com a tela bloqueada ou o app em segundo plano, a tarefa de `presenca-segundo-plano.ts` continua
 *   confirmando — é o que mantém o lugar na fila sem a pessoa precisar ficar olhando o Jaaa.
 * Os dois só existem enquanto ele ACEITA entregas de alguma empresa; durante uma entrega, a tarefa de
 * segundo plano fica desligada (a localização é do rastreamento da saída).
 */
const INTERVALO_ENVIO_MS = 30_000;

export type PermissaoLocalizacao = "ausente" | "ativa" | "negada" | "indisponivel";

export function usePresencaNaBase(situacoes: SituacaoOperacional[], aoReceberSituacao: (situacao: SituacaoOperacional) => void, emEntrega = false) {
  const [permissao, setPermissao] = useState<PermissaoLocalizacao>("ausente");
  const [segundoPlano, setSegundoPlano] = useState<SituacaoPresencaSegundoPlano>("parada");
  const visivel = useAppVisivel();
  const aoReceberRef = useRef(aoReceberSituacao);
  useEffect(() => {
    aoReceberRef.current = aoReceberSituacao;
  }, [aoReceberSituacao]);

  // Só envia por quem está ACEITANDO entregas agora; como texto, o efeito não reinicia à toa.
  const idsAceitando = vinculosAceitando(situacoes).join(",");
  const idsRef = useRef(idsAceitando);
  useEffect(() => {
    idsRef.current = idsAceitando;
  }, [idsAceitando]);

  // `pedir`: só o toque em "Ativar" abre o pedido do sistema; o envio periódico não insiste.
  const enviarAgora = useCallback(async (pedir: boolean) => {
    const ids = idsRef.current === "" ? [] : idsRef.current.split(",");
    if (ids.length === 0) return;
    try {
      let concedida = (await Location.getForegroundPermissionsAsync()).granted;
      if (!concedida && pedir) concedida = (await Location.requestForegroundPermissionsAsync()).granted;
      if (!concedida) {
        setPermissao((atual) => (pedir || atual === "negada" ? "negada" : "ausente"));
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        setPermissao("indisponivel");
        return;
      }
      const posicao = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPermissao("ativa");
      const leitura = leituraDaPosicao(posicao);
      for (const entregadorId of ids) {
        void enviarLocalizacaoDaBase(entregadorId, leitura).then((resultado) => {
          if (resultado.ok) aoReceberRef.current(resultado.dados);
        });
      }
    } catch {
      // Sem leitura agora (GPS sem sinal, tempo esgotado): a próxima rodada tenta de novo.
    }
  }, []);

  useEffect(() => {
    if (idsAceitando === "" || !visivel || permissao === "negada") return;
    const temporizador = setInterval(() => void enviarAgora(false), INTERVALO_ENVIO_MS);
    // Primeira leitura logo em seguida: chegar na base não deve esperar o intervalo inteiro.
    const primeira = setTimeout(() => void enviarAgora(false), 0);
    return () => {
      clearInterval(temporizador);
      clearTimeout(primeira);
    };
  }, [idsAceitando, visivel, permissao, enviarAgora]);

  /*
   * SEGUNDO PLANO: a tarefa acompanha quem está aceitando entregas e se há entrega em andamento. Liga
   * sozinha quando a permissão "o tempo todo" já existe; desliga quando ninguém mais aceita ou quando
   * a entrega começa. Voltar ao primeiro plano reconfere (a pessoa pode ter mudado a permissão).
   */
  useEffect(() => {
    let ativo = true;
    void sincronizarPresencaSegundoPlano({ vinculos: idsAceitando === "" ? [] : idsAceitando.split(","), emEntrega }).then((situacao) => {
      if (ativo) setSegundoPlano(situacao);
    });
    return () => {
      ativo = false;
    };
  }, [idsAceitando, emEntrega, visivel]);

  /** Toque em "Ativar": localização com o app aberto e, em seguida, "o tempo todo" para a tela bloqueada. */
  const permitir = useCallback(async () => {
    await enviarAgora(true);
    if (!(await Location.getForegroundPermissionsAsync().catch(() => null))?.granted) return;
    await pedirPermissaoSegundoPlano();
    setSegundoPlano(await sincronizarPresencaSegundoPlano({ vinculos: idsRef.current === "" ? [] : idsRef.current.split(","), emEntrega }));
  }, [enviarAgora, emEntrega]);

  return { permissao, segundoPlano, permitir: useCallback(() => void permitir(), [permitir]), aceitando: idsAceitando !== "" };
}
