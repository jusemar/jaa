import { notFound } from "next/navigation";
import { IndicadorRealtime } from "@/components/indicador-realtime";
import { EntradaPeloLink } from "@/features/link/components/entrada-pelo-link";
import { nomeUsuarioDoSegmento } from "@/features/link/lib/link-do-jaa";

/*
 * LINK DO JAA: `/@usuario` abre a conversa com aquela identidade (e o cardápio, se for empresa com
 * cardápio). Sem conta, a pessoa vê o que é público e entra quando quiser conversar ou pedir.
 *
 * Só "@" + um @usuario válido chega aqui; qualquer outro endereço de primeiro nível é 404.
 */
export default async function PaginaDoLink({ params }: { params: Promise<{ identificador: string }> }) {
  const { identificador } = await params;
  const nomeUsuario = nomeUsuarioDoSegmento(identificador);
  if (!nomeUsuario) notFound();

  return (
    <>
      <IndicadorRealtime />
      <EntradaPeloLink nomeUsuario={nomeUsuario} />
    </>
  );
}
