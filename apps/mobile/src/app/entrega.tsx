import { SafeAreaView } from "react-native-safe-area-context";

import { TelaEntrega } from "@/features/entregas/components/tela-entrega";

/**
 * Aba do ENTREGADOR: a saída em andamento e o estado da localização. É a única área operacional do
 * Mobile nesta etapa — administração da empresa continua no Web.
 */
export default function EntregaScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <TelaEntrega />
    </SafeAreaView>
  );
}
