import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { sair } from "@/features/autenticacao/lib/api-conta";
import { pararRastreamento } from "@/features/entregas/lib/rastreamento";
import { useContextoConta } from "../components/provedor-contexto-conta";

/** "Sair" do app: confirma, para o rastreamento (fora da conta não há operação), encerra a sessão e volta à entrada. */
export function useSairDaConta() {
  const { recarregar } = useContextoConta();
  const [saindo, setSaindo] = useState(false);

  const encerrar = useCallback(async () => {
    setSaindo(true);
    await pararRastreamento();
    await sair();
    await recarregar();
    setSaindo(false);
  }, [recarregar]);

  const confirmar = useCallback(() => {
    Alert.alert("Sair da conta", "Você precisará entrar de novo para usar o Jaa neste aparelho.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => void encerrar() },
    ]);
  }, [encerrar]);

  return { saindo, sair: confirmar };
}
