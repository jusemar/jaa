/*
 * O que mostrar do perfil de OUTRA identidade. A API já devolve `null` no que a privacidade esconde ou
 * no que não foi preenchido — os dois casos são indistinguíveis de propósito —, então aqui só se decide
 * quais blocos existem: bloco sem texto não aparece (nada de título órfão nem "não informado").
 */
export interface TextosDoPerfil {
  tipo: "pessoal" | "empresarial";
  fraseStatus: string | null;
  sobre: string | null;
}

export interface BlocoDoPerfil {
  id: "frase" | "sobre";
  titulo: string;
  texto: string;
}

const preenchido = (texto: string | null | undefined): string | null => {
  const aparado = texto?.trim();
  return aparado ? aparado : null;
};

export function blocosDoPerfil(perfil: TextosDoPerfil): BlocoDoPerfil[] {
  const frase = preenchido(perfil.fraseStatus);
  const sobre = preenchido(perfil.sobre);
  return [
    // A frase é o recado curto; o "sobre" é a apresentação.
    ...(frase ? [{ id: "frase" as const, titulo: "Recado", texto: frase }] : []),
    ...(sobre ? [{ id: "sobre" as const, titulo: perfil.tipo === "empresarial" ? "Sobre a empresa" : "Sobre", texto: sobre }] : []),
  ];
}
