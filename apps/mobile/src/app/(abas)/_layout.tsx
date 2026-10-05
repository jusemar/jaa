import { NativeTabs } from "expo-router/unstable-native-tabs";

import { Cores } from "@/constants/theme";
import { useSomMensagens } from "@/features/conversas/hooks/use-som-mensagens";
import { useTotalNaoLidas } from "@/features/conversas/hooks/use-total-nao-lidas";
import { rotuloTotalNaoLidas } from "@/features/conversas/lib/nao-lidas-globais";
import { useIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";

/*
 * NAVEGAÇÃO INFERIOR — as áreas da Web para a identidade atuante (`components/navegacao/areas.ts`):
 * agindo como PESSOA, o Jaa é um mensageiro (Conversas, Contatos, Entregas, Perfil); agindo como EMPRESA
 * ficam Conversas e Perfil — Pedidos, Produtos e Logística da empresa continuam na Web.
 *
 * Não é filtro de permissão: a API autoriza cada chamada de qualquer forma.
 */
export default function LayoutAbas() {
  const { ativa } = useIdentidadeAtiva();
  const ehEmpresa = ativa?.tipo === "empresarial";
  // Não lidas da identidade ATUANTE: indicador no item Conversas, visível em qualquer área.
  const naoLidas = useTotalNaoLidas(ativa?.identidadeId ?? null);
  // Som de mensagem recebida em qualquer área (este layout continua montado com a conversa aberta).
  useSomMensagens(ativa?.identidadeId ?? null);

  return (
    <NativeTabs
      backgroundColor={Cores.superficie}
      indicatorColor={Cores.marcaSuave}
      tintColor={Cores.marca}
      iconColor={{ default: Cores.conteudoSuave, selected: Cores.marca }}
      labelStyle={{ default: { color: Cores.conteudoSuave }, selected: { color: Cores.marca } }}
      badgeBackgroundColor={Cores.perigo}
      // Rótulo em TODAS as áreas, como na Web — não só na selecionada.
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Conversas</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bubble.left.fill" md="chat" />
        {naoLidas > 0 && <NativeTabs.Trigger.Badge>{rotuloTotalNaoLidas(naoLidas)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="contatos" hidden={ehEmpresa}>
        <NativeTabs.Trigger.Label>Contatos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2.fill" md="group" />
      </NativeTabs.Trigger>

      {/* Área operacional do entregador (saída em andamento + localização): só da identidade pessoal. */}
      <NativeTabs.Trigger name="entrega" hidden={ehEmpresa}>
        <NativeTabs.Trigger.Label>Entregas</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="shippingbox.fill" md="local_shipping" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="perfil">
        <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.fill" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
