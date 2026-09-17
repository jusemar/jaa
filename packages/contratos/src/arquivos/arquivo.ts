import * as z from "zod";

/*
 * ARQUIVOS enviados pelo usuário (foto de perfil, logo da empresa, imagem de produto).
 *
 * Os limites vivem aqui porque valem nos DOIS lados: o cliente avisa cedo ("essa imagem tem 12 MB"),
 * e o servidor recusa de verdade. Validação no cliente é conveniência, nunca proteção — quem impede
 * o upload inseguro é a API (seção 20 do CLAUDE.md).
 */

export const TIPOS_IMAGEM_ACEITOS = ["image/jpeg", "image/png", "image/webp"] as const;
export type TipoImagemAceito = (typeof TIPOS_IMAGEM_ACEITOS)[number];

// 8 MB é folgado para foto de celular e continua barato de processar no servidor.
export const TAMANHO_MAXIMO_IMAGEM_BYTES = 8 * 1024 * 1024;

export const tipoAnexoSchema = z.enum(["avatar", "logo-empresa", "imagem-produto"]);
export type TipoAnexo = z.infer<typeof tipoAnexoSchema>;

/** Lado maior da imagem depois do processamento. Não é decoração: limita o que vai ao armazenamento. */
export const DIMENSAO_MAXIMA: Record<TipoAnexo, number> = {
  avatar: 512,
  "logo-empresa": 512,
  "imagem-produto": 1024,
};

export function ehTipoImagemAceito(tipo: string): tipo is TipoImagemAceito {
  return (TIPOS_IMAGEM_ACEITOS as readonly string[]).includes(tipo);
}

export const arquivoEnviadoSchema = z.object({
  chave: z.string(),
  url: z.url(),
});

export type ArquivoEnviado = z.infer<typeof arquivoEnviadoSchema>;

export const MENSAGEM_TIPO_INVALIDO = "Envie uma imagem JPEG, PNG ou WebP.";
export const MENSAGEM_ARQUIVO_GRANDE = `A imagem deve ter no máximo ${TAMANHO_MAXIMO_IMAGEM_BYTES / (1024 * 1024)} MB.`;
