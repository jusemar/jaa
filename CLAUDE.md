# CLAUDE.md — Regras Oficiais do Projeto Jaa

> Este arquivo é a **única fonte de verdade arquitetural e operacional do projeto Jaa**.
> Toda IA, agente de código e desenvolvedor deve lê-lo antes de criar, alterar ou reorganizar código.
> Em caso de conflito entre uma sugestão, código antigo, documentação secundária ou padrão genérico e este arquivo, **este arquivo prevalece**.

---

# 1. Objetivo do Jaa

O Jaa é uma plataforma de comunicação em tempo real que começa como um **mensageiro** e evoluirá para comunicação + comércio + conteúdo social.

O produto deve permitir, no futuro:

- pessoas conversarem com outras pessoas;
- pessoas conversarem com empresas;
- empresas conversarem com pessoas;
- uma mesma conta operar uma identidade pessoal e também identidades empresariais autorizadas;
- empresas possuírem catálogo e receberem pedidos dentro da conversa;
- pedidos serem criados por catálogo, conversa natural ou combinação dos dois;
- acompanhamento de pedidos e entregas dentro da conversa;
- rastreamento de entregadores em tempo real;
- feed de publicações de pessoas e empresas.

O Jaa **não deve nascer como marketplace com um chat anexado**. O núcleo do produto é a comunicação.

---

# 2. Fase Atual do Projeto — REGRA CRÍTICA

## FASE 1: MENSAGERIA

Neste momento implementar somente o necessário para um mensageiro funcional.

Escopo inicial:

- autenticação;
- perfil pessoal;
- identidade pessoal;
- localizar/adicionar pessoas;
- iniciar conversa individual;
- lista de conversas;
- envio e recebimento de mensagens de texto;
- mensagens em tempo real;
- estados da mensagem quando aplicável: enviada, entregue e lida;
- reconexão;
- paginação/histórico de mensagens;
- notificações essenciais;
- bloqueio e proteções básicas contra abuso.

Critério principal de sucesso da primeira fase:

> Duas contas, em dispositivos diferentes, devem conseguir conversar de forma natural, confiável e em tempo real pelo Jaa.

## NÃO implementar ainda

Enquanto a fase atual for Mensageria, é proibido antecipar implementação de:

- catálogo;
- carrinho;
- pedidos;
- pagamentos;
- logística;
- rastreamento;
- feed;
- posts;
- curtidas;
- comentários;
- sistema de recomendação;
- IA para interpretar pedidos.

A arquitetura deve **permitir a evolução**, mas não devemos criar código, tabelas ou abstrações sem necessidade atual apenas porque serão úteis no futuro.

Exceção: decisões estruturais fundamentais que evitam uma futura quebra de arquitetura, especialmente o conceito de identidade/remetente, podem existir desde o início.

---

# 3. Roadmap Arquitetural

A evolução prevista é:

1. Mensageria;
2. Empresas e identidades empresariais;
3. Catálogo e pedidos dentro da conversa;
4. Pagamentos;
5. Entregas e rastreamento;
6. Feed e publicações;
7. Recursos inteligentes/IA.

Uma etapa só deve ser implementada quando for explicitamente iniciada.

---

# 4. Arquitetura Geral

Modelo oficial:

- **Monorepo**;
- **Feature-based por domínio**;
- clientes desacoplados do banco;
- API central como fronteira de segurança;
- contratos compartilhados;
- PostgreSQL como fonte de verdade persistente;
- realtime como parte central da arquitetura de mensageria;
- separação entre identidade da conta e identidade que participa de uma conversa.

Estrutura de alto nível:

```text
jaa/
├── apps/
│   ├── mobile/                 # React Native + Expo
│   ├── web/                    # Next.js
│   └── api/                    # API + realtime
│
├── packages/
│   ├── banco/                  # Drizzle, tabelas, relações e migrations
│   ├── contratos/              # Zod, DTOs e eventos compartilhados
│   └── configuracoes/          # configurações TypeScript compartilhadas quando necessário
│
├── CLAUDE.md                   # única fonte de verdade
├── package.json
└── ...
```

