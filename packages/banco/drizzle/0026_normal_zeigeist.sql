-- Substituir o enum permite usar o novo valor no backfill dentro da mesma transação da migration.
ALTER TABLE "saidas_entrega" DROP CONSTRAINT "saidas_entrega_entregador_por_status";--> statement-breakpoint
ALTER TABLE "saidas_entrega" DROP CONSTRAINT "saidas_entrega_fechada_por_status";--> statement-breakpoint
ALTER TABLE "saidas_entrega" DROP CONSTRAINT "saidas_entrega_iniciada_por_status";--> statement-breakpoint
ALTER TABLE "saidas_entrega" DROP CONSTRAINT "saidas_entrega_concluida_por_status";--> statement-breakpoint
ALTER TABLE "saidas_entrega" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."status_saida_entrega" RENAME TO "status_saida_entrega_antigo";--> statement-breakpoint
CREATE TYPE "public"."status_saida_entrega" AS ENUM('em_formacao', 'aguardando_entregador', 'preparada', 'liberada_retirada', 'em_andamento', 'concluida');--> statement-breakpoint
ALTER TABLE "saidas_entrega" ALTER COLUMN "status" TYPE "public"."status_saida_entrega" USING "status"::text::"public"."status_saida_entrega";--> statement-breakpoint
ALTER TABLE "saidas_entrega" ALTER COLUMN "status" SET DEFAULT 'preparada';--> statement-breakpoint
DROP TYPE "public"."status_saida_entrega_antigo";--> statement-breakpoint
ALTER TABLE "configuracoes_despacho" ADD COLUMN "liberacao_automatica" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "liberada_em" timestamp with time zone;--> statement-breakpoint
-- Antes desta separação, PREPARADA já autorizava iniciar. Preserve as saídas abertas nesse estado.
UPDATE "saidas_entrega"
SET "status" = 'liberada_retirada',
    "liberada_em" = coalesce("atribuida_em", "fechada_em", "criado_em")
WHERE "status" = 'preparada';--> statement-breakpoint
-- Para o histórico anterior, o início real é o limite seguro conhecido para a liberação implícita.
UPDATE "saidas_entrega"
SET "liberada_em" = "iniciada_em"
WHERE "status" IN ('em_andamento', 'concluida')
  AND "iniciada_em" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_liberada_por_status" CHECK ("saidas_entrega"."liberada_em" is null or "saidas_entrega"."status" in ('aguardando_entregador', 'liberada_retirada', 'em_andamento', 'concluida'));--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_status_exige_liberacao" CHECK ("saidas_entrega"."status" not in ('liberada_retirada', 'em_andamento') or "saidas_entrega"."liberada_em" is not null);
--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_entregador_por_status" CHECK ("saidas_entrega"."entregador_id" is not null or "saidas_entrega"."status" in ('em_formacao', 'aguardando_entregador', 'concluida'));--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_fechada_por_status" CHECK (("saidas_entrega"."status" = 'em_formacao') = ("saidas_entrega"."fechada_em" is null));--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_iniciada_por_status" CHECK ("saidas_entrega"."iniciada_em" is null or "saidas_entrega"."status" in ('em_andamento', 'concluida'));--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_concluida_por_status" CHECK (("saidas_entrega"."status" = 'concluida') = ("saidas_entrega"."concluida_em" is not null));
