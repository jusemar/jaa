/*
 * COFRE DO DISPOSITIVO — onde ficam, NESTE aparelho, as credenciais de PIN e de biometria. Regras
 * puras (sem React Native), testadas com `node:test`.
 *
 * UM APARELHO, VÁRIAS CONTAS: cada conta que cria um PIN aqui tem a SUA autorização no servidor e as
 * SUAS chaves no armazenamento seguro. Nada é compartilhado nem sobrescrito entre contas — a conta B
 * criar o PIN dela não apaga, não troca e não revoga o que é da conta A.
 *
 * Não existe seletor de contas: o aparelho lembra só QUAL conta entrou por último (a "conta ativa") e
 * é a autorização DELA que a tela de entrada oferece. Para trocar de conta a pessoa usa "Usar SMS ou
 * e-mail" (ou a senha); ao entrar, a conta ativa passa a ser a nova e a autorização da anterior
 * continua guardada, intacta, para quando ela voltar.
 *
 * O identificador usado no NOME das chaves é o id público da identidade pessoal da conta (não é
 * segredo e não autoriza nada): quem decide de quem é cada credencial é sempre o servidor.
 *
 * TUDO fica no armazenamento seguro do sistema (expo-secure-store). Nada em AsyncStorage.
 */

/** Armazenamento SEGURO do aparelho (expo-secure-store). */
export interface ArmazenamentoSeguro {
  /** O aparelho tem biometria forte E alguma cadastrada? */
  podeUsarBiometria(): boolean;
  /** `protegido`: exige a biometria do sistema para ler; lança se a pessoa cancelar ou não for reconhecida. */
  ler(chave: string, protegido?: boolean): Promise<string | null>;
  gravar(chave: string, valor: string, protegido?: boolean): Promise<void>;
  apagar(chave: string): Promise<void>;
}

/** Qual conta entrou por último neste aparelho. Não é segredo: é só um ponteiro. */
export const CHAVE_CONTA_ATIVA = "jaa.dispositivo.conta-ativa";

/**
 * Chaves ÚNICAS da primeira versão (antes de o aparelho aceitar várias contas). Não dá para saber de
 * qual conta eram, então são apagadas — e a autorização que representavam é revogada no servidor.
 */
export const CHAVES_ANTIGAS = {
  credencial: "jaa.pin.credencial-do-dispositivo",
  outras: ["jaa.biometria.segredo-do-dispositivo", "jaa.biometria.ativa", "jaa.biometria.oferta-recusada"],
} as const;

export interface ChavesDaConta {
  /** SEGREDO: credencial do dispositivo autorizado (PIN). */
  credencial: string;
  /** SEGREDO, protegido pela biometria do sistema. */
  segredoBiometria: string;
  /** Marcas sem segredo: evitam abrir o aviso de biometria só para saber o estado. */
  biometriaAtiva: string;
  ofertaRecusada: string;
}

// O id vira parte do nome da chave: só o alfabeto que o armazenamento seguro aceita, e com tamanho de id.
const ID_DE_CONTA = /^[A-Za-z0-9_-]{8,64}$/;

/** As chaves de UMA conta neste aparelho; null se o id não serve para nomear chave. */
export function chavesDaConta(contaId: string): ChavesDaConta | null {
  if (!ID_DE_CONTA.test(contaId)) return null;
  return {
    credencial: `jaa.pin.credencial.${contaId}`,
    segredoBiometria: `jaa.biometria.segredo.${contaId}`,
    biometriaAtiva: `jaa.biometria.ativa.${contaId}`,
    ofertaRecusada: `jaa.biometria.oferta-recusada.${contaId}`,
  };
}

export function criarCofre(armazenamento: ArmazenamentoSeguro) {
  const ler = (chave: string) => armazenamento.ler(chave).catch(() => null);
  const apagar = async (chave: string) => {
    try {
      await armazenamento.apagar(chave);
    } catch {
      // Limpeza é melhor esforço.
    }
  };

  async function contaAtiva(): Promise<string | null> {
    const contaId = await ler(CHAVE_CONTA_ATIVA);
    return contaId && chavesDaConta(contaId) ? contaId : null;
  }

  async function chavesAtivas(): Promise<ChavesDaConta | null> {
    const contaId = await contaAtiva();
    return contaId ? chavesDaConta(contaId) : null;
  }

  return {
    contaAtiva,
    chavesAtivas,

    /** A conta que acabou de entrar passa a ser a deste aparelho. Não mexe em credencial de ninguém. */
    async usarConta(contaId: string): Promise<boolean> {
      if (!chavesDaConta(contaId)) return false;
      await armazenamento.gravar(CHAVE_CONTA_ATIVA, contaId);
      return true;
    },

    /** Credencial do dispositivo da conta ATIVA (a única que a tela de entrada oferece). */
    async lerCredencial(): Promise<string | null> {
      const chaves = await chavesAtivas();
      return chaves ? ler(chaves.credencial) : null;
    },

    /** Credencial de UMA conta específica (ex.: para o servidor revogar a anterior ao recriar o PIN). */
    async lerCredencialDe(contaId: string): Promise<string | null> {
      const chaves = chavesDaConta(contaId);
      return chaves ? ler(chaves.credencial) : null;
    },

    /** Guarda a credencial NOVA da conta — só nas chaves dela. */
    async guardarCredencial(contaId: string, credencial: string): Promise<boolean> {
      const chaves = chavesDaConta(contaId);
      if (!chaves) return false;
      await armazenamento.gravar(chaves.credencial, credencial);
      return true;
    },

    /** Apaga só a biometria de UMA conta neste aparelho (o PIN dela fica). */
    async esquecerBiometriaDe(contaId: string): Promise<void> {
      const chaves = chavesDaConta(contaId);
      if (!chaves) return;
      for (const chave of [chaves.segredoBiometria, chaves.biometriaAtiva]) await apagar(chave);
    },

    /** Apaga TUDO de UMA conta neste aparelho (PIN e biometria). As outras contas não são tocadas. */
    async esquecerConta(contaId: string): Promise<void> {
      const chaves = chavesDaConta(contaId);
      if (!chaves) return;
      for (const chave of Object.values(chaves)) await apagar(chave);
    },

    /**
     * Remove as chaves únicas da primeira versão. Devolve a credencial antiga (se havia), para o
     * servidor revogar aquela autorização; depois disto ela não existe mais no aparelho.
     */
    async retirarChavesAntigas(): Promise<string | null> {
      const credencial = await ler(CHAVES_ANTIGAS.credencial);
      for (const chave of [CHAVES_ANTIGAS.credencial, ...CHAVES_ANTIGAS.outras]) await apagar(chave);
      return credencial;
    },
  };
}

export type Cofre = ReturnType<typeof criarCofre>;
