import type { ArmazenamentoSeguro, ChavesDaConta } from "./cofre-dispositivo";

/*
 * BIOMETRIA DO APARELHO — as REGRAS, sem React Native (testadas com `node:test`).
 *
 * O que a biometria protege é um SEGREDO aleatório deste aparelho, que o servidor entregou uma vez e
 * do qual guarda só o hash. O aparelho o mantém cifrado por uma chave do Android Keystore que EXIGE
 * autenticação biométrica a cada uso: sem a digital/rosto aceitos pelo sistema, o segredo não é lido —
 * não é uma tela de enfeite na frente de um valor aberto. Nenhum dado biométrico chega ao Jaaa, e o
 * PIN nunca é guardado no aparelho (nem cifrado): a biometria não "digita o PIN" por ninguém.
 *
 * Entrar por biometria manda ao servidor a credencial do dispositivo + esse segredo; quem decide a
 * conta é o servidor. PIN e código (SMS/e-mail) continuam sendo caminhos independentes.
 *
 * MUDANÇA NAS BIOMETRIAS DO ANDROID: cadastrar uma digital nova (ou remover todas) invalida a chave
 * do Keystore; a leitura do segredo passa a devolver vazio. Isso é tratado como "biometria
 * desativada": o que restou no aparelho é apagado, o servidor é avisado, e a pessoa entra com o PIN —
 * podendo ativar a biometria de novo depois.
 */

/*
 * VÁRIAS CONTAS NO MESMO APARELHO: o segredo e as marcas são da CONTA ATIVA (`cofre-dispositivo.ts`).
 * A biometria de uma conta nunca lê, grava ou apaga o que é de outra.
 */

export type { ArmazenamentoSeguro };

export interface ServidorDaBiometria {
  ativar(credencial: string): Promise<{ ok: true; segredo: string } | { ok: false; semConexao: boolean }>;
  entrar(credencial: string, segredo: string): Promise<"ok" | "recusada" | "sem-conexao">;
  desativar(credencial: string): Promise<void>;
}

export interface DependenciasBiometria {
  /** Nesta etapa a biometria existe só no Android. */
  android: boolean;
  armazenamento: ArmazenamentoSeguro;
  servidor: ServidorDaBiometria;
  /** Credencial do dispositivo autorizado da conta ATIVA (a mesma do PIN); sem ela não há biometria. */
  lerCredencial(): Promise<string | null>;
  /** Chaves da conta ATIVA neste aparelho; null quando nenhuma conta entrou aqui ainda. */
  chaves(): Promise<ChavesDaConta | null>;
}

export type ResultadoAtivacao = "ok" | "indisponivel" | "cancelada" | "sem-conexao";

export type ResultadoEntradaBiometria =
  | "ok"
  // Cancelou, não foi reconhecida ou o aviso falhou: pode tentar de novo ou usar o PIN.
  | "cancelada"
  // O Android bloqueou a biometria por tentativas: agora é o PIN.
  | "bloqueada"
  // Segredo ausente/invalidado, aparelho sem biometria ou servidor recusou: biometria removida daqui.
  | "desativada"
  | "sem-conexao";

/** O sistema avisa o bloqueio por tentativas no texto do erro ("Lockout" / "Lockout permanent"). */
export function biometriaBloqueadaPeloSistema(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : typeof erro === "string" ? erro : "";
  return /lockout/i.test(mensagem);
}

/**
 * Por onde a entrada COMEÇA num aparelho sem sessão: biometria → PIN → código. A biometria só vem
 * primeiro quando o servidor a reconhece E este aparelho ainda a tem; o código (SMS/e-mail) nunca é
 * pedido sozinho — só quando a pessoa escolhe.
 */
export function entradaInicial(estado: { autorizado: boolean; biometriaNoServidor: boolean; biometriaNoAparelho: boolean }): "biometria" | "pin" | "codigo" {
  if (!estado.autorizado) return "codigo";
  return estado.biometriaNoServidor && estado.biometriaNoAparelho ? "biometria" : "pin";
}

/** Frases para a pessoa: sem termo técnico e sem supor "digital" ou "rosto". */
export const MENSAGENS_BIOMETRIA = {
  cancelada: "Não foi possível confirmar a biometria. Tente de novo ou use o PIN.",
  bloqueada: "A biometria está bloqueada por enquanto. Use o PIN.",
  desativada: "A biometria deste aparelho não está mais disponível. Use o PIN — depois você pode ativá-la de novo.",
  semConexao: "Sem conexão com o Jaaa.",
  naoAtivada: "A biometria não foi ativada. Tente de novo ou continue com o PIN.",
  indisponivel: "Este aparelho não tem biometria pronta para uso. Você continua entrando com o PIN.",
} as const;

