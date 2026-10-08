import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { sair } from "@/features/autenticacao/lib/api-conta";
import { encerrarPresenca } from "@/features/entregas/lib/presenca-segundo-plano";
import { pararRastreamento } from "@/features/entregas/lib/rastreamento";
import { useContextoConta } from "../components/provedor-contexto-conta";

/** "Sair" do app: confirma, para o rastreamento (fora da conta não há operação), encerra a sessão e volta à entrada. */
export function useSairDaConta() {
  const { recarregar } = useContextoConta();
  const [saindo, setSaindo] = useState(false);

  const encerrar = useCallback(async () => {
    setSaindo(true);
    // Antes do rastreamento: fora da conta nada é confirmado por este aparelho (nem em segundo plano).
    await encerrarPresenca();
    await pararRastreamento();
    await sair();
    await recarregar();
    setSaindo(false);
  }, [recarregar]);

  const confirmar = useCallback(() => {
    Alert.alert("Sair da conta", "Você precisará entrar de novo para usar o Jaaa neste aparelho.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: () => void encerrar() },
    ]);
  }, [encerrar]);

  return { saindo, sair: confirmar };
}
