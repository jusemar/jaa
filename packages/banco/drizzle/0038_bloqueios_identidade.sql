CREATE TABLE "bloqueios_identidade" (
	"bloqueador_identidade_id" uuid NOT NULL,
	"bloqueador_tipo" "tipo_identidade" DEFAULT 'pessoal' NOT NULL,
	"bloqueado_identidade_id" uuid NOT NULL,
	"bloqueado_tipo" "tipo_identidade" DEFAULT 'pessoal' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bloqueios_identidade_bloqueador_identidade_id_bloqueado_identidade_id_pk" PRIMARY KEY("bloqueador_identidade_id","bloqueado_identidade_id"),
	CONSTRAINT "bloqueios_identidade_somente_pessoas" CHECK ("bloqueios_identidade"."bloqueador_tipo"::text = 'pessoal' and "bloqueios_identidade"."bloqueado_tipo"::text = 'pessoal'),
	CONSTRAINT "bloqueios_identidade_nao_e_voce" CHECK ("bloqueios_identidade"."bloqueador_identidade_id" <> "bloqueios_identidade"."bloqueado_identidade_id")
);
--> statement-breakpoint
ALTER TABLE "bloqueios_identidade" ADD CONSTRAINT "bloqueios_identidade_bloqueador_pessoal_fk" FOREIGN KEY ("bloqueador_identidade_id","bloqueador_tipo") REFERENCES "public"."identidades"("id","tipo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueios_identidade" ADD CONSTRAINT "bloqueios_identidade_bloqueado_pessoal_fk" FOREIGN KEY ("bloqueado_identidade_id","bloqueado_tipo") REFERENCES "public"."identidades"("id","tipo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloqueios_identidade_bloqueado_idx" ON "bloqueios_identidade" USING btree ("bloqueado_identidade_id","bloqueador_identidade_id");