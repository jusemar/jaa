# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Rastreamento da entrega (localização em background)

O aplicativo compartilha a localização do entregador **somente enquanto existe uma saída EM ANDAMENTO
atribuída a ele**. Terminou a saída (concluída, cancelada ou perdida), o rastreamento para — e o
servidor recusa qualquer posição fora da operação. Fora de uma entrega o Jaa não coleta localização.

### Development Build é obrigatório

Localização em background **não funciona no Expo Go** e o comportamento dele não representa o do
aparelho real. Para testar:

```bash
npx expo prebuild        # gera os projetos nativos com as permissões do app.json
npx expo run:android     # ou: npx expo run:ios
```

O que já está configurado em `app.json`:

- **Android**: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`,
  `FOREGROUND_SERVICE` e `FOREGROUND_SERVICE_LOCATION`, com serviço em primeiro plano (notificação
  visível durante a entrega — exigência do sistema e transparência com a pessoa);
- **iOS**: `UIBackgroundModes: ["location"]` e os textos de permissão (`WhenInUse` e
  `AlwaysAndWhenInUse`), com o indicador azul de localização ativo em segundo plano.

### O que o sistema operacional pode limitar

O Jaa **não promete** rastreamento contínuo: quem decide é o sistema. A interface mostra a situação
real — `permissao_negada`, `somente_primeiro_plano` (funciona com o app aberto, não com a tela
bloqueada), `gps_desligado`, `degradado` ou `ativo` — em vez de fingir que está acompanhando.

### Política de envio

A política é compartilhada em `@jaa/contratos` (`POLITICA_RASTREAMENTO`, `decidirEnvioDePosicao`):
uma atualização útil a cada 10–20 s, descartando leitura imprecisa e posição praticamente igual à
anterior, com "sinal de vida" no intervalo máximo. Ajuste os valores lá — nunca espalhados no código.

Sem conexão, o aplicativo guarda uma fila **curta** (as posições mais recentes) e envia ao reconectar:
o que importa é a posição atual da operação, não a trilha do que já passou.

### Autenticação

A autenticação do Mobile ainda não existe (ver `CLAUDE.md`, seção 5). O cliente HTTP já usa a mesma
sessão Better Auth do Web (`credentials: "include"`); quando o login mobile for implementado, esta
área funciona sem mudança.
