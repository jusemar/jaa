CREATE TABLE "recusas_saida" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"saida_id" uuid NOT NULL,
	"entregador_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"recusada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recusas_saida" ADD CONSTRAINT "recusas_saida_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recusas_saida" ADD CONSTRAINT "recusas_saida_saida_da_empresa_fk" FOREIGN KEY ("saida_id","empresa_id") REFERENCES "public"."saidas_entrega"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recusas_saida" ADD CONSTRAINT "recusas_saida_entregador_da_empresa_fk" FOREIGN KEY ("entregador_id","empresa_id") REFERENCES "public"."entregadores_empresa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recusas_saida_saida_entregador_unico" ON "recusas_saida" USING btree ("saida_id","entregador_id");--> statement-breakpoint
CREATE INDEX "recusas_saida_entregador_id_idx" ON "recusas_saida" USING btree ("entregador_id","id");