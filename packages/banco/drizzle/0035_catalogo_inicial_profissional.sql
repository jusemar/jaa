-- MOTOR PROFISSIONAL — CATÁLOGO INICIAL (dados, não fixtures de teste). Só três atividades, escolhidas
-- para exercitar comportamentos diferentes do motor:
--   Entregador   → atributo "Veículo" (Moto, Carro, Bicicleta; seleção múltipla), sem especialidades;
--   Mototáxi     → nada a escolher (a moto é inerente à atividade: campo "Veículo" seria inútil);
--   Cabeleireiro → especialidades (Corte masculino, Corte feminino, Escova, Coloração), sem atributos.
-- IDs FIXOS (estáveis entre desenvolvimento, testes e produção) e ON CONFLICT DO NOTHING: aplicar de
-- novo não duplica nada. O futuro Gestor da Plataforma administra o catálogo a partir daqui.
INSERT INTO categorias_profissionais (id, slug, nome, ordem) VALUES
  ('0199b000-0000-7000-8000-000000000001', 'transporte-e-entregas', 'Transporte e entregas', 1),
  ('0199b000-0000-7000-8000-000000000002', 'beleza', 'Beleza', 2)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO servicos_profissionais (id, categoria_id, slug, nome, ordem) VALUES
  ('0199b000-0000-7000-8000-000000000011', '0199b000-0000-7000-8000-000000000001', 'entregador', 'Entregador', 1),
  ('0199b000-0000-7000-8000-000000000012', '0199b000-0000-7000-8000-000000000001', 'mototaxi', 'Mototáxi', 2),
  ('0199b000-0000-7000-8000-000000000013', '0199b000-0000-7000-8000-000000000002', 'cabeleireiro', 'Cabeleireiro', 1)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO atributos_servico (id, servico_id, slug, nome, tipo_selecao, ordem) VALUES
  ('0199b000-0000-7000-8000-000000000021', '0199b000-0000-7000-8000-000000000011', 'veiculo', 'Veículo', 'multipla', 1)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO opcoes_atributo (id, atributo_id, servico_id, slug, nome, ordem) VALUES
  ('0199b000-0000-7000-8000-000000000031', '0199b000-0000-7000-8000-000000000021', '0199b000-0000-7000-8000-000000000011', 'moto', 'Moto', 1),
  ('0199b000-0000-7000-8000-000000000032', '0199b000-0000-7000-8000-000000000021', '0199b000-0000-7000-8000-000000000011', 'carro', 'Carro', 2),
  ('0199b000-0000-7000-8000-000000000033', '0199b000-0000-7000-8000-000000000021', '0199b000-0000-7000-8000-000000000011', 'bicicleta', 'Bicicleta', 3)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO especialidades_servico (id, servico_id, slug, nome, ordem) VALUES
  ('0199b000-0000-7000-8000-000000000041', '0199b000-0000-7000-8000-000000000013', 'corte-masculino', 'Corte masculino', 1),
  ('0199b000-0000-7000-8000-000000000042', '0199b000-0000-7000-8000-000000000013', 'corte-feminino', 'Corte feminino', 2),
  ('0199b000-0000-7000-8000-000000000043', '0199b000-0000-7000-8000-000000000013', 'escova', 'Escova', 3),
  ('0199b000-0000-7000-8000-000000000044', '0199b000-0000-7000-8000-000000000013', 'coloracao', 'Coloração', 4)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Dicionário da busca (sem IA): nome de cada atividade/especialidade + sinônimos populares.
-- "motoboy" leva a Entregador + Moto; "mototaxista" leva a Mototáxi.
INSERT INTO termos_busca_servico (servico_id, especialidade_id, opcao_id, termo) VALUES
  ('0199b000-0000-7000-8000-000000000011', NULL, NULL, 'Entregador'),
  ('0199b000-0000-7000-8000-000000000011', NULL, NULL, 'Entregadora'),
  ('0199b000-0000-7000-8000-000000000011', NULL, NULL, 'Entregas'),
  ('0199b000-0000-7000-8000-000000000011', NULL, '0199b000-0000-7000-8000-000000000031', 'Motoboy'),
  ('0199b000-0000-7000-8000-000000000011', NULL, '0199b000-0000-7000-8000-000000000031', 'Motoqueiro'),
  ('0199b000-0000-7000-8000-000000000012', NULL, NULL, 'Mototáxi'),
  ('0199b000-0000-7000-8000-000000000012', NULL, NULL, 'Mototaxista'),
  ('0199b000-0000-7000-8000-000000000012', NULL, NULL, 'Moto táxi'),
  ('0199b000-0000-7000-8000-000000000013', NULL, NULL, 'Cabeleireiro'),
  ('0199b000-0000-7000-8000-000000000013', NULL, NULL, 'Cabeleireira'),
  ('0199b000-0000-7000-8000-000000000013', '0199b000-0000-7000-8000-000000000041', NULL, 'Corte masculino'),
  ('0199b000-0000-7000-8000-000000000013', '0199b000-0000-7000-8000-000000000042', NULL, 'Corte feminino'),
  ('0199b000-0000-7000-8000-000000000013', '0199b000-0000-7000-8000-000000000043', NULL, 'Escova'),
  ('0199b000-0000-7000-8000-000000000013', '0199b000-0000-7000-8000-000000000044', NULL, 'Coloração')
ON CONFLICT DO NOTHING;
