ALTER TABLE "mensagens" ADD COLUMN "operador_usuario_id" text;--> statement-breakpoint
ALTER TABLE "mensagens" ADD COLUMN "editada_por_usuario_id" text;--> statement-breakpoint
ALTER TABLE "mensagens" ADD COLUMN "excluida_por_usuario_id" text;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_operador_usuario_id_users_id_fk" FOREIGN KEY ("operador_usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_editada_por_usuario_id_users_id_fk" FOREIGN KEY ("editada_por_usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_excluida_por_usuario_id_users_id_fk" FOREIGN KEY ("excluida_por_usuario_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;