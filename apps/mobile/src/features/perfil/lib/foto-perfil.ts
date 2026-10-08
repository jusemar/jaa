import { MENSAGEM_TIPO_INVALIDO, TAMANHO_MAXIMO_IMAGEM_BYTES } from "@jaa/contratos";
import type { ArquivoLocal } from "../../../lib/envio-arquivo.ts";

/*
 * FOTO DO PERFIL no app: escolher (câmera ou galeria), preparar e enviar pela MESMA rota da Web.
 *
 * Este arquivo é a regra (pura, testável em Node). O que toca o aparelho — seletor, câmera,
 * manipulação da imagem — chega por parâmetro (`seletor-foto.ts` faz a ligação real).
 *
 * O servidor continua sendo quem valida os bytes, remove metadados, redimensiona e converte para WebP.
 * No aparelho só se garante o que a API exige para ACEITAR o arquivo: um formato conhecido (o
 * Android entrega HEIC/HEIF ou declara o tipo do original mesmo depois de reencodar) e um tamanho
 * razoável para rede móvel.
 */

// Lado maior antes do envio: o avatar é guardado com 512 px; o dobro dá folga para o servidor.
export const LADO_MAXIMO_ENVIO = 1024;
export const QUALIDADE_ENVIO = 0.85;
// Sempre JPEG depois da preparação: tipo garantido, independente do que a câmera ou a galeria entregou.
export const TIPO_ENVIO = "image/jpeg";
export const NOME_ENVIO = "foto-perfil.jpg";

export type OrigemFoto = "camera" | "galeria";

/** O que o seletor do sistema devolveu, no formato do expo-image-picker. */
export interface ResultadoSeletor {
  canceled: boolean;
  assets: { uri: string; width: number; height: number; type?: string | null }[] | null;
}

export type ImagemEscolhida = { uri: string; largura: number; altura: number };

/** Cancelar a câmera ou a galeria é decisão da pessoa, não erro. */
export function interpretarResultadoSeletor(resultado: ResultadoSeletor): { tipo: "cancelado" } | { tipo: "formato-invalido" } | { tipo: "imagem"; imagem: ImagemEscolhida } {
  const ativo = resultado.assets?.[0];
  if (resultado.canceled || !ativo) return { tipo: "cancelado" };
  // O seletor é configurado só para imagens; se algo diferente vier, não segue para a API.
  if (ativo.type && ativo.type !== "image") return { tipo: "formato-invalido" };
  return { tipo: "imagem", imagem: { uri: ativo.uri, largura: ativo.width, altura: ativo.height } };
}

/** Redução a aplicar antes do envio (só reduz, nunca amplia); `null` = já cabe. */
export function reducaoParaEnvio(largura: number, altura: number): { width: number } | { height: number } | null {
  if (largura <= LADO_MAXIMO_ENVIO && altura <= LADO_MAXIMO_ENVIO) return null;
  return largura >= altura ? { width: LADO_MAXIMO_ENVIO } : { height: LADO_MAXIMO_ENVIO };
}

export function arquivoParaEnvio(uri: string): ArquivoLocal {
  return { uri, nome: NOME_ENVIO, tipo: TIPO_ENVIO };
}

/** Falha vinda da API ou da rede, já no formato `RespostaApi`. */
export interface FalhaApi {
  ok: false;
  status: number;
  codigo: string | null;
  mensagem: string;
}

/**
 * Mensagem para a pessoa. A da API vale quando existe (arquivo grande, formato, limite de envios,
 * armazenamento fora do ar); rede e sessão ganham texto próprio, que diz o que fazer.
 */
export function mensagemDeFalhaFoto(falha: FalhaApi): string {
  if (falha.status === 0) return "Sem conexão com o Jaaa. Sua foto não foi alterada; tente de novo.";
  if (falha.status === 401) return "Sua sessão expirou. Entre de novo para trocar a foto.";
  if (falha.codigo === "ARQUIVO_INVALIDO" || falha.codigo === "LIMITE_DE_ENVIOS_ATINGIDO" || falha.codigo === "ARMAZENAMENTO_INDISPONIVEL") return falha.mensagem;
  return falha.mensagem || "Não foi possível alterar a foto.";
}

