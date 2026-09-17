CREATE TABLE "preferencias_identidade" (
	"identidade_id" uuid PRIMARY KEY NOT NULL,
	"buscavel_por_telefone" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contatos" (
	"identidade_id" uuid NOT NULL,
	"contato_identidade_id" uuid NOT NULL,
	"apelido" text,
	"favorito" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contatos_pk" PRIMARY KEY("identidade_id","contato_identidade_id"),
	CONSTRAINT "contatos_nao_e_voce" CHECK ("contatos"."identidade_id" <> "contatos"."contato_identidade_id"),
	CONSTRAINT "contatos_apelido_valido" CHECK ("contatos"."apelido" is null or length(btrim("contatos"."apelido")) between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "preferencias_identidade" ADD CONSTRAINT "preferencias_identidade_identidade_id_identidades_id_fk" FOREIGN KEY ("identidade_id") REFERENCES "public"."identidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_identidade_id_identidades_id_fk" FOREIGN KEY ("identidade_id") REFERENCES "public"."identidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_contato_identidade_id_identidades_id_fk" FOREIGN KEY ("contato_identidade_id") REFERENCES "public"."identidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contatos_identidade_idx" ON "contatos" USING btree ("identidade_id","criado_em");