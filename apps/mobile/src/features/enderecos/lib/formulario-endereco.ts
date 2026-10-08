import { criarEnderecoEntradaSchema, formatarCep, type CriarEnderecoEntrada, type EnderecoCliente } from "@jaa/contratos";

/*
 * Regras de TELA do cadastro de endereço. A validação é a do CONTRATO (`criarEnderecoEntradaSchema`),
 * a mesma que a Web usa e que o servidor aplica de novo — o app não cria regra própria de endereço.
 */

export type DadosDoEndereco = CriarEnderecoEntrada;
export type CampoDoEndereco = keyof DadosDoEndereco;

export const ENDERECO_VAZIO: DadosDoEndereco = { apelido: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "MG", pontoReferencia: "" };

export function dadosDoEndereco(endereco: EnderecoCliente): DadosDoEndereco {
  return {
    apelido: endereco.apelido ?? "",
    cep: formatarCep(endereco.cep),
    logradouro: endereco.logradouro,
    numero: endereco.numero,
    complemento: endereco.complemento ?? "",
    bairro: endereco.bairro,
    cidade: endereco.cidade,
    uf: endereco.uf,
    pontoReferencia: endereco.pontoReferencia ?? "",
  };
}

/** Máscara do CEP enquanto se digita: só dígitos, com o hífen depois do quinto. */
export function mascararCep(texto: string): string {
  const digitos = texto.replace(/\D/g, "").slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

/** UF digitada: duas letras maiúsculas (o contrato confere se é uma UF de verdade). */
export const normalizarUf = (texto: string) => texto.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);

export type ErrosDoEndereco = Partial<Record<CampoDoEndereco, string>>;

/** Erros por CAMPO, na ordem do formulário — para aparecerem junto de onde a pessoa precisa corrigir. */
export function validarEndereco(dados: DadosDoEndereco): { ok: true } | { ok: false; erros: ErrosDoEndereco } {
  const resultado = criarEnderecoEntradaSchema.safeParse(dados);
  if (resultado.success) return { ok: true };
  const erros: ErrosDoEndereco = {};
  for (const problema of resultado.error.issues) {
    const campo = problema.path[0] as CampoDoEndereco | undefined;
    if (campo && !erros[campo]) erros[campo] = problema.message;
  }
  return { ok: false, erros };
}
