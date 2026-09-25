import type { ReactNode, SVGProps } from "react";

/*
 * ÍCONES DO JAA — um único conjunto, desenhado com as mesmas regras (seção 17 do CLAUDE.md), em vez
 * de SVGs soltos com traços e tamanhos diferentes espalhados pelos componentes:
 *
 * - grade de 24×24 e traço 2, o mesmo peso visual da referência de UI/UX aprovada;
 * - `currentColor`: a cor vem do texto ao redor, então os tokens continuam mandando;
 * - `aria-hidden` por padrão: ícone é decoração. Quem precisa de significado põe texto ao lado ou
 *   `aria-label` no botão — nunca um ícone sozinho carregando a informação.
 *
 * Sem biblioteca de ícones: o conjunto usado é pequeno e previsível, e uma dependência a mais para
 * duas dezenas de desenhos não se justifica (seção 27).
 */

type PropsIcone = Omit<SVGProps<SVGSVGElement>, "children" | "viewBox"> & { titulo?: string };

function Icone({ titulo, className = "h-4 w-4", children, ...resto }: PropsIcone & { children: ReactNode }) {
  return (
    <svg
      {...resto}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(titulo ? { role: "img" } : { "aria-hidden": true })}
    >
      {titulo && <title>{titulo}</title>}
      {children}
    </svg>
  );
}

export const IconeBusca = (props: PropsIcone) => (
  <Icone {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icone>
);

export const IconeConversa = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.9-.9L3 20.5l1.5-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
  </Icone>
);

export const IconeSacola = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M6 8h12l-1 12H7L6 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </Icone>
);

export const IconeCesta = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M3 9h18l-1.8 10.2A2 2 0 0 1 17.2 21H6.8a2 2 0 0 1-2-1.8L3 9Z" />
    <path d="m8 9 3-6M16 9l-3-6M9.5 13.5v3M14.5 13.5v3" />
  </Icone>
);

export const IconeLoja = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M4 4h16l1.2 4.6A3 3 0 0 1 18.3 12 3 3 0 0 1 12 11a3 3 0 0 1-6.3 1 3 3 0 0 1-2.9-3.4L4 4Z" />
    <path d="M5 12v8h14v-8M10 20v-5h4v5" />
  </Icone>
);

export const IconePedidos = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
    <path d="M9.5 8h5M9.5 12h5" />
  </Icone>
);

export const IconeCaixa = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="m12 3 8 4v10l-8 4-8-4V7l8-4Z" />
    <path d="m4 7 8 4 8-4M12 11v10" />
  </Icone>
);

export const IconeMapa = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="m9 4-6 3v13l6-3 6 3 6-3V4l-6 3-6-3Z" />
    <path d="M9 4v13M15 7v13" />
  </Icone>
);

export const IconeEntrega = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M3 16V7h10v9M13 10h4l3 3.5V16" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Icone>
);

export const IconePessoas = (props: PropsIcone) => (
  <Icone {...props}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 20a6.5 6.5 0 0 0-2.2-4.9" />
  </Icone>
);

export const IconePerfil = (props: PropsIcone) => (
  <Icone {...props}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="10" r="3.2" />
    <path d="M6.2 19a6.2 6.2 0 0 1 11.6 0" />
  </Icone>
);

export const IconeMais = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icone>
);

export const IconeMenos = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M5 12h14" />
  </Icone>
);

export const IconeLixeira = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M4 7h16M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10.5 11v5M13.5 11v5" />
  </Icone>
);

export const IconeImagem = (props: PropsIcone) => (
  <Icone {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="m4 17 4.5-4.2a2 2 0 0 1 2.7 0L16 17M15 13.6l1.3-1.1a2 2 0 0 1 2.6 0L21 14.2" />
  </Icone>
);

export const IconeVideo = (props: PropsIcone) => (
  <Icone {...props}>
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="m15.5 11.5 5-3v7l-5-3z" />
  </Icone>
);

export const IconeMicrofone = (props: PropsIcone) => (
  <Icone {...props}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
  </Icone>
);

export const IconeAnexo = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M20 11.5 12.2 19a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3 3 0 0 1 4.3 4.3l-7.6 7.6a1.5 1.5 0 0 1-2.1-2.1l7-7" />
  </Icone>
);

export const IconeEnviar = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8 21 3Z" />
  </Icone>
);

export const IconeCheck = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icone>
);

export const IconeCheckDuplo = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="m2 12.5 4 4L14 8M10.5 15.5l1.5 1.5L22 7" />
  </Icone>
);

export const IconeSeta = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Icone>
);

export const IconeVoltar = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M20 12H5M11 6l-6 6 6 6" />
  </Icone>
);

export const IconeFechar = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icone>
);

export const IconeSetaBaixo = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icone>
);

export const IconeMenu = (props: PropsIcone) => (
  <Icone {...props}>
    <circle cx="12" cy="5" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="12" cy="19" r="1.2" />
  </Icone>
);

export const IconeLocal = (props: PropsIcone) => (
  <Icone {...props}>
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </Icone>
);

export const IconeRelogio = (props: PropsIcone) => (
  <Icone {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 2" />
  </Icone>
);

export const IconeDinheiro = (props: PropsIcone) => (
  <Icone {...props}>
    <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 12h.01M18 12h.01" />
  </Icone>
);

export const IconeCartao = (props: PropsIcone) => (
  <Icone {...props}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
    <path d="M2.5 10h19M6.5 14.5h3.5" />
  </Icone>
);
