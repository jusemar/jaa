/*
 * TOKENS DO JAA no Mobile — os MESMOS da Web (`apps/web/src/app/globals.css`), com os mesmos nomes
 * semânticos. A Web é a fonte da verdade visual do produto: lá os valores estão em oklch; aqui estão os
 * mesmos valores convertidos para sRGB (hex), porque o React Native não entende oklch.
 *
 * Mudou a paleta na Web? Converta de novo e mexa SÓ aqui — nenhuma tela escreve cor na mão.
 * Só tema claro, como a Web (que não tem modo escuro).
 */

export const Cores = {
  // Base neutra fria: o conteúdo colorido (produto, pedido, marca) se destaca sobre ela.
  fundo: "#F2F4F5",
  superficie: "#FFFFFF",
  superficieSuave: "#EEF2F3",
  // Realce de interação (fundo de ícone, item pressionado): um passo mais escuro que a superfície suave.
  realce: "#DAE7E9",
  conteudo: "#232C2D",
  conteudoSuave: "#647072",
  borda: "#DEE2E3",

  marca: "#009D72",
  marcaConteudo: "#FFFFFF",
  // Verde claro da marca: balão próprio, seleção, endereço escolhido. Texto escuro sobre ele.
  marcaSuave: "#DDF7D3",
  marcaSuaveConteudo: "#1D2822",

  // Mensagem LIDA (✓✓): `--cor-leitura` da Web. Só para esse estado.
  leitura: "#22A3E3",

  perigo: "#E7000B",
  perigoSuave: "#FDECEC",
  // Ouro só para o que é COMERCIAL: selo de empresa, avatar de empresa, card de pedido.
  ouro: "#EFBC3A",
  ouroSuave: "#FCF2D8",
  avatarEmpresa: "#F9E8BA",
  // O mesmo ouro escurecido até ter contraste de texto sobre fundo claro.
  aviso: "#856300",

  // Conversa: fundo QUENTE, diferente do resto do app (o "papel de parede" do chat).
  conversaFundo: "#F0EBDE",
  mensagemEnviada: "#DDF7D3",
  mensagemEnviadaConteudo: "#1D2822",
  mensagemRecebida: "#FFFFFF",

  // Estado SELECIONADO (opção marcada, forma de pagamento): `--cor-selecionado-fundo` da Web.
  selecionadoFundo: "#F0FBEB",
} as const;

export type Cor = keyof typeof Cores;

export const Espaco = {
  meio: 2,
  um: 4,
  dois: 8,
  tres: 12,
  quatro: 16,
  cinco: 24,
  seis: 32,
} as const;

// `--raio` (0.5rem) nos blocos e `--raio-compacto` (0.375rem) nos elementos densos, como na Web.
export const Raio = { bloco: 8, compacto: 6, total: 999 } as const;

// Alvo de toque mínimo no celular (os 44px dos primitivos da Web).
export const ALTURA_TOQUE = 44;

// Sombra curta dos cartões (`--sombra-cartao`): separa o card branco do fundo claro sem elevação dramática.
export const SombraCartao = {
  elevation: 1,
  shadowColor: "#232C2D",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 3,
} as const;