Não criar pacotes apenas para preencher essa estrutura. Pacotes devem surgir quando houver necessidade real.

---

# 5. Stack Oficial

## Linguagem

- TypeScript em modo estrito.

Evitar `any`. Quando o tipo for realmente desconhecido, usar `unknown` e fazer narrowing/validação.

## Mobile

- React Native;
- Expo;
- TypeScript.

O aplicativo deve continuar sendo um aplicativo React Native real. Expo é a infraestrutura e conjunto de ferramentas adotado, não uma limitação arquitetural.

## Web

- Next.js;
- React;
- TypeScript.

O web atenderá usuários pessoais e, principalmente no futuro, operações empresariais em desktop.

## API

- Node.js;
- TypeScript;
- API dedicada e independente do Next.js;
- HTTP para operações apropriadas;
- conexão realtime para mensageria.

A API é compartilhada por mobile e web.

## Realtime

Para a primeira arquitetura de mensageria, preferir uma solução madura baseada em WebSocket com suporte a:

- reconexão;
- acknowledgements;
- rooms/canais;
- autenticação da conexão;
- eventos tipados;
- recuperação após perda temporária da rede.

O transporte realtime deve ficar encapsulado para que a regra de negócio não dependa diretamente da biblioteca escolhida.

A escolha inicial preferencial é **Socket.IO**, desde que validada no momento da instalação.

## Banco

- PostgreSQL;
- Drizzle ORM;
- migrations versionadas.

Desenvolvimento deve preferir PostgreSQL local e isolado de produção.

Nenhum provedor de PostgreSQL em nuvem é obrigatório neste momento. A escolha de hospedagem será feita quando necessário.

## Autenticação

Preferência inicial:

- Better Auth, desde que a integração atual com Expo/React Native e com a API dedicada seja validada antes da instalação.

Não duplicar sistemas de autenticação entre web e mobile.

## Validação

- Zod;
- toda entrada externa deve ser validada no servidor;
- schemas que fazem parte do contrato cliente-servidor devem viver em `packages/contratos`.

## Estado de servidor no cliente

- TanStack Query para operações HTTP/cache quando fizer sentido;
- eventos realtime não devem ser forçados artificialmente ao modelo de requisição HTTP;
- o estado exibido deve ser reconciliado corretamente entre resposta HTTP, cache local e eventos realtime.

## Gerenciamento do monorepo

Começar simples:

- npm workspaces.

Adicionar Turborepo ou ferramenta semelhante somente quando houver ganho concreto em cache, pipelines ou execução coordenada.

---

# 6. Regra de Ouro: Mobile e Web NÃO acessam o banco

É proibido:

```text
mobile → PostgreSQL
web    → PostgreSQL
```

O fluxo correto é:

```text
Mobile ─┐
        ├──> API ───> PostgreSQL
Web ────┘      │
               └──> Realtime
```

Somente código confiável do servidor pode acessar o banco.

Exceções só podem existir para infraestrutura explicitamente aprovada e com modelo de segurança equivalente.

---

# 7. Identidade, Conta e Empresas — DECISÃO ESTRUTURAL

Não tratar `usuario` e `remetente` como a mesma coisa.

Uma conta humana poderá futuramente:

- conversar como sua identidade pessoal;
- administrar uma ou mais empresas;
- responder em nome de uma empresa quando possuir permissão.

Portanto, o domínio deve distinguir conceitualmente:

```text
Usuário/Conta
    ↓ possui ou pode operar
Identidade
    ↓ participa de
Conversa
    ↓ envia
Mensagem
```

Futuramente:

```text
Organização/Empresa
    ↓ possui
Identidade empresarial
    ↑ operada por
Membros da organização
```

