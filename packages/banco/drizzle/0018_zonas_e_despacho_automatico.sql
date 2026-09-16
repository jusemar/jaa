ALTER TYPE "public"."status_saida_entrega" ADD VALUE IF NOT EXISTS 'em_formacao' BEFORE 'preparada';--> statement-breakpoint
ALTER TYPE "public"."status_saida_entrega" ADD VALUE IF NOT EXISTS 'aguardando_entregador' BEFORE 'preparada';--> statement-breakpoint
CREATE TABLE "compatibilidades_zona" (
	"empresa_id" uuid NOT NULL,
	"zona_menor_id" uuid NOT NULL,
	"zona_maior_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compatibilidades_zona_pk" PRIMARY KEY("zona_menor_id","zona_maior_id"),
	CONSTRAINT "compatibilidades_zona_par_normalizado" CHECK ("compatibilidades_zona"."zona_menor_id" < "compatibilidades_zona"."zona_maior_id")
);--> statement-breakpoint
CREATE TABLE "zonas_entrega" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"vertices" jsonb NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zonas_entrega_nome_valido" CHECK (length(btrim("zonas_entrega"."nome")) between 1 and 60),
	CONSTRAINT "zonas_entrega_poligono_minimo" CHECK (jsonb_typeof("zonas_entrega"."vertices") = 'array' and jsonb_array_length("zonas_entrega"."vertices") between 3 and 60)
);--> statement-breakpoint
CREATE UNIQUE INDEX "zonas_entrega_id_empresa_id_unico" ON "zonas_entrega" USING btree ("id","empresa_id");--> statement-breakpoint
CREATE TABLE "configuracoes_despacho" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"max_pedidos_por_saida" integer DEFAULT 5 NOT NULL,
	"tempo_formacao_minutos" integer DEFAULT 15 NOT NULL,
	"combinar_zonas" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracoes_despacho_maximo_valido" CHECK ("configuracoes_despacho"."max_pedidos_por_saida" between 1 and 15),
	CONSTRAINT "configuracoes_despacho_tempo_valido" CHECK ("configuracoes_despacho"."tempo_formacao_minutos" between 1 and 180)
);--> statement-breakpoint
ALTER TABLE "saidas_entrega" DROP CONSTRAINT "saidas_entrega_iniciada_por_status";--> statement-breakpoint
ALTER TABLE "saidas_entrega" ALTER COLUMN "entregador_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "zona_principal_id" uuid;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "automatica" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "formacao_iniciada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "prazo_formacao_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "fechada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "atribuida_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "compatibilidades_zona" ADD CONSTRAINT "compatibilidades_zona_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibilidades_zona" ADD CONSTRAINT "compatibilidades_zona_zona_menor_id_zonas_entrega_id_fk" FOREIGN KEY ("zona_menor_id") REFERENCES "public"."zonas_entrega"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibilidades_zona" ADD CONSTRAINT "compatibilidades_zona_zona_maior_id_zonas_entrega_id_fk" FOREIGN KEY ("zona_maior_id") REFERENCES "public"."zonas_entrega"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibilidades_zona" ADD CONSTRAINT "compatibilidades_zona_menor_da_empresa_fk" FOREIGN KEY ("zona_menor_id","empresa_id") REFERENCES "public"."zonas_entrega"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibilidades_zona" ADD CONSTRAINT "compatibilidades_zona_maior_da_empresa_fk" FOREIGN KEY ("zona_maior_id","empresa_id") REFERENCES "public"."zonas_entrega"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zonas_entrega" ADD CONSTRAINT "zonas_entrega_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_despacho" ADD CONSTRAINT "configuracoes_despacho_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compatibilidades_zona_empresa_idx" ON "compatibilidades_zona" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zonas_entrega_nome_por_empresa_unico" ON "zonas_entrega" USING btree ("empresa_id",lower("nome"));--> statement-breakpoint
CREATE INDEX "zonas_entrega_empresa_id_idx" ON "zonas_entrega" USING btree ("empresa_id","ativa");--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_zona_principal_id_zonas_entrega_id_fk" FOREIGN KEY ("zona_principal_id") REFERENCES "public"."zonas_entrega"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_zona_da_empresa_fk" FOREIGN KEY ("zona_principal_id","empresa_id") REFERENCES "public"."zonas_entrega"("id","empresa_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "saidas_entrega" SET "fechada_em" = "criado_em" WHERE "fechada_em" is null;--> statement-breakpoint
UPDATE "saidas_entrega" SET "atribuida_em" = "criado_em" WHERE "atribuida_em" is null and "entregador_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "saidas_entrega_formacao_por_zona_unico" ON "saidas_entrega" USING btree ("empresa_id","zona_principal_id") WHERE "saidas_entrega"."fechada_em" is null;--> statement-breakpoint
CREATE INDEX "saidas_entrega_prazo_formacao_idx" ON "saidas_entrega" USING btree ("prazo_formacao_em") WHERE "saidas_entrega"."fechada_em" is null;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_entregador_por_status" CHECK ("saidas_entrega"."entregador_id" is not null or "saidas_entrega"."status"::text in ('em_formacao', 'aguardando_entregador', 'concluida'));--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_atribuida_com_entregador" CHECK ("saidas_entrega"."atribuida_em" is null or "saidas_entrega"."entregador_id" is not null);--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_fechada_por_status" CHECK (("saidas_entrega"."status"::text = 'em_formacao') = ("saidas_entrega"."fechada_em" is null));--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_iniciada_por_status" CHECK ("saidas_entrega"."iniciada_em" is null or "saidas_entrega"."status"::text in ('em_andamento', 'concluida'));
