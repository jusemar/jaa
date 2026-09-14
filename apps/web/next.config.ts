import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // As regras do projeto vivem somente no CLAUDE.md da raiz do monorepo.
  // Impede o `next dev` de gerar AGENTS.md/CLAUDE.md dentro de apps/web.
  agentRules: false,
};

export default nextConfig;