Uma mensagem deve possuir um remetente/identidade claramente determinado. Não construir o sistema supondo que toda mensagem será eternamente enviada apenas por `usuarioId`.

Na Fase 1, a identidade pode ser somente pessoal, mas a modelagem não deve impedir a posterior identidade empresarial.

---

# 8. Multitenancy

O Jaa utilizará um modelo híbrido.

## Global

Usuários pessoais pertencem à plataforma Jaa e não a um tenant empresarial.

## Empresas

Empresas/organizações funcionarão como tenants lógicos.

Dados empresariais futuros deverão ter isolamento e autorização por organização quando aplicável.

Não criar:

- um banco por empresa;
- uma aplicação por empresa;
- duplicação de tabelas por empresa.

Usar PostgreSQL compartilhado com isolamento lógico, autorização obrigatória e índices adequados.

Funcionários de uma empresa nunca devem ganhar acesso às conversas pessoais do dono apenas por pertencerem à empresa.

---

# 9. Arquitetura por Domínio

Cada domínio deve possuir um lugar claro.

Exemplos da fase inicial:

```text
autenticacao
usuarios
identidades
contatos
conversas
mensagens
notificacoes
bloqueios
```

Domínios futuros poderão incluir:

```text
organizacoes
catalogo
pedidos
pagamentos
entregas
localizacao
publicacoes
```

Esses domínios futuros não devem ser implementados antes da sua etapa.

---

# 10. Estrutura das Aplicações Cliente

Em `apps/mobile` e `apps/web`, organizar funcionalidades por domínio sempre que a complexidade justificar.

Exemplo:

```text
src/
├── features/
│   └── mensagens/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       ├── types/
│       └── constants/
│
├── components/
│   └── ui/
│
├── lib/
└── ...
```

Regra prática:

- até poucos arquivos simples: evitar criar hierarquia artificial;
- quando o domínio crescer: agrupar por responsabilidade/assunto;
- não criar pastas vazias por antecipação.

## Componentes

Componentes são UI.

É proibido colocar em componentes:

- acesso direto ao banco;
- autorização sensível;
- regra de negócio central;
- segredos;
- decisões que devam ser impostas pelo servidor.

---

# 11. Estrutura da API

A API também deve ser organizada por domínio.

Exemplo conceitual:

```text
apps/api/src/
├── features/
│   └── mensagens/
│       ├── rotas/
│       ├── eventos/
│       ├── casos-de-uso/
│       ├── repositorios/
│       ├── lib/
│       └── types/
│
├── plugins/
├── lib/
└── servidor.ts
```

Responsabilidades:

- `rotas/` → entrada HTTP;
- `eventos/` → entrada/saída realtime;
- `casos-de-uso/` → coordenação de operações do domínio;
- `repositorios/` → persistência/acesso aos dados daquele domínio;
- `lib/` → regras puras e utilitários específicos;
- `types/` → tipos internos não pertencentes ao contrato público.

Não criar `services/` genérico como depósito de lógica sem responsabilidade definida.

Handlers HTTP e handlers realtime devem ser finos: validar, autorizar, chamar o caso de uso e devolver resultado.

---

# 12. Contratos Compartilhados

`packages/contratos` representa a linguagem compartilhada entre API, mobile e web.

Pode conter:

- schemas Zod;
- payloads HTTP;
- respostas públicas;
- enums públicos;
- eventos realtime;
- payloads de eventos;
- tipos inferidos dos schemas.

Exemplo:

```text
packages/contratos/src/
├── autenticacao/
├── usuarios/
├── conversas/
└── mensagens/
```

Não colocar em `contratos`:

- código de banco;
- segredos;
- implementação de servidor;
- componentes React;
- regra de autorização;
- lógica que permita ao cliente decidir algo que pertence ao servidor.

Sempre que possível, definir o schema Zod como fonte e inferir o tipo TypeScript dele, evitando duplicação manual.

---

# 13. Banco de Dados

Estrutura preferencial:

