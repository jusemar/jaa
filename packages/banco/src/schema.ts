// Ponto único de exportação das tabelas e relações do Jaa.
// Cada domínio define suas tabelas em src/tabelas/<dominio>/ e as reexporta aqui.

// Gerado pela CLI oficial do Better Auth; não editar manualmente.
// Regenerar após mudar opções que afetam tabelas: npm run autenticacao:gerar-schema -w @jaa/api
// Nomes de tabelas/campos seguem a biblioteca (exceção prevista no CLAUDE.md).
export * from "./tabelas/autenticacao/better-auth.js";

export * from "./tabelas/identidades/identidades.js";
export * from "./tabelas/identidades/relacoes.js";
