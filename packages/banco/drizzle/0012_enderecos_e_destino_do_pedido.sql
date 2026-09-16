CREATE TABLE "enderecos_cliente" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identidade_id" uuid NOT NULL,
	"apelido" text NOT NULL,
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
	"arquivado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enderecos_cliente_localizacao_completa" CHECK (("enderecos_cliente"."latitude" is null and "enderecos_cliente"."longitude" is null and "enderecos_cliente"."localizacao_confirmada_em" is null) or ("enderecos_cliente"."latitude" is not null and "enderecos_cliente"."longitude" is not null and "enderecos_cliente"."localizacao_confirmada_em" is not null)),
	CONSTRAINT "enderecos_cliente_latitude_valida" CHECK ("enderecos_cliente"."latitude" is null or "enderecos_cliente"."latitude" between -90 and 90),
	CONSTRAINT "enderecos_cliente_longitude_valida" CHECK ("enderecos_cliente"."longitude" is null or "enderecos_cliente"."longitude" between -180 and 180),
	CONSTRAINT "enderecos_cliente_uf_valida" CHECK ("enderecos_cliente"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "enderecos_cliente_cep_valido" CHECK ("enderecos_cliente"."cep" ~ '^[0-9]{8}$'),
	CONSTRAINT "enderecos_cliente_textos_validos" CHECK (char_length("enderecos_cliente"."apelido") between 1 and 40 and char_length("enderecos_cliente"."logradouro") between 1 and 120 and char_length("enderecos_cliente"."numero") between 1 and 20 and char_length("enderecos_cliente"."bairro") between 1 and 80 and char_length("enderecos_cliente"."cidade") between 1 and 80 and ("enderecos_cliente"."complemento" is null or char_length("enderecos_cliente"."complemento") between 1 and 60) and ("enderecos_cliente"."ponto_referencia" is null or char_length("enderecos_cliente"."ponto_referencia") between 1 and 160))
);
--> statement-breakpoint
CREATE TABLE "destinos_pedido" (
	"pedido_id" uuid PRIMARY KEY NOT NULL,
	"endereco_id" uuid,
	"cep" text NOT NULL,
	"logradouro" text NOT NULL,
	"numero" text NOT NULL,
	"complemento" text,
	"bairro" text NOT NULL,
	"cidade" text NOT NULL,
	"uf" text NOT NULL,
	"ponto_referencia" text,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"localizacao_confirmada_em" timestamp with time zone NOT NULL,
	CONSTRAINT "destinos_pedido_latitude_valida" CHECK ("destinos_pedido"."latitude" between -90 and 90),
	CONSTRAINT "destinos_pedido_longitude_valida" CHECK ("destinos_pedido"."longitude" between -180 and 180),
	CONSTRAINT "destinos_pedido_uf_valida" CHECK ("destinos_pedido"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "destinos_pedido_cep_valido" CHECK ("destinos_pedido"."cep" ~ '^[0-9]{8}$')
);
--> statement-breakpoint
ALTER TABLE "enderecos_cliente" ADD CONSTRAINT "enderecos_cliente_identidade_id_identidades_id_fk" FOREIGN KEY ("identidade_id") REFERENCES "public"."identidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destinos_pedido" ADD CONSTRAINT "destinos_pedido_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destinos_pedido" ADD CONSTRAINT "destinos_pedido_endereco_id_enderecos_cliente_id_fk" FOREIGN KEY ("endereco_id") REFERENCES "public"."enderecos_cliente"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enderecos_cliente_identidade_id_id_idx" ON "enderecos_cliente" USING btree ("identidade_id","id");