```text
packages/banco/
├── src/
│   ├── conexao.ts
│   ├── schema.ts
│   └── tabelas/
│       └── <dominio>/
│           ├── <tabela>.ts
│           └── relacoes.ts
│
├── drizzle/
└── drizzle.config.ts
```

## Regras

- Drizzle é a definição versionada do schema;
- relações devem ser declaradas quando aplicável;
- chaves estrangeiras explícitas;
- constraints importantes devem existir no banco, não apenas na interface;
- índices devem refletir consultas reais;
- migrations devem ser versionadas;
- alterações estruturais não devem ser feitas manualmente em produção;
- migrations nunca devem ser editadas silenciosamente depois de aplicadas em ambiente compartilhado;
- nunca executar alteração destrutiva em produção sem autorização explícita.

## Nomenclatura

No código próprio do Jaa, preferir português claro.

Exemplos:

- `buscarConversas`;
- `enviarMensagem`;
- `identidadeId`;
- `conversaId`;
- `criadoEm`;
- `atualizadoEm`.

No banco, usar `snake_case`.

Exemplos:

- `usuarios`;
- `identidades`;
- `conversas`;
- `participantes_conversa`;
- `mensagens`;
- `criado_em`;
- `atualizado_em`.

São exceções válidas:

- nomes exigidos por frameworks;
- APIs externas;
- protocolos;
- bibliotecas;
- formatos padronizados;
- integrações de terceiros.

Não traduzir nomes oficiais de APIs/bibliotecas de maneira artificial.

---

# 14. Mensageria — Regras Arquiteturais

Mensagens são dado crítico.

A arquitetura deve considerar desde o início:

- identificador único da mensagem;
- identificador gerado pelo cliente para evitar duplicação em reenvios;
- persistência no servidor;
- confirmação de recebimento pelo servidor;
- ordenação consistente;
- paginação por cursor para histórico;
- reconexão;
- idempotência;
- autorização de participação na conversa;
- estados de entrega/leitura;
- tratamento de conexão instável.

## Regra essencial

Evento realtime recebido não substitui persistência.

O servidor é a autoridade final sobre a existência e estado persistido de uma mensagem.

Não confiar somente na memória do processo ou no socket aberto.

## Histórico

Para mensagens, preferir paginação por cursor. Evitar paginação por offset em históricos extensos.

## Idempotência

Repetir uma tentativa de envio após perda de conexão não pode criar várias cópias da mesma mensagem.

---

# 15. Offline e Reconexão

Aplicativo de mensagens deve assumir que a internet falhará.

A implementação deverá evoluir para:

- reconectar automaticamente;
- identificar mensagens pendentes;
- reenviar com idempotência;
- sincronizar eventos perdidos;
- exibir corretamente estados locais;
- evitar duplicação após reconexão.

Não considerar "funciona no Wi-Fi estável do desenvolvedor" como suficiente para concluir a mensageria.

---

# 16. Rastreamento de Entregador — DECISÃO FUTURA IMPORTANTE

Embora não pertença à Fase 1, o Jaa terá rastreamento de entregador em tempo real como recurso crítico da logística.

A aplicação principal continuará em React Native + Expo.

Quando a etapa de logística for iniciada, será permitido e esperado utilizar código nativo quando isso melhorar confiabilidade:

- Kotlin no Android;
- Swift no iOS;
- integração pelo Expo Modules API ou mecanismo nativo adequado e suportado na época.

O rastreamento deverá ser tratado como infraestrutura crítica e considerar:

- localização em segundo plano;
- tela apagada;
- economia de bateria;
- permissões do sistema;
- perda de internet;
- buffer e reenvio;
- frequência adaptativa;
- precisão;
- consumo de bateria;
- suavização de posições no mapa;
- detecção de localização antiga;
- segurança;
- privacidade;
- início e fim explícitos do período de rastreamento.

Nunca rastrear continuamente uma pessoa fora do contexto autorizado de entrega ativa.

