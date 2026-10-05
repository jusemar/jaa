// Permite importar TypeScript do projeto na configuração (forma documentada pelo Expo).
import "tsx/cjs";
import type { ExpoConfig } from "expo/config";
import { IDENTIDADE_DA_VARIANTE, lerVariante } from "./src/lib/variante";

/*
 * Configuração ÚNICA do app (não existe app.json). O que muda entre os dois ambientes — nome, pacote
 * Android e scheme — vem de `APP_VARIANT` (regras em `src/lib/variante.ts`); todo o resto é igual.
 */
const variante = lerVariante(process.env.APP_VARIANT);
const identidade = IDENTIDADE_DA_VARIANTE[variante];

/*
 * Projeto do EAS (um só para as duas variantes): dele saem `extra.eas.projectId` e `updates.url`.
 * Com null, o app não tem EAS Update e os scripts de distribuição recusam publicar.
 */
const PROJETO_EAS: string | null = "d4025512-7044-47fb-8a75-88ee162b8cb1";

const USO_DO_MICROFONE = "O Jaa usa o microfone somente enquanto você grava uma mensagem de voz na conversa.";
const USO_DA_LOCALIZACAO = "O Jaa usa sua localização durante uma entrega em andamento para a empresa acompanhar o pedido.";

const config: ExpoConfig = {
  name: identidade.nome,
  // Slug e dono precisam ser os do projeto no EAS (jaa-app/jaa). O slug também forma o scheme do
  // Development Client (`exp+jaa`). São os mesmos nas duas variantes.
  slug: "jaa",
  owner: "jaa-app",
  // Versão do PRODUTO. O runtime dos updates segue ela: update só chega a binário da mesma versão.
  version: "0.6.0",
  runtimeVersion: { policy: "appVersion" },
  updates: {
    // Verifica ao abrir, baixa em segundo plano e aplica na abertura seguinte: nunca segura a tela.
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
    ...(PROJETO_EAS ? { url: `https://u.expo.dev/${PROJETO_EAS}` } : {}),
  },
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: identidade.scheme,
  userInterfaceStyle: "light",
  ios: {
    icon: "./assets/expo.icon",
    infoPlist: {
      NSLocationWhenInUseUsageDescription: USO_DA_LOCALIZACAO,
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Com a permissão o tempo todo, a empresa continua acompanhando a entrega mesmo com o app em segundo plano ou a tela bloqueada. Fora de uma saída em andamento, sua localização não é usada.",
      UIBackgroundModes: ["location"],
    },
  },
  android: {
    // Sem versionCode aqui: o número do binário é do EAS (`appVersionSource: remote` no eas.json).
    package: identidade.pacote,
    adaptiveIcon: {
      backgroundColor: "#DDF7D3",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_LOCATION",
      "android.permission.RECORD_AUDIO",
    ],
    blockedPermissions: ["android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE"],
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { backgroundColor: "#009D72", image: "./assets/images/splash-icon.png", imageWidth: 76 }],
    ["expo-location", { locationAlwaysAndWhenInUsePermission: USO_DA_LOCALIZACAO, isAndroidBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: true }],
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        cameraPermission: "O Jaa usa a câmera somente quando você escolhe tirar uma foto para o seu perfil.",
        photosPermission: "O Jaa acessa suas fotos somente quando você escolhe uma imagem para o seu perfil.",
        // Nunca `false`: removeria RECORD_AUDIO do manifesto e quebraria a mensagem de voz.
        microphonePermission: USO_DO_MICROFONE,
      },
    ],
    ["expo-audio", { microphonePermission: USO_DO_MICROFONE, recordAudioAndroid: true, enableBackgroundRecording: false, enableBackgroundPlayback: false }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    variante,
    ...(PROJETO_EAS ? { eas: { projectId: PROJETO_EAS } } : {}),
  },
};

export default config;
