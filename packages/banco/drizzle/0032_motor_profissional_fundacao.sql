-- MOTOR PROFISSIONAL — Bloco 2: território (municípios IBGE, malha versionada), taxonomia de serviços,
-- perfil profissional, base, serviços do perfil e áreas de atuação. Só tabelas NOVAS + um índice único
-- (id, tipo) em identidades para a FK composta "perfil só de identidade pessoal". Nenhum dado existente
-- é alterado.
-- Ordem ajustada à mão (como na 0018): os índices únicos que servem de alvo às FKs compostas precisam
-- existir ANTES das FKs; o drizzle-kit os gera depois.
CREATE TYPE "public"."tipo_selecao_atributo" AS ENUM('unica', 'multipla');
--> statement-breakpoint
CREATE TYPE "public"."modalidade_area_atuacao" AS ENUM('raio', 'poligono', 'municipio');
--> statement-breakpoint
CREATE TABLE "malhas_municipio" (
	"codigo_ibge" text NOT NULL,
	"versao" text NOT NULL,
	"geometria" geometry(multipolygon,4326) NOT NULL,
	"fonte" text NOT NULL,
	"vigente" boolean DEFAULT false NOT NULL,
	"importado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "malhas_municipio_pk" PRIMARY KEY("codigo_ibge","versao"),
	CONSTRAINT "malhas_municipio_versao_valida" CHECK ("malhas_municipio"."versao" ~ '^[0-9]{4}$'),
	CONSTRAINT "malhas_municipio_geometria_valida" CHECK (ST_IsValid("malhas_municipio"."geometria") and not ST_IsEmpty("malhas_municipio"."geometria"))
);
--> statement-breakpoint
CREATE TABLE "municipios" (
	"codigo_ibge" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"uf" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "municipios_codigo_ibge_valido" CHECK ("municipios"."codigo_ibge" ~ '^[0-9]{7}$'),
	CONSTRAINT "municipios_uf_valida" CHECK ("municipios"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "municipios_nome_valido" CHECK (char_length("municipios"."nome") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "atributos_servico" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"servico_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"tipo_selecao" "tipo_selecao_atributo" DEFAULT 'multipla' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atributos_servico_slug_valido" CHECK ("atributos_servico"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("atributos_servico"."slug") between 2 and 60),
	CONSTRAINT "atributos_servico_nome_valido" CHECK (char_length("atributos_servico"."nome") between 1 and 80 and "atributos_servico"."nome" = btrim("atributos_servico"."nome"))
);
--> statement-breakpoint
CREATE TABLE "categorias_profissionais" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_profissionais_slug_valido" CHECK ("categorias_profissionais"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("categorias_profissionais"."slug") between 2 and 60),
	CONSTRAINT "categorias_profissionais_nome_valido" CHECK (char_length("categorias_profissionais"."nome") between 1 and 80 and "categorias_profissionais"."nome" = btrim("categorias_profissionais"."nome"))
);
--> statement-breakpoint
CREATE TABLE "especialidades_servico" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"servico_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "especialidades_servico_slug_valido" CHECK ("especialidades_servico"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("especialidades_servico"."slug") between 2 and 60),
	CONSTRAINT "especialidades_servico_nome_valido" CHECK (char_length("especialidades_servico"."nome") between 1 and 80 and "especialidades_servico"."nome" = btrim("especialidades_servico"."nome"))
);
--> statement-breakpoint
CREATE TABLE "opcoes_atributo" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"atributo_id" uuid NOT NULL,
	"servico_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opcoes_atributo_slug_valido" CHECK ("opcoes_atributo"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("opcoes_atributo"."slug") between 2 and 60),
	CONSTRAINT "opcoes_atributo_nome_valido" CHECK (char_length("opcoes_atributo"."nome") between 1 and 80 and "opcoes_atributo"."nome" = btrim("opcoes_atributo"."nome"))
);
--> statement-breakpoint
CREATE TABLE "servicos_profissionais" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"categoria_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"usa_disponibilidade_imediata" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servicos_profissionais_slug_valido" CHECK ("servicos_profissionais"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("servicos_profissionais"."slug") between 2 and 60),
	CONSTRAINT "servicos_profissionais_nome_valido" CHECK (char_length("servicos_profissionais"."nome") between 1 and 80 and "servicos_profissionais"."nome" = btrim("servicos_profissionais"."nome"))
);
--> statement-breakpoint
CREATE TABLE "termos_busca_servico" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"servico_id" uuid NOT NULL,
	"especialidade_id" uuid,
	"opcao_id" uuid,
	"termo" text NOT NULL,
	"termo_normalizado" text GENERATED ALWAYS AS (jaa_normalizar(termo)) STORED NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "termos_busca_servico_unico" UNIQUE NULLS NOT DISTINCT("termo_normalizado","servico_id","especialidade_id","opcao_id"),
	CONSTRAINT "termos_busca_servico_termo_valido" CHECK (char_length(btrim("termos_busca_servico"."termo")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "bases_profissionais" (
	"perfil_id" uuid PRIMARY KEY NOT NULL,
	"cep" text NOT NULL,
	"logradouro" text NOT NULL,
	"numero" text NOT NULL,
	"complemento" text,
	"bairro" text NOT NULL,
	"cidade" text NOT NULL,
	"uf" text NOT NULL,
	"ponto_referencia" text,
	"codigo_ibge" text,
	"ponto" geometry(point,4326),
	"localizacao_confirmada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bases_profissionais_localizacao_completa" CHECK (("bases_profissionais"."ponto" is null) = ("bases_profissionais"."localizacao_confirmada_em" is null)),
	CONSTRAINT "bases_profissionais_uf_valida" CHECK ("bases_profissionais"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "bases_profissionais_cep_valido" CHECK ("bases_profissionais"."cep" ~ '^[0-9]{8}$'),
	CONSTRAINT "bases_profissionais_codigo_ibge_valido" CHECK ("bases_profissionais"."codigo_ibge" is null or "bases_profissionais"."codigo_ibge" ~ '^[0-9]{7}$'),
	CONSTRAINT "bases_profissionais_textos_validos" CHECK (char_length("bases_profissionais"."logradouro") between 1 and 120 and char_length("bases_profissionais"."numero") between 1 and 20 and char_length("bases_profissionais"."bairro") between 1 and 80 and char_length("bases_profissionais"."cidade") between 1 and 80 and ("bases_profissionais"."complemento" is null or char_length("bases_profissionais"."complemento") between 1 and 60) and ("bases_profissionais"."ponto_referencia" is null or char_length("bases_profissionais"."ponto_referencia") between 1 and 160))
);
--> statement-breakpoint
CREATE TABLE "especialidades_servico_perfil" (
	"servico_perfil_id" uuid NOT NULL,
	"servico_id" uuid NOT NULL,
	"especialidade_id" uuid NOT NULL,
	CONSTRAINT "especialidades_servico_perfil_pk" PRIMARY KEY("servico_perfil_id","especialidade_id")
);
--> statement-breakpoint
CREATE TABLE "opcoes_servico_perfil" (
	"servico_perfil_id" uuid NOT NULL,
	"servico_id" uuid NOT NULL,
	"opcao_id" uuid NOT NULL,
	CONSTRAINT "opcoes_servico_perfil_pk" PRIMARY KEY("servico_perfil_id","opcao_id")
);
--> statement-breakpoint
CREATE TABLE "perfis_profissionais" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identidade_id" uuid NOT NULL,
	"identidade_tipo" "tipo_identidade" DEFAULT 'pessoal' NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"ativado_em" timestamp with time zone,
	"recebe_oportunidades_outras_regioes" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfis_profissionais_somente_pessoal" CHECK ("perfis_profissionais"."identidade_tipo"::text = 'pessoal'),
	CONSTRAINT "perfis_profissionais_ativacao_coerente" CHECK (not "perfis_profissionais"."ativo" or "perfis_profissionais"."ativado_em" is not null)
);
--> statement-breakpoint
CREATE TABLE "servicos_perfil" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"perfil_id" uuid NOT NULL,
	"servico_id" uuid NOT NULL,
	"disponivel" boolean DEFAULT false NOT NULL,
	"disponibilidade_atualizada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas_atuacao" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"perfil_id" uuid NOT NULL,
	"modalidade" "modalidade_area_atuacao" NOT NULL,
	"nome" text,
	"raio_metros" integer,
	"cobertura" geometry(multipolygon,4326),
	"codigo_ibge" text,
	"todos_os_servicos" boolean DEFAULT true NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "areas_atuacao_campos_por_modalidade" CHECK (("areas_atuacao"."modalidade"::text = 'raio' and "areas_atuacao"."raio_metros" is not null and "areas_atuacao"."cobertura" is null and "areas_atuacao"."codigo_ibge" is null)
       or ("areas_atuacao"."modalidade"::text = 'poligono' and "areas_atuacao"."cobertura" is not null and "areas_atuacao"."raio_metros" is null and "areas_atuacao"."codigo_ibge" is null)
       or ("areas_atuacao"."modalidade"::text = 'municipio' and "areas_atuacao"."codigo_ibge" is not null and "areas_atuacao"."raio_metros" is null and "areas_atuacao"."cobertura" is null)),
	CONSTRAINT "areas_atuacao_raio_positivo" CHECK ("areas_atuacao"."raio_metros" is null or "areas_atuacao"."raio_metros" > 0),
	CONSTRAINT "areas_atuacao_cobertura_valida" CHECK ("areas_atuacao"."cobertura" is null or (ST_IsValid("areas_atuacao"."cobertura") and not ST_IsEmpty("areas_atuacao"."cobertura"))),
	CONSTRAINT "areas_atuacao_nome_valido" CHECK ("areas_atuacao"."nome" is null or char_length("areas_atuacao"."nome") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "areas_atuacao_servicos" (
	"area_id" uuid NOT NULL,
	"perfil_id" uuid NOT NULL,
	"servico_perfil_id" uuid NOT NULL,
	CONSTRAINT "areas_atuacao_servicos_pk" PRIMARY KEY("area_id","servico_perfil_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "malhas_municipio_vigente_unica" ON "malhas_municipio" USING btree ("codigo_ibge") WHERE "malhas_municipio"."vigente";
--> statement-breakpoint
CREATE INDEX "malhas_municipio_geometria_gist" ON "malhas_municipio" USING gist ("geometria") WHERE "malhas_municipio"."vigente";
--> statement-breakpoint
CREATE UNIQUE INDEX "atributos_servico_slug_unico" ON "atributos_servico" USING btree ("servico_id","slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "atributos_servico_id_servico_unico" ON "atributos_servico" USING btree ("id","servico_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_profissionais_slug_unico" ON "categorias_profissionais" USING btree ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "especialidades_servico_slug_unico" ON "especialidades_servico" USING btree ("servico_id","slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "especialidades_servico_id_servico_unico" ON "especialidades_servico" USING btree ("id","servico_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "opcoes_atributo_slug_unico" ON "opcoes_atributo" USING btree ("atributo_id","slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "opcoes_atributo_id_servico_unico" ON "opcoes_atributo" USING btree ("id","servico_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "servicos_profissionais_slug_unico" ON "servicos_profissionais" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "servicos_profissionais_categoria_idx" ON "servicos_profissionais" USING btree ("categoria_id");
--> statement-breakpoint
CREATE INDEX "termos_busca_servico_trgm" ON "termos_busca_servico" USING gin ("termo_normalizado" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "bases_profissionais_ponto_gist" ON "bases_profissionais" USING gist (("ponto"::geography)) WHERE "bases_profissionais"."ponto" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "perfis_profissionais_identidade_unico" ON "perfis_profissionais" USING btree ("identidade_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "servicos_perfil_servico_por_perfil_unico" ON "servicos_perfil" USING btree ("perfil_id","servico_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "servicos_perfil_id_servico_unico" ON "servicos_perfil" USING btree ("id","servico_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "servicos_perfil_id_perfil_unico" ON "servicos_perfil" USING btree ("id","perfil_id");
--> statement-breakpoint
CREATE INDEX "servicos_perfil_servico_idx" ON "servicos_perfil" USING btree ("servico_id","perfil_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "areas_atuacao_id_perfil_unico" ON "areas_atuacao" USING btree ("id","perfil_id");
--> statement-breakpoint
CREATE INDEX "areas_atuacao_perfil_idx" ON "areas_atuacao" USING btree ("perfil_id");
--> statement-breakpoint
CREATE INDEX "areas_atuacao_cobertura_gist" ON "areas_atuacao" USING gist ("cobertura") WHERE "areas_atuacao"."modalidade" = 'poligono' and "areas_atuacao"."ativa";
--> statement-breakpoint
CREATE INDEX "areas_atuacao_municipio_idx" ON "areas_atuacao" USING btree ("codigo_ibge") WHERE "areas_atuacao"."modalidade" = 'municipio' and "areas_atuacao"."ativa";
--> statement-breakpoint
CREATE INDEX "areas_atuacao_servicos_servico_idx" ON "areas_atuacao_servicos" USING btree ("servico_perfil_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "identidades_id_tipo_unico" ON "identidades" USING btree ("id","tipo");
--> statement-breakpoint
ALTER TABLE "malhas_municipio" ADD CONSTRAINT "malhas_municipio_codigo_ibge_municipios_codigo_ibge_fk" FOREIGN KEY ("codigo_ibge") REFERENCES "public"."municipios"("codigo_ibge") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "atributos_servico" ADD CONSTRAINT "atributos_servico_servico_id_servicos_profissionais_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."servicos_profissionais"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "especialidades_servico" ADD CONSTRAINT "especialidades_servico_servico_id_servicos_profissionais_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."servicos_profissionais"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opcoes_atributo" ADD CONSTRAINT "opcoes_atributo_atributo_do_servico_fk" FOREIGN KEY ("atributo_id","servico_id") REFERENCES "public"."atributos_servico"("id","servico_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "servicos_profissionais" ADD CONSTRAINT "servicos_profissionais_categoria_id_categorias_profissionais_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_profissionais"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "termos_busca_servico" ADD CONSTRAINT "termos_busca_servico_servico_id_servicos_profissionais_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."servicos_profissionais"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "termos_busca_servico" ADD CONSTRAINT "termos_busca_servico_especialidade_do_servico_fk" FOREIGN KEY ("especialidade_id","servico_id") REFERENCES "public"."especialidades_servico"("id","servico_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "termos_busca_servico" ADD CONSTRAINT "termos_busca_servico_opcao_do_servico_fk" FOREIGN KEY ("opcao_id","servico_id") REFERENCES "public"."opcoes_atributo"("id","servico_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bases_profissionais" ADD CONSTRAINT "bases_profissionais_perfil_id_perfis_profissionais_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis_profissionais"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "especialidades_servico_perfil" ADD CONSTRAINT "especialidades_servico_perfil_servico_perfil_fk" FOREIGN KEY ("servico_perfil_id","servico_id") REFERENCES "public"."servicos_perfil"("id","servico_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "especialidades_servico_perfil" ADD CONSTRAINT "especialidades_servico_perfil_especialidade_fk" FOREIGN KEY ("especialidade_id","servico_id") REFERENCES "public"."especialidades_servico"("id","servico_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opcoes_servico_perfil" ADD CONSTRAINT "opcoes_servico_perfil_servico_perfil_fk" FOREIGN KEY ("servico_perfil_id","servico_id") REFERENCES "public"."servicos_perfil"("id","servico_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opcoes_servico_perfil" ADD CONSTRAINT "opcoes_servico_perfil_opcao_fk" FOREIGN KEY ("opcao_id","servico_id") REFERENCES "public"."opcoes_atributo"("id","servico_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD CONSTRAINT "perfis_profissionais_identidade_pessoal_fk" FOREIGN KEY ("identidade_id","identidade_tipo") REFERENCES "public"."identidades"("id","tipo") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "servicos_perfil" ADD CONSTRAINT "servicos_perfil_perfil_id_perfis_profissionais_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis_profissionais"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "servicos_perfil" ADD CONSTRAINT "servicos_perfil_servico_id_servicos_profissionais_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."servicos_profissionais"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "areas_atuacao" ADD CONSTRAINT "areas_atuacao_perfil_id_perfis_profissionais_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis_profissionais"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "areas_atuacao" ADD CONSTRAINT "areas_atuacao_codigo_ibge_municipios_codigo_ibge_fk" FOREIGN KEY ("codigo_ibge") REFERENCES "public"."municipios"("codigo_ibge") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "areas_atuacao_servicos" ADD CONSTRAINT "areas_atuacao_servicos_area_do_perfil_fk" FOREIGN KEY ("area_id","perfil_id") REFERENCES "public"."areas_atuacao"("id","perfil_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "areas_atuacao_servicos" ADD CONSTRAINT "areas_atuacao_servicos_servico_do_perfil_fk" FOREIGN KEY ("servico_perfil_id","perfil_id") REFERENCES "public"."servicos_perfil"("id","perfil_id") ON DELETE cascade ON UPDATE no action;