export type ResultadoFoto =
  | { tipo: "cancelado" }
  | { tipo: "permissao-negada"; mensagem: string }
  | { tipo: "concluido"; mensagem: string }
  | { tipo: "falha"; mensagem: string };

export type ObtencaoFoto = { tipo: "cancelado" } | { tipo: "permissao-negada" } | { tipo: "formato-invalido" } | { tipo: "imagem"; imagem: ImagemEscolhida };

export interface DependenciasTrocaFoto {
  obter: (origem: OrigemFoto) => Promise<ObtencaoFoto>;
  // Reduz e converte para JPEG; devolve o arquivo local pronto e o tamanho dele, quando conhecido.
  preparar: (imagem: ImagemEscolhida) => Promise<{ uri: string; tamanhoBytes: number | null }>;
  enviar: (arquivo: ArquivoLocal) => Promise<{ ok: true } | FalhaApi>;
  // Relê perfil e contexto: só roda depois do SUCESSO, então a tela nunca mostra uma foto que não foi salva.
  aoConcluir: () => Promise<void>;
}

const MENSAGEM_PERMISSAO_CAMERA =
  "Sem permissão para usar a câmera. Você pode escolher uma foto da galeria ou liberar a câmera para o Jaaa nas configurações do aparelho.";

export async function trocarFotoDoPerfil(origem: OrigemFoto, dependencias: DependenciasTrocaFoto): Promise<ResultadoFoto> {
  const obtida = await dependencias.obter(origem);
  if (obtida.tipo === "cancelado") return { tipo: "cancelado" };
  if (obtida.tipo === "permissao-negada") return { tipo: "permissao-negada", mensagem: MENSAGEM_PERMISSAO_CAMERA };
  if (obtida.tipo === "formato-invalido") return { tipo: "falha", mensagem: MENSAGEM_TIPO_INVALIDO };

  let preparada: { uri: string; tamanhoBytes: number | null };
  try {
    preparada = await dependencias.preparar(obtida.imagem);
  } catch {
    // O aparelho não conseguiu ler a imagem (formato que ele não decodifica, arquivo corrompido).
    return { tipo: "falha", mensagem: MENSAGEM_TIPO_INVALIDO };
  }
  // A API também recusa; conferir aqui só evita gastar a rede à toa.
  if (preparada.tamanhoBytes !== null && preparada.tamanhoBytes > TAMANHO_MAXIMO_IMAGEM_BYTES) {
    return { tipo: "falha", mensagem: `A imagem deve ter no máximo ${TAMANHO_MAXIMO_IMAGEM_BYTES / (1024 * 1024)} MB.` };
  }

  const resposta = await dependencias.enviar(arquivoParaEnvio(preparada.uri));
  if (!resposta.ok) return { tipo: "falha", mensagem: mensagemDeFalhaFoto(resposta) };
  await dependencias.aoConcluir();
  return { tipo: "concluido", mensagem: "Foto atualizada." };
}

export async function removerFotoDoPerfil(dependencias: {
  remover: () => Promise<{ ok: true } | FalhaApi>;
  aoConcluir: () => Promise<void>;
}): Promise<ResultadoFoto> {
  const resposta = await dependencias.remover();
  if (!resposta.ok) return { tipo: "falha", mensagem: mensagemDeFalhaFoto(resposta) };
  await dependencias.aoConcluir();
  return { tipo: "concluido", mensagem: "Foto removida." };
}

/** Opções do menu da foto: remover só existe quando há foto. */
export function opcoesDaFoto(temFoto: boolean): ("camera" | "galeria" | "remover")[] {
  return temFoto ? ["camera", "galeria", "remover"] : ["camera", "galeria"];
}
