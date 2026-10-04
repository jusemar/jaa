/**
 * ARMAZENAMENTO DE ARQUIVOS — a fronteira do Jaa com qualquer provedor de storage.
 *
 * O domínio nunca conhece Cloudflare, S3 ou disco local: ele pede "guarde estes bytes com esta chave"
 * e recebe uma chave de volta. Trocar de provedor é escrever outra implementação desta interface,
 * exatamente como já acontece com geocodificação (`GeocodificadorEndereco`) e rotas (`MotorDeRotas`).
 *
 * A CHAVE é o que fica gravado no banco; a URL pública é montada na leitura. Assim, mudar de domínio
 * ou de provedor não invalida nenhuma linha já gravada.
 */
/** O que TODO armazenamento faz: guardar e remover bytes por chave. */
export interface OperacoesDeArmazenamento {
  /** Guarda os bytes e devolve a chave efetivamente usada. */
  salvar(entrada: { chave: string; conteudo: Buffer; tipoConteudo: string }): Promise<{ chave: string }>;
  /** Remove um objeto. Remover o que não existe não é erro (a operação é idempotente). */
  remover(chave: string): Promise<void>;
  /** Nome do provedor, para diagnóstico e logs. Nunca inclui credencial. */
  readonly nome: string;
}

/** Armazenamento PÚBLICO (avatar, logo, produto): leitura por endereço público permanente. */
export interface ArmazenamentoDeArquivos extends OperacoesDeArmazenamento {
  /** Endereço público de leitura, ou null quando o armazenamento não publica URLs. */
  urlPublica(chave: string): string | null;
}

/*
 * Armazenamento PRIVADO (futuras mídias de conversa): NÃO existe endereço público. A leitura é uma
 * URL ASSINADA, de curta duração, que a API só gera DEPOIS de autorizar quem pede. A URL nunca é
 * gravada no banco: o banco guarda a chave, e cada leitura gera a sua.
 */
export interface ArmazenamentoPrivado extends OperacoesDeArmazenamento {
  /**
   * URL temporária de leitura. `agora` existe para testes e para, no futuro, alinhar o horário da
   * assinatura a janelas (mesma URL dentro da janela = cache aproveitado).
   */
  urlAssinadaLeitura(chave: string, opcoes?: { validadeSegundos?: number; agora?: Date }): string;
}

// Validade padrão da leitura privada: curta o bastante para não virar link permanente, longa o
// bastante para a conversa aberta não renovar a todo momento.
export const VALIDADE_PADRAO_URL_ASSINADA_SEGUNDOS = 20 * 60;
// Teto aplicado pelo Jaa (o SigV4 permitiria 7 dias): ninguém gera link longo "sem querer".
export const VALIDADE_MAXIMA_URL_ASSINADA_SEGUNDOS = 60 * 60;
export const VALIDADE_MINIMA_URL_ASSINADA_SEGUNDOS = 60;

/**
 * Armazenamento AUSENTE: sem credenciais configuradas, o Jaa não inventa bucket nem URL — ele recusa
 * o upload com um erro claro. Nada de "salvou" mentiroso, e nada de guardar imagem no PostgreSQL.
 */
export class ArmazenamentoNaoConfiguradoErro extends Error {
  constructor() {
    super("Armazenamento de arquivos não configurado.");
    this.name = "ArmazenamentoNaoConfiguradoErro";
  }
}

export const armazenamentoIndisponivel: ArmazenamentoDeArquivos = {
  nome: "indisponivel",
  async salvar() {
    throw new ArmazenamentoNaoConfiguradoErro();
  },
  async remover() {
    // Sem armazenamento não há objeto para remover: silenciar aqui evita quebrar a edição do perfil.
  },
  urlPublica() {
    return null;
  },
};

export const armazenamentoPrivadoIndisponivel: ArmazenamentoPrivado = {
  nome: "indisponivel",
  async salvar() {
    throw new ArmazenamentoNaoConfiguradoErro();
  },
  async remover() {
    // Sem armazenamento não há objeto para remover.
  },
  urlAssinadaLeitura() {
    throw new ArmazenamentoNaoConfiguradoErro();
  },
};
