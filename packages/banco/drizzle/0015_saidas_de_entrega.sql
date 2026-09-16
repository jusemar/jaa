CREATE TYPE "public"."status_saida_entrega" AS ENUM('preparada', 'em_andamento', 'concluida');
--> statement-breakpoint
CREATE TABLE "saidas_entrega" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"entregador_id" uuid NOT NULL,
	"status" "status_saida_entrega" DEFAULT 'preparada' NOT NULL,
	"versao_sequencia" integer DEFAULT 1 NOT NULL,
	"criada_por_usuario_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciada_em" timestamp with time zone,
	"concluida_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saidas_entrega_iniciada_por_status" CHECK (("saidas_entrega"."status" = 'preparada') = ("saidas_entrega"."iniciada_em" is null)),
	CONSTRAINT "saidas_entrega_concluida_por_status" CHECK (("saidas_entrega"."status" = 'concluida') = ("saidas_entrega"."concluida_em" is not null)),
	CONSTRAINT "saidas_entrega_versao_valida" CHECK ("saidas_entrega"."versao_sequencia" >= 1)
);
--> statement-breakpoint
CREATE TABLE "paradas_saida" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"saida_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"posicao" integer NOT NULL,
	"encerrada_em" timestamp with time zone,
	"motivo_encerramento" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paradas_saida_posicao_valida" CHECK ("paradas_saida"."posicao" >= 1),
	CONSTRAINT "paradas_saida_motivo_por_encerramento" CHECK ("paradas_saida"."motivo_encerramento" is null or "paradas_saida"."encerrada_em" is not null)
);
--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_entregador_id_entregadores_empresa_id_fk" FOREIGN KEY ("entregador_id") REFERENCES "public"."entregadores_empresa"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_criada_por_usuario_id_users_id_fk" FOREIGN KEY ("criada_por_usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_entregador_da_empresa_fk" FOREIGN KEY ("entregador_id","empresa_id") REFERENCES "public"."entregadores_empresa"("id","empresa_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "paradas_saida" ADD CONSTRAINT "paradas_saida_saida_id_saidas_entrega_id_fk" FOREIGN KEY ("saida_id") REFERENCES "public"."saidas_entrega"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "paradas_saida" ADD CONSTRAINT "paradas_saida_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "saidas_entrega_id_empresa_id_unico" ON "saidas_entrega" USING btree ("id","empresa_id");
--> statement-breakpoint
ALTER TABLE "paradas_saida" ADD CONSTRAINT "paradas_saida_saida_da_empresa_fk" FOREIGN KEY ("saida_id","empresa_id") REFERENCES "public"."saidas_entrega"("id","empresa_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "paradas_saida" ADD CONSTRAINT "paradas_saida_pedido_da_empresa_fk" FOREIGN KEY ("pedido_id","empresa_id") REFERENCES "public"."pedidos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "saidas_entrega_empresa_id_id_idx" ON "saidas_entrega" USING btree ("empresa_id","id");
--> statement-breakpoint
CREATE INDEX "saidas_entrega_entregador_id_id_idx" ON "saidas_entrega" USING btree ("entregador_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "paradas_saida_pedido_ativo_unico" ON "paradas_saida" USING btree ("pedido_id") WHERE "paradas_saida"."encerrada_em" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "paradas_saida_pedido_por_saida_unico" ON "paradas_saida" USING btree ("saida_id","pedido_id");
--> statement-breakpoint
CREATE INDEX "paradas_saida_saida_id_posicao_idx" ON "paradas_saida" USING btree ("saida_id","posicao");
