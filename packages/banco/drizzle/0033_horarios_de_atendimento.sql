-- MOTOR PROFISSIONAL — correção de produto do Bloco 2: disponibilidade passa a vir dos HORÁRIOS DE
-- ATENDIMENTO de cada serviço do perfil (grade semanal, vários períodos por dia, fuso do perfil).
-- Remove o conceito substituído "serviço de atendimento imediato" + booleano "disponível" — colunas só
-- do Motor Profissional novo, sem uso em fluxo anterior e vazias no desenvolvimento ao gerar esta migration.
-- `permite_agendamento` vem na 0034 (separada para o drizzle-kit não confundir remoção + inclusão na
-- mesma tabela com renomeação).
CREATE TABLE "periodos_atendimento" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"servico_perfil_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"inicio" time NOT NULL,
	"fim" time NOT NULL,
	CONSTRAINT "periodos_atendimento_dia_valido" CHECK ("periodos_atendimento"."dia_semana" between 1 and 7),
	CONSTRAINT "periodos_atendimento_inicio_antes_do_fim" CHECK ("periodos_atendimento"."inicio" < "periodos_atendimento"."fim"),
	CONSTRAINT "periodos_atendimento_fim_ate_24h" CHECK ("periodos_atendimento"."fim" <= '24:00'::time),
	CONSTRAINT "periodos_atendimento_minutos_inteiros" CHECK (extract(second from "periodos_atendimento"."inicio") = 0 and extract(second from "periodos_atendimento"."fim") = 0)
);
--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "fuso_horario" text DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
ALTER TABLE "periodos_atendimento" ADD CONSTRAINT "periodos_atendimento_servico_perfil_id_servicos_perfil_id_fk" FOREIGN KEY ("servico_perfil_id") REFERENCES "public"."servicos_perfil"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "periodos_atendimento_inicio_unico" ON "periodos_atendimento" USING btree ("servico_perfil_id","dia_semana","inicio");--> statement-breakpoint
ALTER TABLE "servicos_profissionais" DROP COLUMN "usa_disponibilidade_imediata";--> statement-breakpoint
ALTER TABLE "servicos_perfil" DROP COLUMN "disponivel";--> statement-breakpoint
ALTER TABLE "servicos_perfil" DROP COLUMN "disponibilidade_atualizada_em";--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD CONSTRAINT "perfis_profissionais_fuso_horario_valido" CHECK (char_length("perfis_profissionais"."fuso_horario") between 1 and 64);
--> statement-breakpoint
-- Períodos do MESMO serviço e dia não podem se cruzar (fim exclusivo: 08–12 e 12–14 só se encostam).
-- Trigger em vez de EXCLUDE: um EXCLUDE com uuid exigiria a extensão btree_gist, que não é requisito do
-- Jaa. A linha do serviço é travada antes da checagem, então duas transações simultâneas não gravam
-- períodos sobrepostos.
CREATE FUNCTION public.periodos_atendimento_sem_sobreposicao() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM public.servicos_perfil WHERE id = NEW.servico_perfil_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.periodos_atendimento p
     WHERE p.servico_perfil_id = NEW.servico_perfil_id
       AND p.dia_semana = NEW.dia_semana
       AND p.id <> NEW.id
       AND p.inicio < NEW.fim
       AND NEW.inicio < p.fim
  ) THEN
    RAISE EXCEPTION 'Períodos de atendimento sobrepostos no mesmo dia.'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'periodos_atendimento_sem_sobreposicao';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER periodos_atendimento_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.periodos_atendimento
  FOR EACH ROW EXECUTE FUNCTION public.periodos_atendimento_sem_sobreposicao();