Não implementar esse módulo agora.

---

# 17. UI e Design System

Mobile e web devem possuir experiência coerente, mas não precisam compartilhar os mesmos componentes React.

## Web

Preferir:

- componentes maduros;
- acessibilidade;
- Tailwind CSS quando adotado;
- shadcn/ui quando adequado;
- wrappers próprios em vez de alterar diretamente componentes de biblioteca.

## Mobile

Usar componentes e padrões apropriados ao React Native.

Não forçar componentes web dentro do mobile.

A biblioteca de styling mobile será definida/validada quando o aplicativo for inicializado. Não adicionar uma dependência apenas para imitar a estrutura web.

## Compartilhamento visual

Compartilhar quando fizer sentido:

- tokens;
- nomes semânticos;
- regras de marca;
- espaçamentos conceituais;
- tipografia;
- comportamento.

Evitar abstração prematura para compartilhar UI entre DOM e React Native.

## UX

Interfaces devem:

- funcionar bem em diferentes tamanhos de tela;
- possuir estados de carregamento, vazio e erro;
- fornecer feedback claro;
- respeitar acessibilidade;
- priorizar desempenho;
- evitar animações que prejudiquem fluidez.

---

# 18. Regra para Novas Interfaces

Quando uma funcionalidade visual complexa for iniciada:

1. entender o fluxo do usuário;
2. definir estados e ações;
3. criar a interface/fluxo;
4. validar experiência;
5. integrar a regra real/API/banco.

Isso não significa usar mocks onde dados reais já existem ou duplicar backend pronto.

Não criar migrations e estruturas extensas antes de entender o fluxo funcional quando a decisão de produto ainda estiver aberta.

---

# 19. Formulários

Quando houver formulários complexos:

- preferir React Hook Form quando adequado;
- Zod para schema/validação;
- validar novamente no servidor.

Não usar `useState` para reproduzir manualmente um sistema completo de formulários sem necessidade.

Formulários simples podem permanecer simples.

---

# 20. Segurança

Regras obrigatórias:

- nunca confiar no frontend;
- autenticação não substitui autorização;
- validar autorização em operações sensíveis;
- validar payloads externos;
- limitar abuso/rate limit em endpoints críticos;
- proteger conexão realtime;
- validar participação antes de permitir ler/enviar mensagens;
- não expor segredos em variáveis públicas;
- não registrar senha, token, cookie de sessão ou segredo em logs;
- não devolver dados pessoais sem necessidade;
- bloquear acesso entre organizações quando a fase empresarial existir;
- armazenar tokens sensíveis de mobile em mecanismo seguro apropriado;
- revisar uploads antes de habilitá-los.

Contatos não são regra de autorização.

Uma pessoa poderá iniciar conversa com alguém que ainda não está nos seus contatos, conforme as regras de privacidade/anti-spam definidas pelo produto.

---

# 21. Proteção Contra Spam e Abuso

Como o Jaa permitirá comunicação entre pessoas e empresas, a arquitetura deve permitir futuramente:

- solicitação de mensagem;
- bloquear usuário/identidade;
- denunciar;
- limites de envio;
- controles para mensagens comerciais não solicitadas;
- moderação.

Não usar "estar salvo nos contatos" como única proteção contra abuso.

---

# 22. Performance e Escalabilidade

Aplicar escalabilidade com pragmatismo.

Obrigatório quando aplicável:

- paginação;
- índices;
- evitar N+1;
- consultas selecionando apenas campos necessários;
- não carregar histórico inteiro de chat;
- evitar payloads realtime gigantes;
- evitar estado global sem necessidade;
- medir antes de otimizações complexas.

Não introduzir microsserviços, filas, Redis, Kubernetes ou sharding apenas porque o sistema poderá crescer.

Começar com arquitetura modular que permita extrair infraestrutura quando houver necessidade real.

Ao escalar realtime horizontalmente, introduzir o mecanismo de coordenação/adapter necessário sem alterar as regras de domínio.

