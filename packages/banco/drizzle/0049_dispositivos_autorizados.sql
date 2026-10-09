CREATE TABLE "dispositivos_autorizados" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"usuario_id" text NOT NULL,
	"credencial_hash" text NOT NULL,
	"pin_hash" text NOT NULL,
	"tentativas_erradas" integer DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_em" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	CONSTRAINT "dispositivos_autorizados_tentativas_validas" CHECK ("dispositivos_autorizados"."tentativas_erradas" >= 0)
);
--> statement-breakpoint
ALTER TABLE "dispositivos_autorizados" ADD CONSTRAINT "dispositivos_autorizados_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispositivos_autorizados_credencial_unica" ON "dispositivos_autorizados" USING btree ("credencial_hash");--> statement-breakpoint
CREATE INDEX "dispositivos_autorizados_usuario_idx" ON "dispositivos_autorizados" USING btree ("usuario_id");