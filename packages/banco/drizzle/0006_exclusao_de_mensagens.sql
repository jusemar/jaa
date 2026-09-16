CREATE TABLE "mensagens_excluidas_para_identidade" (
	"mensagem_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"identidade_id" uuid NOT NULL,
	"excluida_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensagens_excluidas_para_identidade_pk" PRIMARY KEY("mensagem_id","identidade_id")
);
--> statement-breakpoint
ALTER TABLE "mensagens" DROP CONSTRAINT "mensagens_conteudo_texto_valido";--> statement-breakpoint
ALTER TABLE "mensagens" ADD COLUMN "excluida_para_todos_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mensagens_excluidas_para_identidade" ADD CONSTRAINT "mensagens_excluidas_para_identidade_mensagem_fk" FOREIGN KEY ("conversa_id","mensagem_id") REFERENCES "public"."mensagens"("conversa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_excluidas_para_identidade" ADD CONSTRAINT "mensagens_excluidas_para_identidade_participante_fk" FOREIGN KEY ("conversa_id","identidade_id") REFERENCES "public"."participantes_conversa"("conversa_id","identidade_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_excluida_apos_criacao" CHECK ("mensagens"."excluida_para_todos_em" is null or "mensagens"."excluida_para_todos_em" >= "mensagens"."criado_em");--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conteudo_texto_valido" CHECK (("mensagens"."excluida_para_todos_em" is null and char_length("mensagens"."conteudo") between 1 and 4000 and "mensagens"."conteudo" ~ '[^[:space:]]') or ("mensagens"."excluida_para_todos_em" is not null and "mensagens"."conteudo" = ''));