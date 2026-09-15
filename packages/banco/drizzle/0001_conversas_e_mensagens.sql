CREATE TYPE "public"."tipo_conversa" AS ENUM('direta');--> statement-breakpoint
CREATE TYPE "public"."tipo_mensagem" AS ENUM('texto');--> statement-breakpoint
CREATE TABLE "conversas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_conversa" NOT NULL,
	"chave_direta" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversas_chave_direta_unica" UNIQUE("chave_direta"),
	CONSTRAINT "conversas_chave_direta_por_tipo" CHECK (("conversas"."tipo" = 'direta') = ("conversas"."chave_direta" is not null))
);
--> statement-breakpoint
CREATE TABLE "participantes_conversa" (
	"conversa_id" uuid NOT NULL,
	"identidade_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participantes_conversa_pk" PRIMARY KEY("conversa_id","identidade_id")
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"remetente_identidade_id" uuid NOT NULL,
	"id_cliente" uuid NOT NULL,
	"tipo" "tipo_mensagem" NOT NULL,
	"conteudo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensagens_conteudo_texto_valido" CHECK (char_length("mensagens"."conteudo") between 1 and 4000 and "mensagens"."conteudo" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "participantes_conversa" ADD CONSTRAINT "participantes_conversa_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participantes_conversa" ADD CONSTRAINT "participantes_conversa_identidade_id_identidades_id_fk" FOREIGN KEY ("identidade_id") REFERENCES "public"."identidades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_remetente_participante_fk" FOREIGN KEY ("conversa_id","remetente_identidade_id") REFERENCES "public"."participantes_conversa"("conversa_id","identidade_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_id_cliente_por_remetente_unico" ON "mensagens" USING btree ("remetente_identidade_id","id_cliente");--> statement-breakpoint
CREATE INDEX "mensagens_conversa_id_id_idx" ON "mensagens" USING btree ("conversa_id","id");