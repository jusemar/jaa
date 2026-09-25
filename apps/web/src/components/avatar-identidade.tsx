import { iniciaisDoNome, type ParticipanteConversa } from "@jaa/contratos";

/**
 * AVATAR de qualquer identidade — pessoa ou empresa — com a mesma regra em todo o Jaa:
 * foto quando existir, iniciais do nome quando não ("Junior Rocha" → JR) e, sem nome utilizável,
 * um símbolo neutro. Uma implementação só: conversas, busca, contatos, perfil, entregadores.
 *
 * Os tons vêm da referência de UI/UX aprovada: uma paleta CALMA (jade, escuro, neutro) em vez de
 * cores berrantes, porque o avatar acompanha cada linha da lista e não pode competir com o conteúdo.
 * EMPRESA sempre em ouro — é o mesmo código de cor usado no selo "Empresa" e no card de pedido, então
 * a pessoa reconhece "isto é comercial" antes mesmo de ler.
 */

/*
 * Três tons, como na referência de UI/UX aprovada: marca, conteúdo (escuro) e realce. A escolha é
 * estável por identidade (mesma pessoa, mesma cor sempre) em vez de depender da posição na lista.
 */
const TONS_PESSOA = ["bg-marca text-marca-conteudo", "bg-conteudo text-fundo", "bg-realce text-conteudo"] as const;

const TOM_EMPRESA = "bg-[color-mix(in_oklab,var(--cor-ouro)_35%,var(--cor-superficie))] text-conteudo";

const TAMANHOS = {
  pequeno: "h-8 w-8 text-[10px]",
  medio: "h-11 w-11 text-xs",
  grande: "h-16 w-16 text-lg",
} as const;

export type TamanhoAvatar = keyof typeof TAMANHOS;

function tomDe(identificador: string): string {
  let soma = 0;
  for (const caractere of identificador) soma = (soma + caractere.charCodeAt(0)) % 997;
  return TONS_PESSOA[soma % TONS_PESSOA.length] as string;
}

export function AvatarIdentidade({
  identidade,
  fotoUrl,
  tamanho = "medio",
}: {
  identidade: Pick<ParticipanteConversa, "identidadeId" | "nomeExibicao" | "tipo">;
  fotoUrl?: string | null;
  tamanho?: TamanhoAvatar;
}) {
  const classes = `${TAMANHOS[tamanho]} shrink-0 overflow-hidden rounded-full`;

  if (fotoUrl) {
    /*
     * <img> puro de propósito: a foto vem do armazenamento de arquivos do Jaa (URL externa), e o
     * otimizador do Next não agrega aqui — é uma miniatura pequena e já dimensionada.
     * alt vazio: o nome aparece ao lado, e leitores de tela não devem repeti-lo.
     */
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fotoUrl} alt="" className={`${classes} object-cover`} />;
  }

  const tom = identidade.tipo === "empresarial" ? TOM_EMPRESA : tomDe(identidade.identidadeId);
  return (
    <span aria-hidden data-avatar={identidade.tipo} className={`${classes} ${tom} grid place-items-center font-bold`}>
      {iniciaisDoNome(identidade.nomeExibicao)}
    </span>
  );
}
