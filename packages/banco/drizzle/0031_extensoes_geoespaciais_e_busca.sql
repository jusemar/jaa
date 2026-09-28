-- FUNDAÇÃO do Motor Profissional (Bloco 1): extensões geoespacial e de busca textual. Nenhuma tabela
-- existente é alterada; nada aqui muda endereços, zonas, pedidos ou entregas.
--
-- Estas extensões são REQUISITO do banco (local e produção), como o PostgreSQL 18 já é pelo uuidv7().
-- Sem elas a migration falha de forma explícita, em vez de o código descobrir em produção que falta
-- uma função. Ficam no schema public, o mesmo das tabelas do Jaa.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
--> statement-breakpoint
-- NORMALIZAÇÃO DE BUSCA: minúsculas, sem acento e com espaços colapsados ("  Moto   Táxi " → "moto taxi").
-- `unaccent()` é STABLE (depende do dicionário resolvido pelo search_path), então não pode entrar em
-- índice nem em coluna gerada. Esta função fixa o dicionário pelo nome qualificado e usa corpo SQL
-- padrão (BEGIN ATOMIC), resolvido na criação — imune a search_path — e por isso pode ser IMMUTABLE.
-- Cuidado: se as regras do dicionário `unaccent` mudarem numa atualização da extensão, índices que usam
-- esta função devem ser reconstruídos (REINDEX).
CREATE OR REPLACE FUNCTION public.jaa_normalizar(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
BEGIN ATOMIC
  SELECT btrim(regexp_replace(lower(public.unaccent('public.unaccent'::regdictionary, texto)), '\s+', ' ', 'g'));
END;
