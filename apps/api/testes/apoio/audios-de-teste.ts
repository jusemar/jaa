/*
 * Áudios FALSOS mínimos para os testes: só a estrutura que o servidor confere (cabeçalho EBML com
 * DocType webm; caixas ftyp/moov/mvhd do MP4). Não são reproduzíveis — e não precisam ser.
 */

/** WebM como o MediaRecorder grava: cabeçalho EBML + DocType "webm", sem duração no cabeçalho. */
export function webmFalso(bytes = 16_000): Buffer {
  const cabecalho = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]), Buffer.from("webm"), Buffer.from([0x42, 0x87, 0x81, 0x04])]);
  return Buffer.concat([cabecalho, Buffer.alloc(Math.max(0, bytes - cabecalho.length), 0x55)]);
}

function caixa(nome: string, conteudo: Buffer): Buffer {
  const cabecalho = Buffer.alloc(8);
  cabecalho.writeUInt32BE(8 + conteudo.length, 0);
  cabecalho.write(nome, 4, "latin1");
  return Buffer.concat([cabecalho, conteudo]);
}

/** MP4/AAC (.m4a) com a duração gravada no próprio arquivo (moov → mvhd). `moovNoFim` = gravadores de celular. */
export function mp4Falso({ duracaoMs, bytes = 32_000, marca = "M4A ", moovNoFim = true, semMvhd = false }: { duracaoMs: number; bytes?: number; marca?: string; moovNoFim?: boolean; semMvhd?: boolean }): Buffer {
  const ftyp = caixa("ftyp", Buffer.concat([Buffer.from(marca, "latin1"), Buffer.alloc(4), Buffer.from("isommp42", "latin1")]));
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12); // escala: 1000 unidades por segundo
  mvhd.writeUInt32BE(duracaoMs, 16);
  const moov = caixa("moov", semMvhd ? caixa("udta", Buffer.alloc(8)) : caixa("mvhd", mvhd));
  const mdat = caixa("mdat", Buffer.alloc(Math.max(0, bytes - ftyp.length - moov.length - 8), 0x33));
  return Buffer.concat(moovNoFim ? [ftyp, mdat, moov] : [ftyp, moov, mdat]);
}
