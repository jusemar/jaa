import { destinoDoLink, segmentarMensagem } from "../lib/links-mensagem";

/**
 * Texto de mensagem com os endereços http/https clicáveis. Cada trecho é um nó de texto do React
 * (sempre escapado): a mensagem nunca é interpretada como HTML.
 *
 * - Link do Jaa deste site (`/@usuario`): abre a conversa aqui mesmo, quando `aoAbrirConversa` existe;
 * - outro endereço deste site: mesma aba;
 * - outro site: nova aba, sem acesso a esta página e sem informar de onde veio.
 *
 * `[overflow-wrap:anywhere]` no link: endereço longo quebra dentro do balão, nunca o estoura.
 */
export function TextoComLinks({
  texto,
  origemDoSite = typeof window === "undefined" ? null : window.location.origin,
  aoAbrirConversa,
}: {
  texto: string;
  // Origem deste site, para reconhecer links internos. Sem ela (render no servidor), todo link é externo.
  origemDoSite?: string | null;
  aoAbrirConversa?: ((nomeUsuario: string) => void) | undefined;
}) {
  return (
    <>
      {segmentarMensagem(texto).map((trecho, indice) => {
        if (trecho.tipo === "texto") return trecho.texto;
        const destino = destinoDoLink(trecho.url, origemDoSite);
        const externo = destino.tipo === "externo";
        return (
          <a
            key={indice}
            href={trecho.url}
            data-link-mensagem={destino.tipo}
            {...(externo ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
            onClick={(evento) => {
              // O clique é do link: não pode acionar seleção/ações do balão em volta.
              evento.stopPropagation();
              if (destino.tipo !== "conversa" || !aoAbrirConversa) return;
              // Ctrl/⌘/Shift/botão do meio: a pessoa pediu nova aba — o navegador decide.
              if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) return;
              evento.preventDefault();
              aoAbrirConversa(destino.nomeUsuario);
            }}
            className="font-medium underline decoration-1 underline-offset-2 [overflow-wrap:anywhere] hover:opacity-80"
          >
            {trecho.texto}
          </a>
        );
      })}
    </>
  );
}
