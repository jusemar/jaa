ALTER TYPE "public"."status_pedido" ADD VALUE 'cancelado';--> statement-breakpoint
CREATE TABLE "historico_status_pedido" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"status" "status_pedido" NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"operador_usuario_id" text,
	"motivo" text,
	CONSTRAINT "historico_status_pedido_motivo_por_status" CHECK (("historico_status_pedido"."motivo" is null or "historico_status_pedido"."status"::text = 'cancelado') and ("historico_status_pedido"."motivo" is null or char_length("historico_status_pedido"."motivo") between 3 and 200))
);
--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "motivo_cancelamento" text;--> statement-breakpoint
ALTER TABLE "historico_status_pedido" ADD CONSTRAINT "historico_status_pedido_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_status_pedido" ADD CONSTRAINT "historico_status_pedido_operador_usuario_id_users_id_fk" FOREIGN KEY ("operador_usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historico_status_pedido_pedido_id_id_idx" ON "historico_status_pedido" USING btree ("pedido_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "historico_status_pedido_status_unico" ON "historico_status_pedido" USING btree ("pedido_id","status");--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_motivo_por_status" CHECK (("pedidos"."status"::text = 'cancelado') = ("pedidos"."motivo_cancelamento" is not null) and ("pedidos"."motivo_cancelamento" is null or char_length("pedidos"."motivo_cancelamento") between 3 and 200));
--> statement-breakpoint
-- Backfill: pedidos criados antes do histórico passam a ter o evento inicial que sempre existiu de
-- fato ("recebido", no momento da criação). Daqui em diante a criação já grava o evento.
INSERT INTO "historico_status_pedido" ("pedido_id", "status", "ocorrido_em")
SELECT "id", 'recebido', "criado_em" FROM "pedidos"
WHERE NOT EXISTS (SELECT 1 FROM "historico_status_pedido" WHERE "historico_status_pedido"."pedido_id" = "pedidos"."id");
