-- Marca quando a programação semanal de um grupo foi configurada pela primeira vez. Nulo = nunca:
-- a primeira ativação preenche os sete dias com as opções existentes (nada some do cardápio); religar
-- depois retoma a programação como estava. Só acréscimo, sem backfill: nenhum grupo existente tem
-- programação ligada. (Se algum já tivesse dias gravados, a ativação os preserva: ela só preenche a
-- semana quando não há NENHUM dia gravado.)
ALTER TABLE "grupos_opcoes_produto" ADD COLUMN "programacao_semanal_iniciada_em" timestamp with time zone;