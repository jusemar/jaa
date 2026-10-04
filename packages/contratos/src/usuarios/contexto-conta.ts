import * as z from "zod";
import { identidadeOperavelRecebidaSchema, identidadeOperavelSchema } from "../identidades/identidade-operavel.ts";
import { identidadePessoalSchema } from "../identidades/identidade-pessoal.ts";
import { contaAtualSchema } from "./conta-atual.ts";

/*
 * CONTEXTO DA CONTA (`GET /conta/contexto`): RESUMO leve para o cliente decidir o que mostrar ao abrir.
 * Não é autorização — cada rota de domínio continua autorizando sozinha — e não carrega dados de
 * domínio (entregas, perfil completo, conversas...): esses continuam nos endpoints de cada domínio.
 *
 * Não varia com a identidade atuante (`x-jaa-identidade`): é o que a CONTA pode, não em nome de quem
 * a aba está agindo agora.
 */

// Muda só em quebra real de formato (a evolução normal é aditiva e não mexe neste número).
export const VERSAO_CONTEXTO_CONTA = 1;

/*
 * Estado COMUM a toda capacidade, só para navegação: `ativa` = área utilizável; `pendente` = existe,
 * mas falta ação da pessoa; `inativa` = existe e está desligada. Capacidade AUSENTE = a pessoa não a tem.
 */
export const ESTADOS_CAPACIDADE = ["ativa", "pendente", "inativa"] as const;

export type EstadoCapacidade = (typeof ESTADOS_CAPACIDADE)[number];

/*
 * Participação no MOTOR DE ENTREGAS por empresa (vínculos em `entregadores_empresa`). NÃO é a atividade
 * profissional "Entregador" do Perfil Profissional. Uma entrada só, mesmo com vários vínculos; a lista
 * por empresa, a disponibilidade e a fila continuam em `/entregas/vinculos` e `/entregas/situacao`.
 */
export const capacidadeEntregadorEmpresaSchema = z.object({
  tipo: z.literal("entregador_empresa"),
  // Só vínculos inativos (ou nenhum) = capacidade ausente.
  estado: z.enum(["ativa", "pendente"]),
  resumo: z.object({
    vinculosAtivos: z.number().int().min(0),
    convitesPendentes: z.number().int().min(0),
  }),
});

/*
 * Perfil Profissional (1:1 com a identidade pessoal). As ATIVIDADES dele (Entregador, Mototáxi,
 * Cabeleireiro...) não são capacidades. `pendencias` é texto aberto de propósito: uma pendência nova
 * não pode fazer um cliente antigo descartar a capacidade inteira.
 */
export const capacidadePerfilProfissionalSchema = z.object({
  tipo: z.literal("perfil_profissional"),
  estado: z.enum(ESTADOS_CAPACIDADE),
  resumo: z.object({ pendencias: z.array(z.string()) }),
});

// Capacidades que ESTA versão do contrato conhece (é o que a API monta).
export const capacidadeContaSchema = z.discriminatedUnion("tipo", [capacidadeEntregadorEmpresaSchema, capacidadePerfilProfissionalSchema]);

export type CapacidadeConta = z.infer<typeof capacidadeContaSchema>;

export type TipoCapacidade = CapacidadeConta["tipo"];

/*
 * Leitura TOLERANTE: qualquer `{ tipo, estado }` passa, com campos extras preservados. Assim uma API
 * nova com capacidade que o cliente não conhece nunca derruba a leitura do contexto inteiro.
 */
export const capacidadeRecebidaSchema = z.looseObject({ tipo: z.string(), estado: z.string() });

export type CapacidadeRecebida = z.infer<typeof capacidadeRecebidaSchema>;

const camposContexto = {
  versao: z.number().int().min(1),
  // Dados da conta de `ContaAtual`; a identidade pessoal vem ao lado, sem repetição.
  conta: contaAtualSchema.omit({ identidadePessoal: true }),
  identidadePessoal: identidadePessoalSchema.nullable(),
};

// O que a API devolve: identidades e capacidades conhecidas, estritas.
export const contextoContaRespostaSchema = z.object({
  ...camposContexto,
  // As MESMAS de `GET /identidades/operaveis`: a pessoal primeiro, depois as empresariais (com o papel).
  identidadesOperaveis: z.array(identidadeOperavelSchema),
  capacidades: z.array(capacidadeContaSchema),
});

export type ContextoConta = z.infer<typeof contextoContaRespostaSchema>;

/*
 * O que os CLIENTES devem usar para ler a resposta: papel empresarial e capacidades em forma tolerante.
 * Depois, cada cliente usa `capacidadesConhecidas` / `papelEmpresaConhecido` e ignora o que não conhece.
 */
export const contextoContaSchema = z.object({
  ...camposContexto,
  identidadesOperaveis: z.array(identidadeOperavelRecebidaSchema),
  capacidades: z.array(capacidadeRecebidaSchema),
});

export type ContextoContaRecebido = z.infer<typeof contextoContaSchema>;

/** Filtra as capacidades que esta versão conhece; tipo ou estado desconhecido é ignorado, nunca erro. */
export function capacidadesConhecidas(capacidades: readonly unknown[]): CapacidadeConta[] {
  const conhecidas: CapacidadeConta[] = [];
  for (const capacidade of capacidades) {
    const resultado = capacidadeContaSchema.safeParse(capacidade);
    if (resultado.success) conhecidas.push(resultado.data);
  }
  return conhecidas;
}
