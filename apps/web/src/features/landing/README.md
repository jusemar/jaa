# Home pública do Jaaa

Abra `http://localhost:3334/` com `npm run dev -w web`. Uma sessão válida mantém o aplicativo existente na home; sair da conta na home devolve a landing pública; contas incompletas seguem no cadastro. `/entrar` e `/cadastro` reutilizam o fluxo de autenticação existente. As rotas de links públicos continuam intactas.

A página e seus textos são pré-renderizados. O aplicativo autenticado é carregado separadamente. Os componentes de conversas usam os horários locais do navegador e entram após a hidratação, com espaço reservado para evitar diferenças de fuso.

## Demonstrações

A landing reutiliza `ListaConversas`, `BalaoMensagem`, `Cardapio`, `DetalheProdutoCatalogo` (incluindo `MontagemProduto`), `TimelinePedido`, `EntregadorDaEntrega` e `AvisoDaEntrega` e `SequenciaDaSaida`. Dados de demonstração são locais, sinalizados como exemplos, e não acionam APIs de mensagens, pedidos ou logística. O mapa SVG ilustra a sequência da rota; não é um mapa operacional nem screenshot. Na segunda rodada, os prints reais orientam cabeçalhos de conversa, cardápio/montagem, acompanhamento e zonas. Nenhum screenshot, nome, endereço, conversa ou foto de pessoa dos prints foi copiado para a página; o avatar usa as iniciais oficiais quando não há foto demonstrativa autorizada.

Logo: `/jaaa-logo-login.png`, já disponível na Web. Símbolo: `/landing/jaaa-simbolo.webp`, cópia otimizada do asset oficial `apps/mobile/assets/images/jaaa-icone.png`, sem alteração do original.

## Download

Configure `NEXT_PUBLIC_APP_DOWNLOAD_URL` no ambiente local com a URL HTTPS oficial e reinicie/recompile a Web. Sem URL válida, a página informa "Download em breve", sem link. Nenhum APK ou badge de loja foi criado.

## Movimento e acessibilidade

CSS e IntersectionObserver realizam entradas progressivas, revelação da rota e deslocamento curto do marcador. `use-narrativa.ts` percorre recebido → preparação → aguardando coleta → saída/fila → sua vez, uma única vez ao entrar no viewport. Pausa fora da tela, cancela timers ao desmontar, e a escolha manual de fila/sua vez encerra a reprodução automática. "Rever etapas" permite repetir. Movimento reduzido exibe o estado final sem reprodução automática. As demos têm botões de seleção de estado e interações reais de catálogo. `prefers-reduced-motion` desliga animações. O conteúdo continua legível sem JavaScript, com âncoras, headings e link para pular ao conteúdo.

## Validação local

- `npm run test -w web`
- `npm exec -w web tsc -- --noEmit`
- `npm run lint -w web`
- `npm run build -w web` (ou `npm run build -w web -- --webpack` quando o sandbox impedir o subprocesso do Turbopack).

A validação de sessão em navegador utiliza respostas locais simuladas: não cria contas nem envia OTP. Nenhuma publicação, commit, push ou mudança de API, banco ou Mobile é necessária.
