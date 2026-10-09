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

const USO_DO_MICROFONE = "O Jaaa usa o microfone somente enquanto você grava uma mensagem de voz na conversa.";
const USO_DA_LOCALIZACAO = "O Jaaa usa sua localização durante uma entrega em andamento para a empresa acompanhar o pedido.";

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
  // Ícone oficial do Jaaa (derivado técnico de `jaaa-app-icon.png.png`: 1024 px, cantos transparentes).
  icon: "./assets/images/jaaa-icone.png",
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
    /*
     * Ícone adaptativo: a MESMA arte a 82% sobre o verde da própria borda, para o recorte do Android
     * (círculo, squircle) não cortar o desenho. Sem versão monocromática: ela exigiria redesenhar a
     * marca, então o ícone temático do Android usa o ícone normal.
     */
    adaptiveIcon: {
      backgroundColor: "#013C2F",
      foregroundImage: "./assets/images/jaaa-icone-adaptativo.png",
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_LOCATION",
      /*
       * O rastreamento em segundo plano passa pelo expo-task-manager, que agenda um job PERSISTENTE
       * (JobScheduler `setPersisted(true)`). O Android só aceita isso com esta permissão; sem ela o
       * app FECHA ao ligar a localização ("Requested job cannot be persisted without holding
       * RECEIVE_BOOT_COMPLETED"). A biblioteca não a declara sozinha.
       */
      "android.permission.RECEIVE_BOOT_COMPLETED",
      // Android 13+: sem ela o aviso "Entrega em andamento" do serviço de localização não aparece.
      "android.permission.POST_NOTIFICATIONS",
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
    /*
     * Botão flutuante de ferramentas (a "engrenagem") do Development Client: desligado por padrão, para
     * não ficar por cima das telas do app. É recurso SÓ do build de desenvolvimento (não existe em
     * produção) e o menu continua acessível como sempre: sacudir o aparelho ou `m` no terminal do
     * Metro — lá dentro, "Tools button" liga/desliga o botão. Mudar isto = novo Development Build.
     */
    ["expo-dev-client", { toolsButton: false }],
    /*
     * Splash NATIVO: o Android (12+) só aceita um ícone centralizado sobre uma cor — não uma arte em
     * tela cheia. Então ele usa a cor de base da arte de carregamento (`COR_DE_FUNDO_DO_CARREGAMENTO`)
     * e o símbolo do Jaaa; a arte inteira entra logo em seguida, no carregamento do app
     * (`TelaDeCarregamento`). Uma identidade só, sem trocar de cor no caminho. Mudar isto = novo build.
     */
    ["expo-splash-screen", { backgroundColor: "#FDFEFD", image: "./assets/images/jaaa-icone.png", imageWidth: 120 }],
    ["expo-location", { locationAlwaysAndWhenInUsePermission: USO_DA_LOCALIZACAO, isAndroidBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: true }],
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        cameraPermission: "O Jaaa usa a câmera somente quando você escolhe tirar uma foto para o seu perfil.",
        photosPermission: "O Jaaa acessa suas fotos somente quando você escolhe uma imagem para o seu perfil.",
        // Nunca `false`: removeria RECORD_AUDIO do manifesto e quebraria a mensagem de voz.
        microphonePermission: USO_DO_MICROFONE,
      },
    ],
    // Mapa da ROTA do entregador (SDK nativo). O SDK é baixado sem token; em execução o app usa só o
    // token PÚBLICO (`EXPO_PUBLIC_MAPBOX_TOKEN`). O token secreto de rotas fica na API.
    "@rnmapbox/maps",
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
