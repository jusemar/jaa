CREATE TYPE "public"."status_empresa" AS ENUM('ativa');--> statement-breakpoint
CREATE TYPE "public"."papel_membro_empresa" AS ENUM('proprietario');--> statement-breakpoint
ALTER TYPE "public"."tipo_identidade" ADD VALUE 'empresarial';--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"status" "status_empresa" DEFAULT 'ativa' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_slug_formato" CHECK ("empresas"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("empresas"."slug") between 3 and 60)
);
--> statement-breakpoint
CREATE TABLE "membros_empresa" (
	"empresa_id" uuid NOT NULL,
	"usuario_id" text NOT NULL,
	"papel" "papel_membro_empresa" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membros_empresa_pk" PRIMARY KEY("empresa_id","usuario_id")
);
--> statement-breakpoint
ALTER TABLE "identidades" ALTER COLUMN "usuario_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identidades" ADD COLUMN "empresa_id" uuid;--> statement-breakpoint
ALTER TABLE "membros_empresa" ADD CONSTRAINT "membros_empresa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros_empresa" ADD CONSTRAINT "membros_empresa_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "empresas_slug_unico" ON "empresas" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "membros_empresa_usuario_id_empresa_id_idx" ON "membros_empresa" USING btree ("usuario_id","empresa_id");--> statement-breakpoint
ALTER TABLE "identidades" ADD CONSTRAINT "identidades_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identidades_empresarial_por_empresa_unico" ON "identidades" USING btree ("empresa_id") WHERE "identidades"."empresa_id" is not null;--> statement-breakpoint
ALTER TABLE "identidades" ADD CONSTRAINT "identidades_dono_por_tipo" CHECK (("identidades"."tipo"::text = 'pessoal' and "identidades"."usuario_id" is not null and "identidades"."empresa_id" is null) or ("identidades"."tipo"::text = 'empresarial' and "identidades"."empresa_id" is not null and "identidades"."usuario_id" is null));--> statement-breakpoint
-- Integridade da fundação da empresa, verificada no COMMIT (constraint trigger diferido):
-- toda empresa criada precisa, na mesma transação, da sua identidade empresarial e de um proprietário.
-- Assim nenhuma falha parcial deixa empresa órfã. (Identidade empresarial sem empresa já é impedida
-- por NOT NULL condicional + FK em identidades.) Comparações como texto: valores de enum criados
-- nesta mesma migration ainda não podem ser usados como literais do tipo.
CREATE FUNCTION "public"."empresas_verificar_fundacao"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "public"."empresas" WHERE "id" = NEW."id") THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "public"."identidades" WHERE "empresa_id" = NEW."id" AND "tipo"::text = 'empresarial'
  ) THEN
    RAISE EXCEPTION 'empresa % sem identidade empresarial', NEW."id"
      USING ERRCODE = '23514', CONSTRAINT = 'empresas_exige_identidade_empresarial';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "public"."membros_empresa" WHERE "empresa_id" = NEW."id" AND "papel"::text = 'proprietario'
  ) THEN
    RAISE EXCEPTION 'empresa % sem proprietário', NEW."id"
      USING ERRCODE = '23514', CONSTRAINT = 'empresas_exige_proprietario';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "empresas_exige_fundacao_completa"
  AFTER INSERT ON "public"."empresas"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "public"."empresas_verificar_fundacao"();
