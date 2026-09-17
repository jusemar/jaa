CREATE TYPE "public"."status_escolhido" AS ENUM('disponivel', 'ocupado', 'ausente', 'invisivel');--> statement-breakpoint
CREATE TYPE "public"."visibilidade_perfil" AS ENUM('todos', 'contatos', 'ninguem');--> statement-breakpoint
CREATE TYPE "public"."decisao_privacidade" AS ENUM('permitir', 'bloquear');--> statement-breakpoint
CREATE TABLE "categorias_produto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"posicao" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_produto_nome_valido" CHECK (char_length("categorias_produto"."nome") between 1 and 60 and "categorias_produto"."nome" = btrim("categorias_produto"."nome")),
	CONSTRAINT "categorias_produto_posicao_valida" CHECK ("categorias_produto"."posicao" between 0 and 9999)
);
--> statement-breakpoint
CREATE TABLE "excecoes_privacidade" (
	"identidade_id" uuid NOT NULL,
	"alvo_identidade_id" uuid NOT NULL,
	"decisao" "decisao_privacidade" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "excecoes_privacidade_identidade_id_alvo_identidade_id_pk" PRIMARY KEY("identidade_id","alvo_identidade_id"),
	CONSTRAINT "excecoes_privacidade_nao_e_voce" CHECK ("excecoes_privacidade"."identidade_id" <> "excecoes_privacidade"."alvo_identidade_id")
);
--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "categoria_id" uuid;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "imagem_chave" text;--> statement-breakpoint
ALTER TABLE "identidades" ADD COLUMN "foto_chave" text;--> statement-breakpoint
ALTER TABLE "identidades" ADD COLUMN "frase_status" text;--> statement-breakpoint
ALTER TABLE "identidades" ADD COLUMN "cidade" text;--> statement-breakpoint
ALTER TABLE "identidades" ADD COLUMN "sobre" text;--> statement-breakpoint
ALTER TABLE "preferencias_identidade" ADD COLUMN "status_escolhido" "status_escolhido" DEFAULT 'disponivel' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_identidade" ADD COLUMN "visibilidade_foto" "visibilidade_perfil" DEFAULT 'todos' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_identidade" ADD COLUMN "visibilidade_status" "visibilidade_perfil" DEFAULT 'contatos' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_identidade" ADD COLUMN "visibilidade_presenca" "visibilidade_perfil" DEFAULT 'contatos' NOT NULL;--> statement-breakpoint
ALTER TABLE "categorias_produto" ADD CONSTRAINT "categorias_produto_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excecoes_privacidade" ADD CONSTRAINT "excecoes_privacidade_identidade_id_identidades_id_fk" FOREIGN KEY ("identidade_id") REFERENCES "public"."identidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excecoes_privacidade" ADD CONSTRAINT "excecoes_privacidade_alvo_identidade_id_identidades_id_fk" FOREIGN KEY ("alvo_identidade_id") REFERENCES "public"."identidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categorias_produto_empresa_posicao_idx" ON "categorias_produto" USING btree ("empresa_id","posicao");--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_produto_nome_por_empresa_unico" ON "categorias_produto" USING btree ("empresa_id",lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_produto_empresa_id_id_unico" ON "categorias_produto" USING btree ("empresa_id","id");--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_da_empresa_fk" FOREIGN KEY ("empresa_id","categoria_id") REFERENCES "public"."categorias_produto"("empresa_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_imagem_chave_valida" CHECK ("produtos"."imagem_chave" is null or char_length("produtos"."imagem_chave") between 1 and 300);--> statement-breakpoint
ALTER TABLE "identidades" ADD CONSTRAINT "identidades_frase_status_valida" CHECK ("identidades"."frase_status" is null or (char_length("identidades"."frase_status") between 1 and 140 and "identidades"."frase_status" = btrim("identidades"."frase_status")));--> statement-breakpoint
ALTER TABLE "identidades" ADD CONSTRAINT "identidades_cidade_valida" CHECK ("identidades"."cidade" is null or (char_length("identidades"."cidade") between 1 and 80 and "identidades"."cidade" = btrim("identidades"."cidade")));--> statement-breakpoint
ALTER TABLE "identidades" ADD CONSTRAINT "identidades_sobre_valido" CHECK ("identidades"."sobre" is null or (char_length("identidades"."sobre") between 1 and 500 and "identidades"."sobre" = btrim("identidades"."sobre")));--> statement-breakpoint
ALTER TABLE "identidades" ADD CONSTRAINT "identidades_foto_chave_valida" CHECK ("identidades"."foto_chave" is null or char_length("identidades"."foto_chave") between 1 and 300);