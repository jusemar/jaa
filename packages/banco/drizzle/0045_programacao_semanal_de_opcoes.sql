-- PROGRAMAÇÃO SEMANAL de opções de produto (ex.: "Monte seu prato" com guarnições diferentes a cada dia).
-- Somente ACRÉSCIMOS, sem backfill: todo grupo existente nasce com programacao_semanal = false e
-- continua oferecendo as mesmas opções de sempre. Nenhuma linha de produto, grupo, opção ou pedido muda.
--   * grupos_opcoes_produto.programacao_semanal: liga a programação por grupo (opt-in);
--   * opcoes_produto_dias: em quais dias ISO (1 = segunda … 7 = domingo) cada opção é oferecida;
--   * empresas.fuso_horario: fuso em que o "dia de hoje" da empresa é calculado.
CREATE TABLE "opcoes_produto_dias" (
	"empresa_id" uuid NOT NULL,
	"opcao_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opcoes_produto_dias_pk" PRIMARY KEY("opcao_id","dia_semana"),
	CONSTRAINT "opcoes_produto_dias_dia_valido" CHECK ("opcoes_produto_dias"."dia_semana" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "fuso_horario" text DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
ALTER TABLE "grupos_opcoes_produto" ADD COLUMN "programacao_semanal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opcoes_produto_dias" ADD CONSTRAINT "opcoes_produto_dias_opcao_fk" FOREIGN KEY ("empresa_id","opcao_id") REFERENCES "public"."opcoes_produto"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opcoes_produto_dias_empresa_dia_idx" ON "opcoes_produto_dias" USING btree ("empresa_id","dia_semana");--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_fuso_horario_valido" CHECK (char_length("empresas"."fuso_horario") between 1 and 64);