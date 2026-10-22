CREATE TABLE "identidades_visitantes" (
	"identidade_id" uuid PRIMARY KEY NOT NULL,
	"ultima_atividade_em" timestamp with time zone DEFAULT now() NOT NULL,
	"convertida_em" timestamp with time zone,
	"encerrada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identidades_visitantes_um_estado" CHECK ("identidades_visitantes"."convertida_em" is null or "identidades_visitantes"."encerrada_em" is null)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_anonymous" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "identidades_visitantes" ADD CONSTRAINT "identidades_visitantes_identidade_id_identidades_id_fk" FOREIGN KEY ("identidade_id") REFERENCES "public"."identidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identidades_visitantes_ativas_idx" ON "identidades_visitantes" USING btree ("ultima_atividade_em") WHERE "identidades_visitantes"."convertida_em" is null and "identidades_visitantes"."encerrada_em" is null;