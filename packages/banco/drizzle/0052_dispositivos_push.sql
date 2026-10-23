-- Dispositivos para PUSH de nova mensagem: uma linha por instalação do app, da conta logada nela (token Expo único).
-- A sessão que registrou leva a linha junto ao ser apagada (logout); token morto é marcado em invalidado_em.
CREATE TYPE "public"."plataforma_push" AS ENUM('android', 'ios');--> statement-breakpoint
CREATE TABLE "dispositivos_push" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"instalacao_id" uuid NOT NULL,
	"usuario_id" text NOT NULL,
	"sessao_id" text NOT NULL,
	"token" text NOT NULL,
	"plataforma" "plataforma_push" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidado_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dispositivos_push" ADD CONSTRAINT "dispositivos_push_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos_push" ADD CONSTRAINT "dispositivos_push_sessao_id_sessions_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispositivos_push_instalacao_unica" ON "dispositivos_push" USING btree ("instalacao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dispositivos_push_token_unico" ON "dispositivos_push" USING btree ("token");--> statement-breakpoint
CREATE INDEX "dispositivos_push_usuario_idx" ON "dispositivos_push" USING btree ("usuario_id") WHERE "dispositivos_push"."invalidado_em" is null;--> statement-breakpoint
CREATE INDEX "dispositivos_push_sessao_idx" ON "dispositivos_push" USING btree ("sessao_id");