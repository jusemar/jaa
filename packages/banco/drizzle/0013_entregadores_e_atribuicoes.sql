CREATE TYPE "public"."status_entregador" AS ENUM('convidado', 'ativo', 'inativo');
--> statement-breakpoint
CREATE TABLE "entregadores_empresa" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" text NOT NULL,
	"status" "status_entregador" DEFAULT 'convidado' NOT NULL,
	"convidado_por_usuario_id" text,
	"convidado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"respondido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atribuicoes_entrega" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"entregador_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"atribuido_por_usuario_id" text,
	"atribuido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrado_em" timestamp with time zone,
	"motivo_encerramento" text,
	CONSTRAINT "atribuicoes_entrega_motivo_por_encerramento" CHECK ("atribuicoes_entrega"."motivo_encerramento" is null or "atribuicoes_entrega"."encerrado_em" is not null)
);
--> statement-breakpoint
ALTER TABLE "entregadores_empresa" ADD CONSTRAINT "entregadores_empresa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entregadores_empresa" ADD CONSTRAINT "entregadores_empresa_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entregadores_empresa" ADD CONSTRAINT "entregadores_empresa_convidado_por_usuario_id_users_id_fk" FOREIGN KEY ("convidado_por_usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "atribuicoes_entrega" ADD CONSTRAINT "atribuicoes_entrega_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "atribuicoes_entrega" ADD CONSTRAINT "atribuicoes_entrega_entregador_id_entregadores_empresa_id_fk" FOREIGN KEY ("entregador_id") REFERENCES "public"."entregadores_empresa"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "atribuicoes_entrega" ADD CONSTRAINT "atribuicoes_entrega_atribuido_por_usuario_id_users_id_fk" FOREIGN KEY ("atribuido_por_usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "atribuicoes_entrega" ADD CONSTRAINT "atribuicoes_entrega_pedido_da_empresa_fk" FOREIGN KEY ("pedido_id","empresa_id") REFERENCES "public"."pedidos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "entregadores_empresa_id_empresa_id_unico" ON "entregadores_empresa" USING btree ("id","empresa_id");
--> statement-breakpoint
ALTER TABLE "atribuicoes_entrega" ADD CONSTRAINT "atribuicoes_entrega_entregador_da_empresa_fk" FOREIGN KEY ("entregador_id","empresa_id") REFERENCES "public"."entregadores_empresa"("id","empresa_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "entregadores_empresa_unico" ON "entregadores_empresa" USING btree ("empresa_id","usuario_id");
--> statement-breakpoint
CREATE INDEX "entregadores_empresa_usuario_id_idx" ON "entregadores_empresa" USING btree ("usuario_id","empresa_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "atribuicoes_entrega_atual_unica" ON "atribuicoes_entrega" USING btree ("pedido_id") WHERE "atribuicoes_entrega"."encerrado_em" is null;
--> statement-breakpoint
CREATE INDEX "atribuicoes_entrega_pedido_id_id_idx" ON "atribuicoes_entrega" USING btree ("pedido_id","id");
--> statement-breakpoint
CREATE INDEX "atribuicoes_entrega_entregador_id_idx" ON "atribuicoes_entrega" USING btree ("entregador_id","id");
