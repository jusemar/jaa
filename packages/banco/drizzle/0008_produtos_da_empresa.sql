CREATE TYPE "public"."disponibilidade_produto" AS ENUM('disponivel', 'indisponivel');--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"preco_centavos" integer NOT NULL,
	"disponibilidade" "disponibilidade_produto" DEFAULT 'disponivel' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_nome_valido" CHECK (char_length("produtos"."nome") between 1 and 120 and "produtos"."nome" = btrim("produtos"."nome")),
	CONSTRAINT "produtos_descricao_valida" CHECK ("produtos"."descricao" is null or (char_length("produtos"."descricao") between 1 and 1000 and "produtos"."descricao" = btrim("produtos"."descricao"))),
	CONSTRAINT "produtos_preco_centavos_valido" CHECK ("produtos"."preco_centavos" between 1 and 99999999)
);
--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "produtos_empresa_id_criado_em_idx" ON "produtos" USING btree ("empresa_id","criado_em");--> statement-breakpoint
-- Produto pertence para sempre à empresa em que foi criado: nenhuma edição (nem SQL direto pela
-- aplicação) pode movê-lo para outra empresa. Transferência, se um dia existir, será fluxo explícito.
CREATE FUNCTION "public"."produtos_impedir_troca_de_empresa"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."empresa_id" IS DISTINCT FROM OLD."empresa_id" THEN
    RAISE EXCEPTION 'produto % não pode trocar de empresa', OLD."id"
      USING ERRCODE = '23514', CONSTRAINT = 'produtos_empresa_imutavel';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "produtos_empresa_imutavel"
  BEFORE UPDATE OF "empresa_id" ON "public"."produtos"
  FOR EACH ROW EXECUTE FUNCTION "public"."produtos_impedir_troca_de_empresa"();
