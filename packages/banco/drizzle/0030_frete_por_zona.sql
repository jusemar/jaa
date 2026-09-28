/*
 * FRETE POR ZONA — fundação (schema + snapshot no pedido). Nenhum dado existente muda de valor.
 *
 * `subtotal_centavos` é obrigatório, mas pedidos já existentes não têm frete separado: o total antigo
 * É a soma dos itens. Por isso a coluna nasce nula, é preenchida com o próprio total e só então vira
 * NOT NULL. Os campos de frete entram com default 0 e a zona fica nula (nenhuma foi aplicada), o que
 * mantém total = subtotal + frete final verdadeiro antes de o CHECK ser criado.
 */
ALTER TABLE "pedidos" ADD COLUMN "subtotal_centavos" integer;--> statement-breakpoint
UPDATE "pedidos" SET "subtotal_centavos" = "total_centavos";--> statement-breakpoint
ALTER TABLE "pedidos" ALTER COLUMN "subtotal_centavos" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "frete_original_centavos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "desconto_frete_centavos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "frete_final_centavos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "zona_entrega_id" uuid;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "zona_entrega_nome" text;--> statement-breakpoint
ALTER TABLE "zonas_entrega" ADD COLUMN "frete_centavos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_zona_entrega_id_zonas_entrega_id_fk" FOREIGN KEY ("zona_entrega_id") REFERENCES "public"."zonas_entrega"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_valores_entrega_validos" CHECK ("pedidos"."subtotal_centavos" between 1 and 999999999 and "pedidos"."frete_original_centavos" between 0 and 999999999 and "pedidos"."desconto_frete_centavos" between 0 and "pedidos"."frete_original_centavos" and "pedidos"."frete_final_centavos" = "pedidos"."frete_original_centavos" - "pedidos"."desconto_frete_centavos" and "pedidos"."total_centavos" = "pedidos"."subtotal_centavos" + "pedidos"."frete_final_centavos");--> statement-breakpoint
ALTER TABLE "zonas_entrega" ADD CONSTRAINT "zonas_entrega_frete_valido" CHECK ("zonas_entrega"."frete_centavos" between 0 and 999999999);