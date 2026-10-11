import type { NextConfig } from "next";
import { exigirAmbienteDeProducao } from "./src/lib/ambiente-de-producao";

// Build de produção sem as variáveis públicas obrigatórias falha aqui, em vez de publicar um site
// com mapas ausentes ou apontando para localhost.
exigirAmbienteDeProducao(process.env);

const nextConfig: NextConfig = {
  // As regras do projeto vivem somente no CLAUDE.md da raiz do monorepo.
  // Impede o `next dev` de gerar AGENTS.md/CLAUDE.md dentro de apps/web.
  agentRules: false,
};

export default nextConfig;
