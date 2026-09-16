import * as z from "zod";

/*
 * ENDEREÇO DO CLIENTE (agenda privada da identidade pessoal) e PONTO DE ENTREGA.
 *
 * São DUAS informações diferentes e não equivalentes:
 * - o endereço TEXTUAL diz como o local é conhecido (rua, número, complemento…), e é do cliente;
 * - a COORDENADA confirmada diz "entregar exatamente aqui".
 *
 * O mapa nunca corrige o texto: geocodificação erra número, condomínio tem entrada em outra rua e
 * base cartográfica tem imprecisão. Quem decide o ponto é o cliente, confirmando explicitamente.
 */

export const UNIDADES_FEDERACAO = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
  "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const ufSchema = z.enum(UNIDADES_FEDERACAO);

export type Uf = z.infer<typeof ufSchema>;

// CEP só com dígitos no contrato e no banco; a interface formata 30123-000 ao exibir.
export const cepSchema = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{8}$/, "CEP deve ter 8 dígitos."));

const textoObrigatorio = (maximo: number, mensagem: string) => z.string().trim().min(1, mensagem).max(maximo);
// Campo opcional: ausente e vazio viram null (nunca string vazia no banco).
const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .transform((valor) => (valor === "" ? null : valor))
    .nullable()
    // Ausente vira null: quem grava recebe sempre `string | null`, nunca `undefined`.
    .default(null);

export const APELIDO_ENDERECO_TAMANHO_MAXIMO = 40;
export const LOGRADOURO_TAMANHO_MAXIMO = 120;
export const NUMERO_ENDERECO_TAMANHO_MAXIMO = 20;
export const COMPLEMENTO_TAMANHO_MAXIMO = 60;
export const BAIRRO_TAMANHO_MAXIMO = 80;
export const CIDADE_TAMANHO_MAXIMO = 80;
export const PONTO_REFERENCIA_TAMANHO_MAXIMO = 160;
export const MAXIMO_ENDERECOS_POR_IDENTIDADE = 20;

/**
 * Coordenada geográfica com precisão de navegação urbana (6 casas ≈ 0,11 m).
 * Validação é de formato e faixa: "parece o lugar certo?" é decisão do cliente, não de regra rígida.
 */
export const latitudeSchema = z.number().finite().min(-90).max(90);
export const longitudeSchema = z.number().finite().min(-180).max(180);

export const coordenadasSchema = z.object({ latitude: latitudeSchema, longitude: longitudeSchema });

export type Coordenadas = z.infer<typeof coordenadasSchema>;

const camposTextuais = {
  apelido: textoObrigatorio(APELIDO_ENDERECO_TAMANHO_MAXIMO, "Dê um apelido ao endereço (ex.: Casa)."),
  cep: cepSchema,
  logradouro: textoObrigatorio(LOGRADOURO_TAMANHO_MAXIMO, "Informe o logradouro."),
  numero: textoObrigatorio(NUMERO_ENDERECO_TAMANHO_MAXIMO, "Informe o número (ou S/N)."),
  complemento: textoOpcional(COMPLEMENTO_TAMANHO_MAXIMO),
  bairro: textoObrigatorio(BAIRRO_TAMANHO_MAXIMO, "Informe o bairro."),
  cidade: textoObrigatorio(CIDADE_TAMANHO_MAXIMO, "Informe a cidade."),
  uf: ufSchema,
  pontoReferencia: textoOpcional(PONTO_REFERENCIA_TAMANHO_MAXIMO),
};

export const criarEnderecoEntradaSchema = z.object(camposTextuais);

export type CriarEnderecoEntrada = z.input<typeof criarEnderecoEntradaSchema>;

// Edição envia o endereço completo (formulário inteiro): simples de validar e de comparar.
export const atualizarEnderecoEntradaSchema = criarEnderecoEntradaSchema;

export type AtualizarEnderecoEntrada = z.input<typeof atualizarEnderecoEntradaSchema>;

// Confirmação/ajuste do ponto: só coordenadas, sempre por ação explícita do cliente.
export const confirmarLocalizacaoEntradaSchema = coordenadasSchema;

export type ConfirmarLocalizacaoEntrada = z.infer<typeof confirmarLocalizacaoEntradaSchema>;

export const enderecoClienteSchema = z.object({
  id: z.uuid(),
  ...camposTextuais,
  complemento: z.string().nullable(),
  pontoReferencia: z.string().nullable(),
  // Coordenadas existem apenas quando o cliente confirmou o ponto no mapa.
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  localizacaoConfirmadaEm: z.iso.datetime().nullable(),
  criadoEm: z.iso.datetime(),
  atualizadoEm: z.iso.datetime(),
});

export type EnderecoCliente = z.infer<typeof enderecoClienteSchema>;

export const listaEnderecosSchema = z.object({ enderecos: z.array(enderecoClienteSchema) });

export type ListaEnderecos = z.infer<typeof listaEnderecosSchema>;

// Sugestão de ponto (geocodificação) é só um palpite para abrir o mapa; nunca vira confirmação.
export const sugestaoLocalizacaoSchema = z.object({
  coordenadas: coordenadasSchema.nullable(),
  // false quando não há serviço de geocodificação configurado: o mapa abre sem palpite.
  disponivel: z.boolean(),
});

export type SugestaoLocalizacao = z.infer<typeof sugestaoLocalizacaoSchema>;

export function enderecoTemLocalizacaoConfirmada(endereco: Pick<EnderecoCliente, "latitude" | "longitude" | "localizacaoConfirmadaEm">): boolean {
  return endereco.localizacaoConfirmadaEm !== null && endereco.latitude !== null && endereco.longitude !== null;
}

/*
 * REGRA CENTRAL da invalidação (um lugar só, usado pela API e pela interface).
 * Mudou algo que pode significar OUTRO destino físico → a confirmação anterior deixa de valer e o
 * cliente confirma de novo no mapa. Apelido é etiqueta pessoal: não invalida.
 * Complemento e ponto de referência entram na lista porque "Apto 302" → "Casa 2 dos fundos" pode ser
 * outra entrada física; na dúvida, preferimos pedir nova confirmação a entregar no lugar errado.
 */
export const CAMPOS_ESTRUTURAIS_ENDERECO = ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf"] as const;

export type CampoEstruturalEndereco = (typeof CAMPOS_ESTRUTURAIS_ENDERECO)[number];

// Aceita o endereço inteiro (com apelido, datas etc.): só os campos estruturais são comparados.
type DadosComparaveis = { [Campo in CampoEstruturalEndereco]?: string | null };

const normalizarComparacao = (valor: string | null | undefined) => (valor ?? "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");

export function alteracaoInvalidaLocalizacao<T extends DadosComparaveis, U extends DadosComparaveis>(atual: T, novo: U): boolean {
  return CAMPOS_ESTRUTURAIS_ENDERECO.some((campo) => normalizarComparacao(atual[campo] ?? null) !== normalizarComparacao(novo[campo] ?? null));
}

// Uma linha legível ("Rua X, 150 — Apto 302"); o texto é sempre o que o cliente cadastrou.
export function formatarEnderecoResumido(endereco: Pick<EnderecoCliente, "logradouro" | "numero" | "complemento">): string {
  return `${endereco.logradouro}, ${endereco.numero}${endereco.complemento ? ` — ${endereco.complemento}` : ""}`;
}

export function formatarCep(cep: string): string {
  return /^\d{8}$/.test(cep) ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}
