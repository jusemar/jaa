import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/*
 * PRIMITIVOS DO JAA — o vocabulário visual da Web em um arquivo.
 *
 * São wrappers próprios (regra da seção 17 do CLAUDE.md), sem biblioteca de componentes: o conjunto
 * usado hoje é pequeno e previsível. Duas decisões atravessam todos eles:
 *
 * 1. MOBILE PRIMEIRO: alvos de toque com no mínimo 44px de altura, texto base de 16px nos campos
 *    (abaixo disso o iOS dá zoom sozinho ao focar) e nada com largura mínima maior que a tela.
 * 2. ACESSIBILIDADE não é enfeite: rótulo sempre associado ao campo, erro ligado por aria-describedby,
 *    estado comunicado por texto — nunca só por cor.
 */

/*
 * ALTURA: 44px no toque (mínimo confortável para o dedo) e 36px a partir de `sm`, que é a altura da
 * referência de UI/UX aprovada. Assim o desktop fica com a densidade do protótipo sem transformar o
 * celular em alvo pequeno demais.
 */
const ALTURA_TOQUE = "min-h-11 sm:min-h-9";

type Aparencia = "principal" | "secundario" | "realce" | "discreto" | "perigo";

const APARENCIAS: Record<Aparencia, string> = {
  principal: "bg-marca text-marca-conteudo shadow-suave hover:bg-marca/90",
  // Contorno: ação secundária que continua legível sobre qualquer superfície.
  secundario: "border border-borda bg-superficie text-conteudo shadow-suave hover:bg-realce",
  // Verde claro da marca: ação secundária DESTACADA, como "Ver cardápio" na referência.
  realce: "bg-marca-suave text-marca-suave-conteudo shadow-suave hover:bg-marca-suave/80",
  discreto: "text-conteudo-suave hover:bg-realce hover:text-conteudo",
  perigo: "border border-perigo/30 bg-superficie text-perigo hover:bg-perigo/5",
};

export function Botao({
  aparencia = "principal",
  larguraTotal = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { aparencia?: Aparencia; larguraTotal?: boolean }) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      // Cantos suaves (não pílula): é a forma dos botões na referência, e casa com os cards.
      className={`${ALTURA_TOQUE} inline-flex items-center justify-center gap-2 rounded-jaa-compacto px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${APARENCIAS[aparencia]} ${larguraTotal ? "w-full" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

/** Botão só de ícone: quadrado, sempre com `aria-label` (o ícone sozinho não comunica nada). */
export function BotaoIcone({
  aparencia = "discreto",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { aparencia?: Aparencia; "aria-label": string }) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-jaa-compacto transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 ${APARENCIAS[aparencia]} ${className}`}
    >
      {children}
    </button>
  );
}

const ESTILO_CAMPO = `min-h-11 w-full rounded-jaa-compacto border border-borda bg-superficie px-3 text-base text-conteudo placeholder:text-conteudo-suave/60 disabled:opacity-60`;

function Rotulo({ texto, dica, children, erro, id }: { texto: string; dica?: string; children: ReactNode; erro?: string | null; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-conteudo">
        {texto}
      </label>
      {children}
      {dica && !erro && (
        <p id={`${id}-dica`} className="text-xs text-conteudo-suave">
          {dica}
        </p>
      )}
      {erro && (
        <p id={`${id}-erro`} role="alert" className="text-xs text-perigo">
          {erro}
        </p>
      )}
    </div>
  );
}

/*
 * `ref` é prop normal de componente de função no React 19: repassá-la ao <input> deixa quem usa o
 * campo devolver o foco (ex.: depois de um erro de validação) sem precisar de forwardRef.
 */
export function CampoTexto({
  rotulo,
  dica,
  erro,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; dica?: string; erro?: string | null; id: string; ref?: Ref<HTMLInputElement> }) {
  return (
    <Rotulo texto={rotulo} {...(dica ? { dica } : {})} erro={erro ?? null} id={id}>
      <input {...props} id={id} aria-describedby={erro ? `${id}-erro` : dica ? `${id}-dica` : undefined} aria-invalid={erro ? true : undefined} className={ESTILO_CAMPO} />
    </Rotulo>
  );
}

export function CampoTextoLongo({
  rotulo,
  dica,
  erro,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo: string; dica?: string; erro?: string | null; id: string }) {
  return (
    <Rotulo texto={rotulo} {...(dica ? { dica } : {})} erro={erro ?? null} id={id}>
      <textarea {...props} id={id} aria-describedby={erro ? `${id}-erro` : dica ? `${id}-dica` : undefined} className={`${ESTILO_CAMPO} min-h-24 py-2 leading-relaxed`} />
    </Rotulo>
  );
}

export function CampoSelecao({
  rotulo,
  dica,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { rotulo: string; dica?: string; id: string }) {
  return (
    <Rotulo texto={rotulo} {...(dica ? { dica } : {})} id={id}>
      <select {...props} id={id} aria-describedby={dica ? `${id}-dica` : undefined} className={ESTILO_CAMPO}>
        {children}
      </select>
    </Rotulo>
  );
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-jaa border border-borda bg-superficie shadow-cartao ${className}`}>{children}</div>;
}

/** Bloco de conteúdo com título acessível. `acoes` fica no cabeçalho e quebra sozinho no celular. */
export function Secao({ titulo, descricao, acoes, children }: { titulo: string; descricao?: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="fonte-display text-lg font-bold text-conteudo">{titulo}</h2>
          {descricao && <p className="text-sm text-conteudo-suave">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

const TONS_AVISO = {
  informacao: "border-borda bg-superficie-suave text-conteudo-suave",
  atencao: "border-aviso/30 bg-aviso/5 text-aviso",
  erro: "border-perigo/30 bg-perigo/5 text-perigo",
} as const;

export function Aviso({ tom = "informacao", children }: { tom?: keyof typeof TONS_AVISO; children: ReactNode }) {
  return (
    <p role={tom === "erro" ? "alert" : "note"} className={`rounded-jaa border px-3 py-2 text-sm ${TONS_AVISO[tom]}`}>
      {children}
    </p>
  );
}

export function Selo({ children, tom = "neutro" }: { children: ReactNode; tom?: "neutro" | "marca" | "atencao" }) {
  const tons = {
    neutro: "bg-superficie-suave text-conteudo-suave",
    marca: "bg-marca-suave text-marca-suave-conteudo",
    atencao: "bg-aviso/10 text-aviso",
  } as const;
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tons[tom]}`}>{children}</span>;
}

/** Estado vazio com o próximo passo à mão: lista vazia não pode ser um beco sem saída. */
export function EstadoVazio({ titulo, descricao, acao }: { titulo: string; descricao: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-jaa border border-dashed border-borda px-4 py-8 text-center">
      <p className="text-sm font-bold text-conteudo">{titulo}</p>
      <p className="max-w-sm text-sm text-conteudo-suave">{descricao}</p>
      {acao}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <p role="status" aria-live="polite" className="px-1 py-4 text-sm text-conteudo-suave">
      {texto}
    </p>
  );
}
