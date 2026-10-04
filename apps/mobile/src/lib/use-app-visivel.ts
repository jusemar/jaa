import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** App em primeiro plano — o equivalente do `document.visibilityState === "visible"` da Web. */
export function useAppVisivel(): boolean {
  const [visivel, setVisivel] = useState(AppState.currentState === "active");
  useEffect(() => {
    const assinatura = AppState.addEventListener("change", (estado) => setVisivel(estado === "active"));
    return () => assinatura.remove();
  }, []);
  return visivel;
}
