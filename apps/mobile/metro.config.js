// Monorepo: o Metro precisa enxergar os pacotes da raiz (@jaa/contratos é código-fonte TypeScript,
// consumido sem build, como no Web e na API). Sem isto o aplicativo não resolve o workspace.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projeto = __dirname;
const raiz = path.resolve(projeto, "../..");

const configuracao = getDefaultConfig(projeto);
configuracao.watchFolders = [raiz];
configuracao.resolver.nodeModulesPaths = [path.resolve(projeto, "node_modules"), path.resolve(raiz, "node_modules")];
// Uma cópia só de cada dependência compartilhada (evita dois React/Zod no bundle).
configuracao.resolver.disableHierarchicalLookup = true;

module.exports = configuracao;
