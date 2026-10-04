import { IconeImagem } from "@/components/ui/icones";
import { espacoDaImagem } from "../lib/imagem-conversa";
import type { EstadoImagem } from "../lib/urls-imagens";

/*
 * IMAGEM dentro do balão. O espaço é RESERVADO pela proporção real (largura × altura vêm da API)
 * antes de a URL chegar e de a imagem carregar: a conversa não pula. A URL é privada e temporária —
 * vem do cache em memória, nunca da mensagem.
 */
export function ImagemMensagem({
  largura,
  altura,
  estado,
  descricao,
  aoAbrir,
  aoFalhar,
  aoCarregar,
}: {
  largura: number;
  altura: number;
  estado: EstadoImagem;
  descricao: string;
  aoAbrir?: (() => void) | undefined;
  aoFalhar?: (() => void) | undefined;
  aoCarregar?: (() => void) | undefined;
}) {
  const espaco = espacoDaImagem(largura, altura);
  const moldura = {
    width: espaco.largura,
    maxWidth: "100%",
    aspectRatio: `${espaco.largura} / ${espaco.altura}`,
  };

  if (estado.situacao !== "pronta") {
    const indisponivel = estado.situacao === "indisponivel";
    return (
      <div
        data-imagem-mensagem={estado.situacao}
        role={indisponivel ? "img" : "status"}
        aria-label={indisponivel ? "Imagem indisponível" : "Carregando imagem"}
        style={moldura}
        className={`grid place-items-center rounded-jaa-compacto bg-conteudo/10 text-conteudo-suave ${indisponivel ? "" : "animate-pulse"}`}
      >
        <span className="flex flex-col items-center gap-1 text-[11px]">
          <IconeImagem className="h-6 w-6" />
          {indisponivel && "Imagem indisponível"}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-imagem-mensagem="pronta"
      aria-label={`Ampliar ${descricao}`}
      onClick={aoAbrir}
      style={moldura}
      className="block overflow-hidden rounded-jaa-compacto bg-conteudo/10"
    >
      {/* <img> puro: URL assinada e temporária do armazenamento privado; o otimizador do Next não se aplica. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={estado.url} alt={descricao} width={espaco.largura} height={espaco.altura} onError={aoFalhar} onLoad={aoCarregar} className="h-full w-full object-cover" />
    </button>
  );
}
