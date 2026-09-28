ALTER TABLE "termos_busca_servico" ADD COLUMN "termo_compacto" text GENERATED ALWAYS AS (regexp_replace(jaa_normalizar(termo), '[^a-z0-9]', '', 'g')) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "termos_busca_servico_compacto_idx" ON "termos_busca_servico" USING btree ("termo_compacto");--> statement-breakpoint
-- "Entregador de moto" é um TERMO próprio (não uma atividade): leva a Entregador + Veículo=Moto, como
-- "Motoboy". Grafias como "moto boy" e "MOTO-BOY" não viram linhas: o `termo_compacto` as absorve.
INSERT INTO termos_busca_servico (servico_id, especialidade_id, opcao_id, termo) VALUES
  ('0199b000-0000-7000-8000-000000000011', NULL, '0199b000-0000-7000-8000-000000000031', 'Entregador de moto')
ON CONFLICT DO NOTHING;
