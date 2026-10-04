import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { QUALIDADE_ENVIO, interpretarResultadoSeletor, reducaoParaEnvio, type ImagemEscolhida, type ObtencaoFoto, type OrigemFoto } from "./foto-perfil";

/*
 * Ligação REAL com o aparelho para a foto do perfil (a regra está em `foto-perfil.ts`).
 *
 * - Galeria: seletor de fotos do sistema (Android 13+ dispensa permissão de armazenamento; nas versões
 *   anteriores o seletor do Google Play cobre o mesmo papel). Uma imagem só.
 * - Câmera: a permissão é pedida AQUI, quando a pessoa escolhe "Tirar foto" — nunca ao abrir o app.
 * - Recorte quadrado: é a forma do avatar, e no Android o recorte já reescreve o arquivo em JPEG/PNG.
 */

const OPCOES: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  // Qualidade máxima AQUI: a compressão acontece uma vez só, na preparação.
  quality: 1,
  allowsMultipleSelection: false,
  exif: false,
  base64: false,
};

/** O Modal do menu precisa terminar de fechar antes de o iOS apresentar outra tela por cima. */
const esperarMenuFechar = () => (Platform.OS === "ios" ? new Promise((resolver) => setTimeout(resolver, 350)) : Promise.resolve());

export async function obterFoto(origem: OrigemFoto): Promise<ObtencaoFoto> {
  await esperarMenuFechar();
  if (origem === "camera") {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) return { tipo: "permissao-negada" };
    return interpretarResultadoSeletor(await ImagePicker.launchCameraAsync(OPCOES));
  }
  return interpretarResultadoSeletor(await ImagePicker.launchImageLibraryAsync(OPCOES));
}

/**
 * Reduz (lado maior até 1024 px) e grava em JPEG. Garante o formato que a API aceita — HEIC/HEIF ou
 * WebP do original viram JPEG — e evita mandar 10 MB de foto de câmera por rede móvel para virar um
 * avatar de 512 px. O servidor ainda processa tudo de novo (bytes, EXIF, WebP).
 */
export async function prepararFoto(imagem: ImagemEscolhida): Promise<{ uri: string; tamanhoBytes: number | null }> {
  const contexto = ImageManipulator.manipulate(imagem.uri);
  const reducao = reducaoParaEnvio(imagem.largura, imagem.altura);
  if (reducao) contexto.resize(reducao);
  const renderizada = await contexto.renderAsync();
  const salva = await renderizada.saveAsync({ compress: QUALIDADE_ENVIO, format: SaveFormat.JPEG });
  // JPEG de no máximo 1024 px fica bem abaixo do limite de 8 MB: o tamanho não precisa ser medido.
  return { uri: salva.uri, tamanhoBytes: null };
}
