import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { interpretarResultadoSeletor } from "@/features/perfil/lib/foto-perfil";
import { QUALIDADE_ENVIO_IMAGEM, reducaoDaImagem, type ImagemPreparada, type ObtencaoImagem, type OrigemImagem } from "./imagem-conversa";

/*
 * Ligação REAL com o aparelho para a imagem da conversa (a regra está em `imagem-conversa.ts`).
 * Mesmas bibliotecas e o mesmo cuidado da foto do perfil, com duas diferenças: SEM recorte (a foto vai
 * na proporção original) e redução para até 1600 px.
 *
 * - Galeria: seletor de fotos do sistema, uma imagem só; não pede permissão de armazenamento.
 * - Câmera: a permissão é pedida AQUI, quando a pessoa escolhe "Câmera" — nunca antes.
 */

const OPCOES: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: false,
  // Qualidade máxima AQUI: a compressão acontece uma vez só, na preparação.
  quality: 1,
  allowsMultipleSelection: false,
  exif: false,
  base64: false,
};

/** O Modal do menu precisa terminar de fechar antes de o iOS apresentar outra tela por cima. */
const esperarMenuFechar = () => (Platform.OS === "ios" ? new Promise((resolver) => setTimeout(resolver, 350)) : Promise.resolve());

export async function obterImagem(origem: OrigemImagem): Promise<ObtencaoImagem> {
  await esperarMenuFechar();
  if (origem === "camera") {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) return { tipo: "permissao-negada" };
    return interpretarResultadoSeletor(await ImagePicker.launchCameraAsync(OPCOES));
  }
  return interpretarResultadoSeletor(await ImagePicker.launchImageLibraryAsync(OPCOES));
}

/**
 * Reduz (lado maior até 1600 px) e grava em JPEG. Renderizar pelo manipulador já aplica a orientação
 * da foto e garante um formato que a API aceita (HEIC/HEIF viram JPEG). O servidor ainda processa tudo
 * de novo: bytes, EXIF fora, WebP.
 */
export async function prepararImagem(imagem: { uri: string; largura: number; altura: number }): Promise<ImagemPreparada> {
  const contexto = ImageManipulator.manipulate(imagem.uri);
  const reducao = reducaoDaImagem(imagem.largura, imagem.altura);
  if (reducao) contexto.resize(reducao);
  const renderizada = await contexto.renderAsync();
  const salva = await renderizada.saveAsync({ compress: QUALIDADE_ENVIO_IMAGEM, format: SaveFormat.JPEG });
  // JPEG de até 1600 px fica bem abaixo do limite de 8 MB: o tamanho não precisa ser medido.
  return { uri: salva.uri, largura: salva.width, altura: salva.height, tamanhoBytes: null };
}
