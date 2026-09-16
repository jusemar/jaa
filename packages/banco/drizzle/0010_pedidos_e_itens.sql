CREATE TYPE "public"."forma_pagamento_entrega" AS ENUM('dinheiro', 'cartao');
--> statement-breakpoint
CREATE TYPE "public"."origem_pedido" AS ENUM('conversa');
--> statement-breakpoint
CREATE TYPE "public"."status_pedido" AS ENUM('recebido', 'confirmado', 'em_preparacao', 'pronto', 'saiu_para_entrega', 'em_rota', 'entregue');
--> statement-breakpoint
ALTER TYPE "public"."tipo_mensagem" ADD VALUE 'pedido';
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cliente_identidade_id" uuid NOT NULL,
	"origem" "origem_pedido" NOT NULL,
	"conversa_id" uuid,
	"status" "status_pedido" DEFAULT 'recebido' NOT NULL,
	"forma_pagamento_na_entrega" "forma_pagamento_entrega" NOT NULL,
	"troco_para_centavos" integer,
	"total_centavos" integer NOT NULL,
	"id_cliente" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_total_valido" CHECK ("pedidos"."total_centavos" between 1 and 999999999),
	CONSTRAINT "pedidos_troco_por_forma" CHECK (("pedidos"."forma_pagamento_na_entrega" = 'cartao' and "pedidos"."troco_para_centavos" is null) or ("pedidos"."forma_pagamento_na_entrega" = 'dinheiro' and ("pedidos"."troco_para_centavos" is null or "pedidos"."troco_para_centavos" > "pedidos"."total_centavos"))),
	CONSTRAINT "pedidos_conversa_por_origem" CHECK ("pedidos"."origem"::text <> 'conversa' or "pedidos"."conversa_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "itens_pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid,
	"nome_produto" text NOT NULL,
	"preco_unitario_centavos" integer NOT NULL,
	"quantidade" integer NOT NULL,
	"subtotal_centavos" integer NOT NULL,
	CONSTRAINT "itens_pedido_quantidade_valida" CHECK ("itens_pedido"."quantidade" between 1 and 99),
	CONSTRAINT "itens_pedido_preco_valido" CHECK ("itens_pedido"."preco_unitario_centavos" between 1 and 99999999),
	CONSTRAINT "itens_pedido_nome_valido" CHECK (char_length("itens_pedido"."nome_produto") between 1 and 120),
	CONSTRAINT "itens_pedido_subtotal_coerente" CHECK ("itens_pedido"."subtotal_centavos" = "itens_pedido"."preco_unitario_centavos" * "itens_pedido"."quantidade")
);
--> statement-breakpoint
ALTER TABLE "mensagens" DROP CONSTRAINT "mensagens_conteudo_texto_valido";
--> statement-breakpoint
ALTER TABLE "mensagens" ADD COLUMN "pedido_id" uuid;
--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_identidade_id_identidades_id_fk" FOREIGN KEY ("cliente_identidade_id") REFERENCES "public"."identidades"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_participante_fk" FOREIGN KEY ("conversa_id","cliente_identidade_id") REFERENCES "public"."participantes_conversa"("conversa_id","identidade_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_empresa_id_id_unico" ON "produtos" USING btree ("empresa_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_id_empresa_id_unico" ON "pedidos" USING btree ("id","empresa_id");
--> statement-breakpoint
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_pedido_fk" FOREIGN KEY ("pedido_id","empresa_id") REFERENCES "public"."pedidos"("id","empresa_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_produto_da_empresa_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_id_cliente_por_identidade_unico" ON "pedidos" USING btree ("cliente_identidade_id","id_cliente");
--> statement-breakpoint
CREATE INDEX "pedidos_empresa_id_id_idx" ON "pedidos" USING btree ("empresa_id","id");
--> statement-breakpoint
CREATE INDEX "pedidos_cliente_identidade_id_id_idx" ON "pedidos" USING btree ("cliente_identidade_id","id");
--> statement-breakpoint
CREATE INDEX "itens_pedido_pedido_id_idx" ON "itens_pedido" USING btree ("pedido_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "itens_pedido_produto_por_pedido_unico" ON "itens_pedido" USING btree ("pedido_id","produto_id") WHERE "itens_pedido"."produto_id" is not null;
--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_pedido_por_tipo" CHECK (("mensagens"."tipo"::text = 'pedido') = ("mensagens"."pedido_id" is not null));
--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conteudo_texto_valido" CHECK (("mensagens"."excluida_para_todos_em" is not null and "mensagens"."conteudo" = '') or ("mensagens"."excluida_para_todos_em" is null and "mensagens"."tipo"::text = 'texto' and char_length("mensagens"."conteudo") between 1 and 4000 and "mensagens"."conteudo" ~ '[^[:space:]]') or ("mensagens"."excluida_para_todos_em" is null and "mensagens"."tipo"::text = 'pedido' and "mensagens"."conteudo" = ''));
