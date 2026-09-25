CREATE TABLE "grupos_opcoes_produto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"instrucao" text,
	"minimo_escolhas" integer DEFAULT 0 NOT NULL,
	"maximo_escolhas" integer DEFAULT 1 NOT NULL,
	"posicao" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grupos_opcoes_produto_nome_valido" CHECK (char_length("grupos_opcoes_produto"."nome") between 1 and 80 and "grupos_opcoes_produto"."nome" = btrim("grupos_opcoes_produto"."nome")),
	CONSTRAINT "grupos_opcoes_produto_instrucao_valida" CHECK ("grupos_opcoes_produto"."instrucao" is null or (char_length("grupos_opcoes_produto"."instrucao") between 1 and 200 and "grupos_opcoes_produto"."instrucao" = btrim("grupos_opcoes_produto"."instrucao"))),
	CONSTRAINT "grupos_opcoes_produto_faixa_valida" CHECK ("grupos_opcoes_produto"."maximo_escolhas" between 1 and 50 and "grupos_opcoes_produto"."minimo_escolhas" between 0 and "grupos_opcoes_produto"."maximo_escolhas"),
	CONSTRAINT "grupos_opcoes_produto_posicao_valida" CHECK ("grupos_opcoes_produto"."posicao" between 0 and 9999)
);
--> statement-breakpoint
CREATE TABLE "opcoes_produto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"preco_adicional_centavos" integer DEFAULT 0 NOT NULL,
	"disponibilidade" "disponibilidade_produto" DEFAULT 'disponivel' NOT NULL,
	"posicao" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opcoes_produto_nome_valido" CHECK (char_length("opcoes_produto"."nome") between 1 and 80 and "opcoes_produto"."nome" = btrim("opcoes_produto"."nome")),
	CONSTRAINT "opcoes_produto_preco_adicional_valido" CHECK ("opcoes_produto"."preco_adicional_centavos" between 0 and 99999999),
	CONSTRAINT "opcoes_produto_posicao_valida" CHECK ("opcoes_produto"."posicao" between 0 and 9999)
);
--> statement-breakpoint
CREATE TABLE "escolhas_item_pedido" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_pedido_id" uuid NOT NULL,
	"opcao_id" uuid,
	"grupo_nome" text NOT NULL,
	"opcao_nome" text NOT NULL,
	"preco_adicional_centavos" integer NOT NULL,
	"posicao" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "escolhas_item_pedido_grupo_nome_valido" CHECK (char_length("escolhas_item_pedido"."grupo_nome") between 1 and 80),
	CONSTRAINT "escolhas_item_pedido_opcao_nome_valido" CHECK (char_length("escolhas_item_pedido"."opcao_nome") between 1 and 80),
	CONSTRAINT "escolhas_item_pedido_preco_adicional_valido" CHECK ("escolhas_item_pedido"."preco_adicional_centavos" between 0 and 99999999)
);
--> statement-breakpoint
/*
 * Com personalização, dois itens do MESMO produto com montagens diferentes são legítimos (preços
 * unitários diferentes), então "um item por produto no pedido" deixa de valer. Quem soma quantidades
 * de configurações IGUAIS é o carrinho; o servidor recusa a repetição exata (produto + mesmas opções).
 */
DROP INDEX "itens_pedido_produto_por_pedido_unico";--> statement-breakpoint
CREATE INDEX "grupos_opcoes_produto_produto_posicao_idx" ON "grupos_opcoes_produto" USING btree ("produto_id","posicao");--> statement-breakpoint
CREATE UNIQUE INDEX "grupos_opcoes_produto_empresa_id_id_unico" ON "grupos_opcoes_produto" USING btree ("empresa_id","id");--> statement-breakpoint
CREATE INDEX "opcoes_produto_grupo_posicao_idx" ON "opcoes_produto" USING btree ("grupo_id","posicao");--> statement-breakpoint
CREATE UNIQUE INDEX "opcoes_produto_empresa_id_id_unico" ON "opcoes_produto" USING btree ("empresa_id","id");--> statement-breakpoint
CREATE INDEX "escolhas_item_pedido_item_idx" ON "escolhas_item_pedido" USING btree ("item_pedido_id","posicao");--> statement-breakpoint
ALTER TABLE "grupos_opcoes_produto" ADD CONSTRAINT "grupos_opcoes_produto_produto_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opcoes_produto" ADD CONSTRAINT "opcoes_produto_grupo_fk" FOREIGN KEY ("empresa_id","grupo_id") REFERENCES "public"."grupos_opcoes_produto"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escolhas_item_pedido" ADD CONSTRAINT "escolhas_item_pedido_item_pedido_id_itens_pedido_id_fk" FOREIGN KEY ("item_pedido_id") REFERENCES "public"."itens_pedido"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escolhas_item_pedido" ADD CONSTRAINT "escolhas_item_pedido_opcao_id_opcoes_produto_id_fk" FOREIGN KEY ("opcao_id") REFERENCES "public"."opcoes_produto"("id") ON DELETE set null ON UPDATE no action;