---

# 23. Uploads e Mídia

Na Fase 1, texto é prioridade.

Quando mídia for iniciada:

- não armazenar arquivos grandes diretamente no PostgreSQL;
- usar storage apropriado;
- usar URLs/identificadores controlados;
- validar tipo e tamanho;
- impedir upload arbitrário inseguro;
- prever processamento quando necessário.

Não antecipar essa infraestrutura sem necessidade.

---

# 24. Observabilidade

A API deve evoluir com:

- logs estruturados;
- IDs de correlação quando necessário;
- registro de erros;
- métricas importantes;
- monitoramento do realtime.

Logs devem ajudar investigação sem expor conteúdo sensível desnecessariamente.

Nunca usar conteúdo privado de conversa como log comum de depuração em produção.

---

# 25. Testes

Toda alteração relevante deve possuir validação proporcional ao risco.

Preferir:

- testes unitários para regras puras;
- testes de integração para banco/API;
- testes de contrato para payloads importantes;
- testes de realtime para envio, confirmação e reconexão;
- testes E2E para fluxos críticos.

Antes de concluir uma tarefa, executar os comandos existentes aplicáveis:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Somente executar scripts que realmente existam no projeto.

Para mudanças restritas a um workspace, preferir validar o workspace afetado quando isso for suficiente.

Não afirmar que algo foi testado se não foi executado.

---

# 26. Qualidade do Código

O código deve ser:

- simples;
- legível;
- tipado;
- modular;
- testável;
- fácil de substituir;
- sem duplicação desnecessária.

## Comentários

Não comentar cada linha.

Comentários devem explicar principalmente:

- por que uma decisão não óbvia existe;
- regra de negócio importante;
- limitação externa;
- cuidado de segurança;
- workaround temporário.

Preferir nomes claros a comentários que apenas repetem o código.

## Tamanho

Não existe limite rígido universal de linhas por arquivo.

Quando um arquivo acumular responsabilidades diferentes, dividir por responsabilidade real.

Evitar arquivos gigantes, mas também evitar fragmentação artificial.

---

# 27. Dependências

Antes de adicionar biblioteca:

1. verificar se o projeto já possui solução equivalente;
2. avaliar manutenção e maturidade;
3. preferir biblioteca consolidada;
4. evitar dependência para tarefa trivial;
5. confirmar compatibilidade com versões atuais do projeto.

Não duplicar bibliotecas com a mesma finalidade sem justificativa.

Não atualizar dependências importantes de forma ampla durante uma tarefa não relacionada.

---

# 28. Variáveis de Ambiente

- manter `.env.example` atualizado;
- nunca versionar segredos;
- separar variáveis públicas e privadas;
- mobile e web nunca recebem credenciais de banco;
- segredos de servidor ficam somente no ambiente de servidor.

Não criar nomes reais de credenciais fictícias em documentação que possam ser confundidos com segredo válido.

---

# 29. Git e Alterações Existentes

Agentes devem:

- verificar o estado do Git antes de alterações relevantes;
- preservar alterações não relacionadas do usuário;
- nunca executar `git reset --hard`, limpeza destrutiva ou equivalente sem autorização;
- não sobrescrever trabalho paralelo;
- não incluir arquivos não relacionados em uma alteração;
- informar ao final os arquivos alterados/criados.

Commit, push, merge, rebase ou mudança de branch só devem ocorrer quando fizerem parte da tarefa solicitada ou estiverem explicitamente autorizados.

---

# 30. Regras de Trabalho da IA / Codex

Antes de codificar:

1. ler `CLAUDE.md`;
2. identificar a fase atual;
3. inspecionar a estrutura real do projeto;
4. verificar implementações existentes relacionadas;
5. respeitar contratos e padrões já adotados.

## Autonomia

A IA pode, sem pedir autorização a cada passo:

