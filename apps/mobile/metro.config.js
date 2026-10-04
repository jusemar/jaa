// Monorepo: o `getDefaultConfig` do Expo (SDK 52+) já detecta os npm workspaces e configura sozinho
// `watchFolders` (node_modules da raiz + pacotes do workspace, como @jaa/contratos) e `nodeModulesPaths`
// (apps/mobile/node_modules e depois a raiz). A busca hierárquica fica LIGADA de propósito: dependências
// com versão própria aninhada (ex.: o `semver` do react-native-reanimated) precisam dela para resolver.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
