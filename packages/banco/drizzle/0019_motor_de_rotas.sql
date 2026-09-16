CREATE TYPE "public"."estado_rota_saida" AS ENUM('percurso_real', 'aproximacao_local');--> statement-breakpoint
CREATE TYPE "public"."operacao_roteamento" AS ENUM('otimizacao', 'percurso');--> statement-breakpoint
CREATE TYPE "public"."resultado_roteamento" AS ENUM('sucesso', 'falha', 'nao_aplicavel');--> statement-breakpoint
CREATE TABLE "consumos_roteamento" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"saida_id" uuid,
	"provedor" text NOT NULL,
	"operacao" "operacao_roteamento" NOT NULL,
	"resultado" "resultado_roteamento" NOT NULL,
	"paradas" integer NOT NULL,
	"motivo" text,
	"duracao_ms" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "origem_latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "origem_longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_estado" "estado_rota_saida";--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_motivo_fallback" text;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_provedor" text;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_sequencia_do_provedor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_geometria" jsonb;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_distancia_metros" integer;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_duracao_segundos" integer;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_calculada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD COLUMN "rota_versao_sequencia" integer;--> statement-breakpoint
ALTER TABLE "consumos_roteamento" ADD CONSTRAINT "consumos_roteamento_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consumos_roteamento_empresa_criado_em_idx" ON "consumos_roteamento" USING btree ("empresa_id","criado_em");--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_origem_completa" CHECK (("saidas_entrega"."origem_latitude" is null) = ("saidas_entrega"."origem_longitude" is null));--> statement-breakpoint
ALTER TABLE "saidas_entrega" ADD CONSTRAINT "saidas_entrega_percurso_por_estado" CHECK ("saidas_entrega"."rota_estado" is distinct from 'aproximacao_local' or ("saidas_entrega"."rota_geometria" is null and "saidas_entrega"."rota_distancia_metros" is null and "saidas_entrega"."rota_duracao_segundos" is null));