- ler arquivos;
- pesquisar referências técnicas;
- executar lint;
- executar typecheck;
- executar testes;
- executar build;
- investigar logs;
- corrigir erros diretamente relacionados à tarefa;
- usar navegador/headless para validar interface quando disponível.

## Deve pedir autorização ou parar antes de:

- apagar dados reais;
- executar migration destrutiva em produção;
- mexer em credenciais reais;
- efetuar pagamento/cobrança;
- publicar/deployar em produção sem solicitação;
- escolher entre decisões de negócio materialmente diferentes sem definição do usuário.

## Alterações grandes

Antes de alteração grande, explicar brevemente:

- objetivo;
- abordagem;
- partes afetadas.

Depois executar sem interromper o usuário com confirmações técnicas repetitivas.

## Ao finalizar

Informar:

- o que foi feito;
- arquivos criados/alterados;
- testes executados;
- resultado dos testes;
- pendências reais, se existirem.

---

# 31. Proibições Absolutas

É proibido:

- acessar PostgreSQL diretamente pelo mobile;
- acessar PostgreSQL diretamente pelo frontend web;
- colocar segredo no cliente;
- confiar no cliente para autorização;
- misturar regra crítica de negócio em componente visual;
- criar domínio duplicado em locais diferentes;
- usar `any` por conveniência;
- criar arquitetura futura inteira antecipadamente;
- criar microsserviços sem necessidade;
- criar um banco por empresa;
- acoplar regra de negócio à biblioteca de realtime;
- considerar mensagem enviada apenas porque apareceu na UI;
- perder idempotência em reenvios;
- esconder erro de TypeScript com cast inseguro sem justificativa;
- modificar migration aplicada em produção como se nunca tivesse existido;
- fazer mudança destrutiva sem autorização;
- inventar abstrações genéricas sem caso de uso real;
- adicionar dependências desnecessárias;
- tratar contatos como autorização para conversar;
- permitir que funcionário empresarial veja conversa pessoal do proprietário;
- implementar catálogo, pedidos, feed ou rastreamento durante a fase atual apenas por estarem no roadmap.

---

# 32. Decisões que NÃO estão fechadas ainda

Não inventar decisão para os itens abaixo. Eles serão definidos quando necessários:

- provedor de PostgreSQL em produção;
- hospedagem final da API;
- storage de arquivos;
- push notification provider/configuração final;
- provedor de mapas;
- biblioteca final de mapas;
- infraestrutura de filas;
- Redis;
- mecanismo de busca;
- pagamentos;
- biblioteca de styling mobile;
- infraestrutura final de rastreamento;
- estratégia de criptografia ponta a ponta, caso seja adotada.

Quando uma dessas decisões se tornar necessária, comparar opções de acordo com os requisitos reais do Jaa antes de adicionar tecnologia.

---

# 33. Atualização deste Arquivo

`CLAUDE.md` é um documento vivo, mas não pode ser alterado silenciosamente para justificar uma implementação.

Mudanças arquiteturais relevantes devem:

1. possuir motivo concreto;
2. considerar impacto em mobile, web e API;
3. evitar quebrar código existente sem necessidade;
4. ser registradas neste arquivo quando aprovadas.

Código deve seguir o `CLAUDE.md`, e não o contrário.

---

# 34. Regra Final

Antes de qualquer implementação, pergunte internamente:

1. Isso pertence à fase atual?
2. Qual domínio é responsável?
3. Essa lógica pertence ao cliente ou ao servidor?
4. Mobile e web poderão consumir o mesmo contrato?
5. Existe risco de acoplamento que dificultará empresas, pedidos ou realtime depois?
6. Estou resolvendo uma necessidade real ou criando arquitetura prematuramente?
7. A solução continua simples de entender e testar?

A prioridade do Jaa é:

> **confiabilidade da comunicação primeiro, evolução sem reescrita desnecessária depois.**

Na fase atual:

> **faça o mensageiro funcionar muito bem antes de transformá-lo em plataforma de comércio e rede social.**
