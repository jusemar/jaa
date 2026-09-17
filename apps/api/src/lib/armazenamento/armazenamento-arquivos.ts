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
export interface ArmazenamentoDeArquivos {
  /** Guarda os bytes e devolve a chave efetivamente usada. */
  salvar(entrada: { chave: string; conteudo: Buffer; tipoConteudo: string }): Promise<{ chave: string }>;
  /** Remove um objeto. Remover o que não existe não é erro (a operação é idempotente). */
  remover(chave: string): Promise<void>;
  /** Endereço público de leitura, ou null quando o armazenamento não publica URLs. */
  urlPublica(chave: string): string | null;
  /** Nome do provedor, para diagnóstico e logs. Nunca inclui credencial. */
  readonly nome: string;
}

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