export function criarBiometria({ android, armazenamento, servidor, lerCredencial, chaves: chavesDaContaAtiva }: DependenciasBiometria) {
  const chavesAtivas = () => chavesDaContaAtiva().catch(() => null);

  const semFalhar = async (acao: () => Promise<unknown>) => {
    try {
      await acao();
    } catch {
      // Limpeza é melhor esforço: nada aqui pode impedir a pessoa de seguir pelo PIN.
    }
  };

  /** Este aparelho PODE usar biometria agora? (Android com biometria forte e alguma cadastrada.) */
  function aparelhoCompativel(): boolean {
    if (!android) return false;
    try {
      return armazenamento.podeUsarBiometria();
    } catch {
      return false;
    }
  }

  /** Apaga tudo o que a biometria deixou NESTE aparelho (o PIN e a credencial do dispositivo ficam). */
  async function esquecerNoAparelho(): Promise<void> {
    const chaves = await chavesAtivas();
    if (!chaves) return;
    await semFalhar(() => armazenamento.apagar(chaves.segredoBiometria));
    await semFalhar(() => armazenamento.apagar(chaves.biometriaAtiva));
  }

  /** Desativa de vez: aqui e no servidor. O PIN continua funcionando. */
  async function desativar(): Promise<void> {
    const credencial = await lerCredencial().catch(() => null);
    if (credencial) await semFalhar(() => servidor.desativar(credencial));
    await esquecerNoAparelho();
  }

  return {
    aparelhoCompativel,
    esquecerNoAparelho,
    desativar,

    /** A biometria foi ativada neste aparelho e ele ainda pode usá-la? Não abre aviso nenhum. */
    async ativaNoAparelho(): Promise<boolean> {
      if (!aparelhoCompativel()) return false;
      const chaves = await chavesAtivas();
      return chaves !== null && (await armazenamento.ler(chaves.biometriaAtiva).catch(() => null)) === "1";
    },

    /**
     * ATIVAR (pessoa autenticada, aparelho já autorizado com PIN): o servidor entrega o segredo e o
     * aparelho o grava SOB a biometria — é aqui que o Android pede a digital/rosto. Se a pessoa
     * cancelar ou a gravação falhar, o servidor é avisado e nada fica ativado.
     */
    async ativar(): Promise<ResultadoAtivacao> {
      if (!aparelhoCompativel()) return "indisponivel";
      const [credencial, chaves] = [await lerCredencial().catch(() => null), await chavesAtivas()];
      if (!credencial || !chaves) return "indisponivel";

      const resposta = await servidor.ativar(credencial);
      if (!resposta.ok) return resposta.semConexao ? "sem-conexao" : "indisponivel";

      try {
        await armazenamento.gravar(chaves.segredoBiometria, resposta.segredo, true);
        await armazenamento.gravar(chaves.biometriaAtiva, "1");
      } catch {
        await semFalhar(() => servidor.desativar(credencial));
        await esquecerNoAparelho();
        return "cancelada";
      }
      await semFalhar(() => armazenamento.apagar(chaves.ofertaRecusada));
      return "ok";
    },

    /** ENTRAR: a biometria do sistema libera o segredo; o servidor confere e abre a sessão. */
    async entrar(): Promise<ResultadoEntradaBiometria> {
      // Aparelho sem biometria (removida, ou nenhuma cadastrada): o segredo não tem mais como ser lido.
      if (!aparelhoCompativel()) {
        await desativar();
        return "desativada";
      }
      const [credencial, chaves] = [await lerCredencial().catch(() => null), await chavesAtivas()];
      if (!credencial || !chaves) {
        await esquecerNoAparelho();
        return "desativada";
      }

      let segredo: string | null;
      try {
        segredo = await armazenamento.ler(chaves.segredoBiometria, true);
      } catch (erro) {
        return biometriaBloqueadaPeloSistema(erro) ? "bloqueada" : "cancelada";
      }
      // Vazio = segredo ausente ou chave invalidada (as biometrias do aparelho mudaram).
      if (!segredo) {
        await desativar();
        return "desativada";
      }

      const resultado = await servidor.entrar(credencial, segredo);
      if (resultado === "ok") return "ok";
      if (resultado === "sem-conexao") return "sem-conexao";
      // O servidor não aceita mais este segredo (dispositivo revogado, biometria desativada lá).
      await esquecerNoAparelho();
      return "desativada";
    },

    /** "Agora não" na oferta: não insiste a cada entrada com PIN (criar um PIN novo volta a oferecer). */
    async recusarOferta(): Promise<void> {
      const chaves = await chavesAtivas();
      if (chaves) await semFalhar(() => armazenamento.gravar(chaves.ofertaRecusada, "1"));
    },
    async ofertaRecusada(): Promise<boolean> {
      const chaves = await chavesAtivas();
      return chaves !== null && (await armazenamento.ler(chaves.ofertaRecusada).catch(() => null)) === "1";
    },
  };
}

export type Biometria = ReturnType<typeof criarBiometria>;
