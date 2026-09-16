CREATE TABLE "bases_empresa" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"cep" text NOT NULL,
	"logradouro" text NOT NULL,
	"numero" text NOT NULL,
	"complemento" text,
	"bairro" text NOT NULL,
	"cidade" text NOT NULL,
	"uf" text NOT NULL,
	"ponto_referencia" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"localizacao_confirmada_em" timestamp with time zone,
	"raio_metros" integer DEFAULT 150 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bases_empresa_localizacao_completa" CHECK (("bases_empresa"."latitude" is null and "bases_empresa"."longitude" is null and "bases_empresa"."localizacao_confirmada_em" is null) or ("bases_empresa"."latitude" is not null and "bases_empresa"."longitude" is not null and "bases_empresa"."localizacao_confirmada_em" is not null)),
	CONSTRAINT "bases_empresa_latitude_valida" CHECK ("bases_empresa"."latitude" is null or "bases_empresa"."latitude" between -90 and 90),
	CONSTRAINT "bases_empresa_longitude_valida" CHECK ("bases_empresa"."longitude" is null or "bases_empresa"."longitude" between -180 and 180),
	CONSTRAINT "bases_empresa_raio_valido" CHECK ("bases_empresa"."raio_metros" between 30 and 2000),
	CONSTRAINT "bases_empresa_uf_valida" CHECK ("bases_empresa"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "bases_empresa_cep_valido" CHECK ("bases_empresa"."cep" ~ '^[0-9]{8}$')
);
--> statement-breakpoint
CREATE TABLE "historico_fila_entregador" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entregador_id" uuid NOT NULL,
	"entrou_em" timestamp with time zone DEFAULT now() NOT NULL,
	"saiu_em" timestamp with time zone,
	"motivo_saida" text
);
--> statement-breakpoint
ALTER TABLE "entregadores_empresa" ADD COLUMN "na_base" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "entregadores_empresa" ADD COLUMN "presenca_atualizada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entregadores_empresa" ADD COLUMN "ultima_leitura_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entregadores_empresa" ADD COLUMN "leituras_consecutivas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "entregadores_empresa" ADD COLUMN "fila_entrou_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entregadores_empresa" ADD COLUMN "apto_para_saida" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bases_empresa" ADD CONSTRAINT "bases_empresa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_fila_entregador" ADD CONSTRAINT "historico_fila_entregador_entregador_id_entregadores_empresa_id_fk" FOREIGN KEY ("entregador_id") REFERENCES "public"."entregadores_empresa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historico_fila_entregador_entregador_id_id_idx" ON "historico_fila_entregador" USING btree ("entregador_id","id");--> statement-breakpoint
CREATE INDEX "entregadores_empresa_fila_idx" ON "entregadores_empresa" USING btree ("empresa_id","fila_entrou_em");--> statement-breakpoint
ALTER TABLE "entregadores_empresa" ADD CONSTRAINT "entregadores_empresa_fila_exige_presenca" CHECK ("entregadores_empresa"."fila_entrou_em" is null or ("entregadores_empresa"."disponivel" and "entregadores_empresa"."na_base"));