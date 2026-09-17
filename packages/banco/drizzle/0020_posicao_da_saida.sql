CREATE TABLE "posicoes_saida" (
	"saida_id" uuid PRIMARY KEY NOT NULL,
	"empresa_id" uuid NOT NULL,
	"entregador_id" uuid NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"precisao_metros" integer,
	"velocidade_metros_por_segundo" numeric(6, 2),
	"direcao_graus" integer,
	"capturada_em" timestamp with time zone NOT NULL,
	"recebida_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posicoes_saida_latitude_valida" CHECK ("posicoes_saida"."latitude" between -90 and 90),
	CONSTRAINT "posicoes_saida_longitude_valida" CHECK ("posicoes_saida"."longitude" between -180 and 180),
	CONSTRAINT "posicoes_saida_precisao_valida" CHECK ("posicoes_saida"."precisao_metros" is null or "posicoes_saida"."precisao_metros" >= 0),
	CONSTRAINT "posicoes_saida_direcao_valida" CHECK ("posicoes_saida"."direcao_graus" is null or "posicoes_saida"."direcao_graus" between 0 and 360)
);
--> statement-breakpoint
ALTER TABLE "posicoes_saida" ADD CONSTRAINT "posicoes_saida_saida_id_saidas_entrega_id_fk" FOREIGN KEY ("saida_id") REFERENCES "public"."saidas_entrega"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posicoes_saida" ADD CONSTRAINT "posicoes_saida_entregador_id_entregadores_empresa_id_fk" FOREIGN KEY ("entregador_id") REFERENCES "public"."entregadores_empresa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posicoes_saida" ADD CONSTRAINT "posicoes_saida_da_empresa_fk" FOREIGN KEY ("saida_id","empresa_id") REFERENCES "public"."saidas_entrega"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posicoes_saida" ADD CONSTRAINT "posicoes_saida_entregador_da_empresa_fk" FOREIGN KEY ("entregador_id","empresa_id") REFERENCES "public"."entregadores_empresa"("id","empresa_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posicoes_saida_empresa_idx" ON "posicoes_saida" USING btree ("empresa_id","capturada_em");