import { randomUUID } from "node:crypto";
import { DIMENSAO_MAXIMA, ehTipoImagemAceito, MENSAGEM_ARQUIVO_GRANDE, MENSAGEM_TIPO_INVALIDO, TAMANHO_MAXIMO_IMAGEM_BYTES, type TipoAnexo } from "@jaa/contratos";
import sharp, { type OutputInfo } from "sharp";

/**
 * PIPELINE DE IMAGEM — tudo que chega de fora passa por aqui antes de virar arquivo guardado.
 *
 * Três motivos, todos de segurança e custo:
 * 1. O tipo declarado pelo cliente não vale nada: quem diz o que o arquivo é são os BYTES (sharp lê o
 *    cabeçalho real). Um ".png" que na verdade é outra coisa não passa.
 * 2. Reencodar remove metadados (EXIF) — inclusive a GEOLOCALIZAÇÃO que celulares gravam na foto.
 *    Ninguém publica a própria casa sem saber ao trocar a foto de perfil.
 * 3. Redimensionar limita banda e armazenamento; foto de 12 MP não serve como avatar de 40 px.
 */

export class ImagemInvalidaErro extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ImagemInvalidaErro";
  }
}

export interface ImagemProcessada {
  conteudo: Buffer;
  tipoConteudo: string;
  largura: number;
  altura: number;
}

export async function processarImagem(original: Buffer, tipo: TipoAnexo, tipoDeclarado?: string): Promise<ImagemProcessada> {
  if (original.byteLength === 0) throw new ImagemInvalidaErro("Envie um arquivo.");
  if (original.byteLength > TAMANHO_MAXIMO_IMAGEM_BYTES) throw new ImagemInvalidaErro(MENSAGEM_ARQUIVO_GRANDE);
  if (tipoDeclarado && !ehTipoImagemAceito(tipoDeclarado)) throw new ImagemInvalidaErro(MENSAGEM_TIPO_INVALIDO);

  const lado = DIMENSAO_MAXIMA[tipo];

  let processada: { data: Buffer; info: OutputInfo };
  try {
    processada = await sharp(original, { failOn: "error" })
      // Respeita a orientação do EXIF e então descarta todos os metadados (o padrão do sharp).
      .rotate()
      .resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    // Qualquer falha de decodificação é tratada como arquivo inválido: o motivo interno não interessa
    // a quem enviou, e detalhá-lo só ajudaria quem está sondando o servidor.
    throw new ImagemInvalidaErro(MENSAGEM_TIPO_INVALIDO);
  }

  return { conteudo: processada.data, tipoConteudo: "image/webp", largura: processada.info.width, altura: processada.info.height };
}

/**
 * Chave do objeto. Inclui um UUID novo a cada envio: a URL antiga nunca é reaproveitada, então
 * trocar a foto não fica preso em cache de CDN mostrando a imagem anterior.
 */
export function montarChave(tipo: TipoAnexo, donoId: string): string {
  return `${tipo}/${donoId}/${randomUUID()}.webp`;
}
