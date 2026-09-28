ALTER TABLE "configuracoes_despacho" ADD COLUMN "saidas_exigem_retorno_base" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "exige_retorno_base" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_com_retorno" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_origem_latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_origem_longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_rota_origem_completa" CHECK (("saidas_entrega"."rota_origem_latitude" is null) = ("saidas_entrega"."rota_origem_longitude" is null));--> statement-breakpoint
-- Saídas já planejadas partiram do snapshot da base: é essa a origem do percurso que elas guardam.
-- Nenhuma passa a exigir retorno (padrão false): o comportamento das rotas existentes não muda.
UPDATE "saidas_entrega" SET "rota_origem_latitude" = "origem_latitude", "rota_origem_longitude" = "origem_longitude" WHERE "origem_latitude" IS NOT NULL;
