import type { Banco } from "@jaa/banco";
import {
  basesEmpresa,
  entregadoresEmpresa,
  historicoFilaEntregador,
  identidades,
  saidasEntrega,
} from "@jaa/banco/schema";
import {
  participaDaFila,
  type StatusEntregador,
  type Uf,
} from "@jaa/contratos";
import { and, asc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";

export type BaseRegistro = typeof basesEmpresa.$inferSelect;

export interface DadosBase {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  pontoReferencia: string | null;
  raioMetros: number;
}

export async function buscarBase(
  banco: Banco,
  empresaId: string,
): Promise<BaseRegistro | null> {
  const [base] = await banco
    .select()
    .from(basesEmpresa)
    .where(eq(basesEmpresa.empresaId, empresaId))
    .limit(1);
  return base ?? null;
}

/**
 * Salva o endereço da base. `manterLocalizacao` vem da mesma regra central do endereço do cliente:
 * mudou campo estrutural, a confirmação do ponto cai e alguém confirma de novo no mapa.
 */
export async function salvarBase(
  banco: Banco,
  empresaId: string,
  dados: DadosBase,
  manterLocalizacao: boolean,
): Promise<BaseRegistro> {
  const [base] = await banco
    .insert(basesEmpresa)
    .values({ ...dados, empresaId })
    .onConflictDoUpdate({
      target: basesEmpresa.empresaId,
      set: {
        ...dados,
        ...(manterLocalizacao
          ? {}
          : { latitude: null, longitude: null, localizacaoConfirmadaEm: null }),
      },
    })
    .returning();
  if (!base) throw new Error("Gravação da base não retornou registro.");
  return base;
}

// Confirmação explícita do ponto da base (nunca automática, nunca pelo texto do endereço).
export async function confirmarPontoBase(
  banco: Banco,
  empresaId: string,
  coordenadas: { latitude: number; longitude: number },
): Promise<BaseRegistro | null> {
  const [base] = await banco
    .update(basesEmpresa)
    .set({ ...coordenadas, localizacaoConfirmadaEm: new Date() })
    .where(eq(basesEmpresa.empresaId, empresaId))
    .returning();
  return base ?? null;
}

export interface EntregadorOperacionalRegistro {
  id: string;
  empresaId: string;
  usuarioId: string;
  status: StatusEntregador;
  disponivel: boolean;
  naBase: boolean;
  aptoParaSaida: boolean;
  emEntrega: boolean;
  filaEntrouEm: Date | null;
  leiturasConsecutivas: number;
  pessoa: {
    identidadeId: string;
    tipo: "pessoal" | "empresarial";
    nomeExibicao: string;
    nomeUsuario: string;
  };
}

const colunasOperacionais = {
  id: entregadoresEmpresa.id,
  empresaId: entregadoresEmpresa.empresaId,
  usuarioId: entregadoresEmpresa.usuarioId,
  status: entregadoresEmpresa.status,
  disponivel: entregadoresEmpresa.disponivel,
  naBase: entregadoresEmpresa.naBase,
  aptoParaSaida: entregadoresEmpresa.aptoParaSaida,
  emEntrega: sql<boolean>`exists (
    select 1 from ${saidasEntrega}
    where ${saidasEntrega.entregadorId} = ${entregadoresEmpresa.id}
      and ${saidasEntrega.status} = 'em_andamento'
  )`,
  filaEntrouEm: entregadoresEmpresa.filaEntrouEm,
  leiturasConsecutivas: entregadoresEmpresa.leiturasConsecutivas,
  pessoa: {
    identidadeId: identidades.id,
    tipo: identidades.tipo,
    nomeExibicao: identidades.nomeExibicao,
    nomeUsuario: identidades.nomeUsuario,
  },
};

const consultaOperacional = (banco: Banco) =>
  banco
    .select(colunasOperacionais)
    .from(entregadoresEmpresa)
    .innerJoin(
      identidades,
      and(
        eq(identidades.usuarioId, entregadoresEmpresa.usuarioId),
        eq(identidades.tipo, "pessoal"),
      ),
    );

// Quadro operacional da empresa: fila primeiro (por ordem de chegada), depois os demais.
export function listarOperacionaisDaEmpresa(
  banco: Banco,
  empresaId: string,
): Promise<EntregadorOperacionalRegistro[]> {
  return consultaOperacional(banco)
    .where(eq(entregadoresEmpresa.empresaId, empresaId))
    .orderBy(
      asc(entregadoresEmpresa.filaEntrouEm),
      asc(entregadoresEmpresa.id),
    );
}

export async function buscarOperacional(
  banco: Banco,
  entregadorId: string,
): Promise<EntregadorOperacionalRegistro | null> {
  const [registro] = await consultaOperacional(banco)
    .where(eq(entregadoresEmpresa.id, entregadorId))
    .limit(1);
  return registro ?? null;
}

// Vínculos da pessoa (todas as empresas): a visão "em que empresas eu trabalho e como estou agora".
export function listarOperacionaisDaPessoa(
  banco: Banco,
  usuarioId: string,
): Promise<EntregadorOperacionalRegistro[]> {
  return consultaOperacional(banco)
    .where(eq(entregadoresEmpresa.usuarioId, usuarioId))
    .orderBy(asc(entregadoresEmpresa.id));
}

/**
 * Fila da base, na ORDEM DO SERVIDOR: momento de entrada, com o id como desempate determinístico
 * (dois entregadores elegíveis no mesmo instante nunca produzem ordem ambígua).
 */
export function listarFila(
  banco: Banco,
  empresaId: string,
): Promise<EntregadorOperacionalRegistro[]> {
  return consultaOperacional(banco)
    .where(
      and(
        eq(entregadoresEmpresa.empresaId, empresaId),
        isNotNull(entregadoresEmpresa.filaEntrouEm),
      ),
    )
    .orderBy(
      asc(entregadoresEmpresa.filaEntrouEm),
      asc(entregadoresEmpresa.id),
    );
}

export interface MudancaOperacional {
  naBase?: boolean;
  leiturasConsecutivas?: number;
  presencaMudou?: boolean;
  disponivel?: boolean;
  status?: StatusEntregador;
  aptoParaSaida?: boolean;
}

/**
 * Aplica uma mudança operacional (presença, disponibilidade, vínculo, aptidão) E reavalia a FILA na
 * MESMA transação. Precisa ser junto: o banco garante que ninguém fica na fila sem estar aceitando e
 * presente, então mudar um lado sem o outro seria um estado impossível.
 *
 * Elegível entra com o horário do SERVIDOR (no final da fila); deixou de ser elegível, sai — e o
 * histórico de entrada/saída registra o motivo. Quem já está na fila mantém a posição original.
 */
export async function aplicarMudancaOperacional(
  banco: Banco,
  entregadorId: string,
  mudanca: MudancaOperacional,
  motivoSaida: string,
): Promise<"entrou" | "saiu" | "sem-mudanca"> {
  return banco.transaction(async (transacao) => {
    const [atual] = await transacao
      .select({
        status: entregadoresEmpresa.status,
        disponivel: entregadoresEmpresa.disponivel,
        naBase: entregadoresEmpresa.naBase,
        aptoParaSaida: entregadoresEmpresa.aptoParaSaida,
        filaEntrouEm: entregadoresEmpresa.filaEntrouEm,
      })
      .from(entregadoresEmpresa)
      .where(eq(entregadoresEmpresa.id, entregadorId))
      .for("update")
      .limit(1);
    if (!atual) return "sem-mudanca";

    const depois = {
      status: mudanca.status ?? atual.status,
      disponivel: mudanca.disponivel ?? atual.disponivel,
      naBase: mudanca.naBase ?? atual.naBase,
      aptoParaSaida: mudanca.aptoParaSaida ?? atual.aptoParaSaida,
    };

    /*
     * Quem já está com uma saída em aberto não fica na fila: ele está (ou vai estar) na rua.
     * Concluir a saída e continuar na base com "aceitando" ligado recoloca no FINAL da fila.
     */
    const [comSaida] = await transacao
      .select({ id: saidasEntrega.id })
      .from(saidasEntrega)
      .where(
        and(
          eq(saidasEntrega.entregadorId, entregadorId),
          ne(saidasEntrega.status, "concluida"),
        ),
      )
      .limit(1);

    const elegivel = participaDaFila(depois) && !comSaida;
    const jaEstava = atual.filaEntrouEm !== null;
    const entrando = elegivel && !jaEstava;
    const saindo = !elegivel && jaEstava;

    const camposParaGravar = {
      ...(mudanca.status === undefined ? {} : { status: mudanca.status }),
      ...(mudanca.disponivel === undefined
        ? {}
        : {
            disponivel: mudanca.disponivel,
            disponibilidadeAtualizadaEm: new Date(),
          }),
      ...(mudanca.aptoParaSaida === undefined
        ? {}
        : { aptoParaSaida: mudanca.aptoParaSaida }),
      ...(mudanca.naBase === undefined
        ? {}
        : {
            naBase: mudanca.naBase,
            leiturasConsecutivas: mudanca.leiturasConsecutivas ?? 0,
            ultimaLeituraEm: new Date(),
            ...(mudanca.presencaMudou
              ? { presencaAtualizadaEm: new Date() }
              : {}),
          }),
      // `now()` do banco: a ordem da fila é do servidor, nunca do relógio de quem chegou.
      ...(entrando ? { filaEntrouEm: sql`now()` } : {}),
      ...(saindo ? { filaEntrouEm: null } : {}),
    };
    // Reavaliação que não mudou nada não escreve no banco.
    if (Object.keys(camposParaGravar).length > 0) {
      await transacao
        .update(entregadoresEmpresa)
        .set(camposParaGravar)
        .where(eq(entregadoresEmpresa.id, entregadorId));
    }

    if (entrando)
      await transacao.insert(historicoFilaEntregador).values({ entregadorId });
    if (saindo) {
      await transacao
        .update(historicoFilaEntregador)
        .set({ saiuEm: new Date(), motivoSaida })
        .where(
          and(
            eq(historicoFilaEntregador.entregadorId, entregadorId),
            isNull(historicoFilaEntregador.saiuEm),
          ),
        );
    }

    return entrando ? "entrou" : saindo ? "saiu" : "sem-mudanca";
  });
}

// Reavaliação sem mudar campo nenhum (ex.: depois de receber ou concluir uma saída).
export function sincronizarFila(
  banco: Banco,
  entregadorId: string,
  motivoSaida: string,
): Promise<"entrou" | "saiu" | "sem-mudanca"> {
  return aplicarMudancaOperacional(banco, entregadorId, {}, motivoSaida);
}

export type { Uf };
