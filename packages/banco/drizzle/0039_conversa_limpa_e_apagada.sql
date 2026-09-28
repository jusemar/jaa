ALTER TABLE "participantes_conversa" ADD COLUMN "limpa_ate_mensagem_id" uuid;--> statement-breakpoint
ALTER TABLE "participantes_conversa" ADD COLUMN "apagada" boolean DEFAULT false NOT NULL;