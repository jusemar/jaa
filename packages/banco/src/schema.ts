// Ponto único de exportação das tabelas e relações do Jaa.
// Cada domínio define suas tabelas em src/tabelas/<dominio>/ e as reexporta aqui.

// Gerado pela CLI oficial do Better Auth; não editar manualmente.
// Regenerar após mudar opções que afetam tabelas: npm run autenticacao:gerar-schema -w @jaa/api
// Nomes de tabelas/campos seguem a biblioteca (exceção prevista no CLAUDE.md).
export * from "./tabelas/autenticacao/better-auth.js";

export * from "./tabelas/empresas/empresas.js";
export * from "./tabelas/empresas/membros-empresa.js";
export * from "./tabelas/empresas/relacoes.js";

export * from "./tabelas/produtos/produtos.js";
export * from "./tabelas/produtos/relacoes.js";

export * from "./tabelas/identidades/identidades.js";
export * from "./tabelas/identidades/relacoes.js";

export * from "./tabelas/conversas/conversas.js";
export * from "./tabelas/conversas/participantes-conversa.js";
export * from "./tabelas/conversas/relacoes.js";

export * from "./tabelas/mensagens/mensagens.js";
export * from "./tabelas/mensagens/recebimentos-mensagem.js";
export * from "./tabelas/mensagens/mensagens-excluidas-para-identidade.js";
export * from "./tabelas/mensagens/relacoes.js";
