-- Horário de funcionamento da EMPRESA (quando ela recebe pedidos). Só acréscimos.
-- COMPATIBILIDADE: `horario_funcionamento_ativo` nasce FALSO em todas as empresas existentes, e falso
-- significa "não controla horário": continuam recebendo pedidos a qualquer hora, como antes. Nenhuma
-- empresa fica fechada por causa desta migration; a regra só passa a valer quando o gestor liga.
-- `fim <= inicio` = o período fecha no dia seguinte (18:00–02:00).
CREATE TABLE "periodos_funcionamento_empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"inicio" time NOT NULL,
	"fim" time NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periodos_funcionamento_empresa_dia_valido" CHECK ("periodos_funcionamento_empresa"."dia_semana" between 1 and 7),
	CONSTRAINT "periodos_funcionamento_empresa_inicio_valido" CHECK ("periodos_funcionamento_empresa"."inicio" < '24:00'::time),
	CONSTRAINT "periodos_funcionamento_empresa_fim_valido" CHECK ("periodos_funcionamento_empresa"."fim" > '00:00'::time and "periodos_funcionamento_empresa"."fim" <= '24:00'::time),
	CONSTRAINT "periodos_funcionamento_empresa_inicio_diferente_do_fim" CHECK ("periodos_funcionamento_empresa"."inicio" <> "periodos_funcionamento_empresa"."fim"),
	CONSTRAINT "periodos_funcionamento_empresa_minutos_inteiros" CHECK (extract(second from "periodos_funcionamento_empresa"."inicio") = 0 and extract(second from "periodos_funcionamento_empresa"."fim") = 0)
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "horario_funcionamento_ativo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "periodos_funcionamento_empresa" ADD CONSTRAINT "periodos_funcionamento_empresa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "periodos_funcionamento_empresa_inicio_unico" ON "periodos_funcionamento_empresa" USING btree ("empresa_id","dia_semana","inicio");