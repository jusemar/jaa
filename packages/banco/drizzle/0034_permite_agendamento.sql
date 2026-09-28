-- MOTOR PROFISSIONAL: o serviço do perfil PODE usar a Agenda futura (decisão do profissional, serviço a
-- serviço). Só a permissão — nenhuma reserva ou horário reservável é criado. Começa NÃO.
ALTER TABLE "servicos_perfil" ADD COLUMN "permite_agendamento" boolean DEFAULT false NOT NULL;