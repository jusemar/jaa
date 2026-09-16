CREATE TABLE "recebimentos_mensagem" (
	"mensagem_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"destinatario_identidade_id" uuid NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recebimentos_mensagem_pk" PRIMARY KEY("mensagem_id","destinatario_identidade_id")
);
--> statement-breakpoint
ALTER TABLE "participantes_conversa" ADD COLUMN "lida_ate_mensagem_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_conversa_id_id_unico" ON "mensagens" USING btree ("conversa_id","id");--> statement-breakpoint
DROP INDEX "mensagens_conversa_id_id_idx";--> statement-breakpoint
ALTER TABLE "recebimentos_mensagem" ADD CONSTRAINT "recebimentos_mensagem_mensagem_fk" FOREIGN KEY ("conversa_id","mensagem_id") REFERENCES "public"."mensagens"("conversa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recebimentos_mensagem" ADD CONSTRAINT "recebimentos_mensagem_destinatario_participante_fk" FOREIGN KEY ("conversa_id","destinatario_identidade_id") REFERENCES "public"."participantes_conversa"("conversa_id","identidade_id") ON DELETE cascade ON UPDATE no action;
