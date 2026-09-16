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
- empresas possuírem uma loja pública Web, servida pela mesma plataforma e compartilhável por link;
- pedidos serem criados por catálogo, conversa natural ou combinação dos dois;
- acompanhamento de pedidos e entregas dentro da conversa;
- rastreamento de entregadores em tempo real;
- feed de publicações de pessoas e empresas.

O Jaa **não deve nascer como marketplace com um chat anexado**. O núcleo do produto é a comunicação.

---

# 2. Fase Atual do Projeto — REGRA CRÍTICA

## Estado atual

A Fase 1 (Mensageria) tem o núcleo implementado (seção 14). A **Fase 2 — Comércio** tem implementadas: **EMPRESAS + IDENTIDADE EMPRESARIAL** (seções 7 e 8), **CATÁLOGO/PRODUTOS com administração Web** (seção 7, "Produtos da empresa"), **CONVERSA Pessoa ↔ Empresa + catálogo para o cliente** (seção 7, "Conversas com empresa"), **CARRINHO + CRIAÇÃO DO PEDIDO JAA na conversa** (seção 7, "Carrinho e Pedido Jaa"), **GESTÃO DO PEDIDO PELA EMPRESA + ACOMPANHAMENTO PELO CLIENTE** (seção 7, "Operação do pedido"), **ENDEREÇOS DO CLIENTE + PONTO DE ENTREGA CONFIRMADO** (seção 7, "Endereço e ponto de entrega") e **ENTREGADORES DA EMPRESA + ATRIBUIÇÃO DAS ENTREGAS** (seção 7, "Entregadores e atribuição").

Continuam proibidos até serem explicitamente iniciados: categorias/variações/estoque, imagens de produto, pagamento dentro do Jaa, **rota otimizada, reordenação de paradas, GPS/rastreamento em tempo real, mapa do entregador em movimento, ETA, fila do cliente e frete** (o mapa existe para o cliente confirmar o ponto e para o entregador abrir o destino), loja pública funcional, administração de produtos no Mobile, avaliação de pedido, RBAC completo de funcionários e "Encontrar" definitivo. A lista "NÃO implementar ainda" abaixo segue valendo para eles.

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
- loja pública e domínio personalizado;
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
3. Catálogo e pedidos na loja pública e dentro da conversa;
4. Pagamentos;
5. Entregas e rastreamento;
6. Feed e publicações;
7. Recursos inteligentes/IA.

Uma etapa só deve ser implementada quando for explicitamente iniciada.

## Decisões de produto aprovadas para fases futuras

Registradas para orientar a arquitetura; **não implementar antes da etapa correspondente**.

### Domínio único de Pedido

O Jaa terá **um único domínio de Pedido**. Um Pedido Jaa poderá ter como origem:

- Chat;
- Loja pública;
- Catálogo;
- Feed/post com produto ou oferta vinculada.

Independentemente da origem, **não existirão sistemas de pedido separados**. Todas as origens convergem para o mesmo domínio (a origem é um atributo do pedido, não um sistema próprio):

```text
ORIGEM → PEDIDO JAA → ACOMPANHAMENTO EM TEMPO REAL
```

O acompanhamento deverá permitir a evolução de estados como:

```text
PEDIDO RECEBIDO → CONFIRMADO → EM PREPARAÇÃO → PRONTO → SAIU PARA ENTREGA → EM ROTA → ENTREGUE
```

Esse fluxo já está implementado (seção 7, "Operação do pedido"), com o desvio terminal **CANCELADO**. Pedidos poderão surgir da conversa ou da loja pública, sempre no mesmo domínio.

Quando a modalidade logística permitir, o acompanhamento poderá incluir a localização do entregador no mapa em tempo real e a previsão de chegada (seção 16).

### Pagamento na primeira versão: na entrega

Na primeira versão **não haverá pagamento dentro do Jaa**. O pagamento acontece **na entrega**, conforme a operação da empresa. Portanto, não implementar Stripe, Pix, cartão online, checkout financeiro, carteira, dados bancários ou qualquer transação financeira até nova decisão de produto.

Ao criar o pedido (etapa futura), o cliente informa a **forma pretendida de pagamento na entrega**, como instrução do pedido:

- **DINHEIRO**: pode informar **"troco para"** (ex.: total R$ 9,00, troco para R$ 10,00) para a empresa/entregador levar troco. O valor usa a mesma representação monetária segura (centavos inteiros);
- **CARTÃO**: registra apenas "Pagamento na entrega: Cartão". **Nunca** pedir número, validade, CVV, senha, token ou qualquer credencial financeira; o pagamento é presencial, com a solução da própria empresa/entregador.

Isso já está modelado e implementado na criação do pedido (seção 7, "Carrinho e Pedido Jaa").

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

O web atenderá usuários pessoais e, principalmente no futuro, operações empresariais em desktop e lojas públicas das empresas.

Antes de implementar ou alterar código específico do Next.js, consultar quando necessário a documentação versionada do pacote instalado em `node_modules/next/dist/docs/`, especialmente em caso de dúvida sobre APIs, convenções ou comportamento da versão atual. A geração automática de `AGENTS.md`/`CLAUDE.md` pelo Next.js fica desativada (`agentRules: false`) para manter este arquivo como única fonte de regras.

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

### Estado atual: conexão autenticada

Socket.IO integrado à API e ao web, **autenticado no handshake pela sessão Better Auth**:

- o servidor valida a sessão e deriva `usuarioId`, `identidadePessoalId` e `sessaoId`; o cliente nunca determina esses IDs;
- a conexão age como UMA identidade: a pessoal, ou a pedida em `auth.identidadeId` **se** a conta puder operá-la (seção 7, "Conversas com empresa"). Trocar de identidade no cliente = reconectar;
- sem sessão válida → `NAO_AUTENTICADO`; sessão válida sem identidade pessoal → `CADASTRO_INCOMPLETO`; identidade pedida não operável → `IDENTIDADE_NAO_AUTORIZADA` (recusa, nunca rebaixa para a pessoal em silêncio);
- cada socket fica associado à sessão específica que o autenticou;
- logout ou revogação da sessão desconecta imediatamente os sockets daquela sessão, sem derrubar outras sessões do mesmo usuário;
- cada reconexão passa novamente pela autenticação;
- o web envia o cookie da sessão Better Auth com `withCredentials`;
- o realtime do Expo deverá enviar a mesma sessão oficial do Better Auth, sem token paralelo.

Salas técnicas definidas somente pelo servidor (o cliente não entra em salas; `realtime/salas.ts`): `sessao:<id>` para encerrar conexões de uma sessão, `identidade:<id>` para entregar eventos a todas as conexões de uma identidade, `presenca:<id>` e `conversa:<id>` para entregar atividade efêmera a conexões **já autorizadas** (seção 14). Salas são só meio de entrega: nunca substituem a autorização de domínio.

Divisão HTTP × Socket.IO:

- dados persistentes e comandos de negócio (enviar, confirmar recebimento, confirmar leitura) → **HTTP autenticado**;
- estado/atividade **efêmera** (presença, digitando) → **Socket.IO**, com acknowledgement e payload validado por Zod; nada disso é persistido.

Eventos servidor → cliente: `mensagem:nova`, `mensagem:atualizada`, `mensagem:excluida-para-mim`, `mensagens:entregues`, `mensagens:lidas`, `conversa:nao-lidas`, `notificacao:nova-mensagem` (todos sempre após o commit), `presenca:atualizada` e `digitando:atualizado`. Cliente → servidor: `conversa:observar`, `conversa:deixar-de-observar`, `digitando:informar`. Contratos em `@jaa/contratos` (`realtime/eventos.ts`, `realtime/atividade-conversa.ts`).

Pendências do realtime:

- tratar a expiração natural da sessão com socket aberto quando surgirem eventos sensíveis;
- múltiplas instâncias da API exigirão adapter compartilhado do Socket.IO **e** coordenação distribuída de presença e digitando: os registros atuais são em memória de uma instância (interfaces `RegistroPresenca`/`RegistroDigitando` permitem trocar a implementação sem mudar handlers) (seção 22);
- avaliar rate limit/proteção específica do handshake conforme a escala;
- validar o envio da sessão no Socket.IO do React Native/Expo quando o realtime mobile for implementado.

## Banco

- PostgreSQL;
- Drizzle ORM;
- migrations versionadas.

Desenvolvimento deve preferir PostgreSQL local e isolado de produção.

Nenhum provedor de PostgreSQL em nuvem é obrigatório neste momento. A escolha de hospedagem será feita quando necessário.

## Autenticação

Adotado: **Better Auth**, integrado à API dedicada. A integração com Expo/React Native deve seguir o suporte oficial do Better Auth quando o mobile for autenticado.

Não duplicar sistemas de autenticação entre web e mobile.

Decisões da Fase 1:

- autenticação principal: **celular + OTP**; não há senha;
- Better Auth é responsável por conta, sessão e OTP (geração, expiração, tentativas e validação);
- a entrega do OTP fica atrás de `EntregadorOtp`: trocar o mecanismo de entrega não pode exigir reescrever a autenticação;
- entrega atual: somente local/desenvolvimento, proibida em produção;
- provedor de SMS comercial ainda não definido (seção 32).

### Telefone — somente celulares brasileiros nesta fase

- usuário informa somente DDD + celular, ex.: `(31) 98765-4321`;
- usuário não precisa digitar nem visualizar `+55`; não existe seletor de país/DDI;
- o servidor normaliza para E.164 com +55, ex.: `+5531987654321`;
- somente celulares brasileiros válidos são aceitos;
- internacionalização de telefone não deve ser implementada sem nova decisão de produto.

### Antes de ativar SMS comercial

Revisão obrigatória de:

- rate limiting considerando CGNAT;
- limite diário por telefone;
- proteção contra SMS pumping;
- monitoramento de custos e abuso;
- `trustProxy` conforme a infraestrutura real.

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

Responsabilidades:

- conta autenticável e sessão: Better Auth (seção 5);
- identidade: domínio Jaa; a tabela de conta do Better Auth não é a identidade pública/social do produto.

Cada conta possui **exatamente uma identidade pessoal** e pode operar identidades empresariais autorizadas, sem misturar conversas pessoais e empresariais (seção 8).

## Empresas e identidade empresarial (Fase 2 — fundação implementada)

Modelagem (evolução do mesmo domínio de identidades, sem sistema paralelo):

```text
conta (users) ─┬─ identidade PESSOAL (identidades.usuario_id)
               └─ membros_empresa (papel) ─→ empresa ─→ identidade EMPRESARIAL (identidades.empresa_id)
```

- `identidades.tipo` = `pessoal | empresarial`, com **exatamente um dono** conforme o tipo (CHECK `identidades_dono_por_tipo`): pessoal → `usuario_id`; empresarial → `empresa_id`, sem conta dona. Uma identidade empresarial por empresa (índice único parcial);
- `empresas` (`id`, `slug`, `status`, datas): o **nome público é o `nome_exibicao` da identidade empresarial** e o @usuario também vive nela, sem cópia na empresa (uma fonte só);
- entregador NÃO entra aqui: é vínculo próprio (`entregadores_empresa`, seção "Entregadores e atribuição"), sem permissão administrativa nenhuma;
- `membros_empresa (empresa_id, usuario_id, papel)`: vínculo **conta ↔ empresa**, nunca identidade pessoal ↔ empresa. Operar uma empresa não expõe à empresa nem a futuros membros as conversas, contatos ou dados da identidade pessoal. Papel hoje só `proprietario`; administrador, atendente, funcionário e entregador entram como novos valores + permissões;
- criação atômica: empresa + identidade empresarial + proprietário numa transação; um **trigger de constraint diferido** recusa no commit empresa sem identidade empresarial ou sem proprietário. Na migration, valores de enum recém-adicionados são comparados como texto (o migrator aplica tudo numa transação).

Identificadores:

- **@usuario** (identidade): mesmo espaço único para pessoas e empresas;
- **slug** (empresa): endereço público da futura `/loja/<slug>`, único, `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–60, com reservados em `@jaa/contratos`. **Nunca autoriza**; as APIs usam ids e vínculos.

Autorização centralizada (`features/empresas/lib/autorizacao-empresas.ts`):

- rotas e casos de uso pedem **permissões** (`ver-empresa`, `editar-empresa`, `operar-identidade-empresarial`) resolvidas por uma tabela papel → permissões; nada de `empresa.usuarioId === usuario.id` espalhado;
- "esta conta pode operar esta identidade?" = `autorizarOperacaoIdentidade` (pessoal própria ou empresarial com permissão);
- dono, papel e conta **sempre da sessão**; campos enviados pelo cliente são descartados. Sem acesso ou inexistente → 404 (`EMPRESA_NAO_ENCONTRADA`, `IDENTIDADE_NAO_ENCONTRADA`).

API: `POST /empresas`, `GET /empresas`, `GET /empresas/:id`, `PATCH /empresas/:id` (nome/slug), `GET /identidades/operaveis`, `GET /identidades/operaveis/:identidadeId`.

Web (técnico): área "Minhas empresas" (slug sugerido pelo nome, editável e validado no servidor) e seletor **"Agindo como"** (Pessoa / Empresas). A seleção é **preferência de interface** (localStorage por identidade pessoal), só aceita se o id estiver na lista operável do servidor e confirmada via API; não é credencial.

O mensageiro opera por identidade ATUANTE (seção "Conversas com empresa"), então Pessoa↔Pessoa, Pessoa↔Empresa e Empresa↔Pessoa usam o mesmo domínio; Empresa↔Empresa é estruturalmente possível, sem fluxo próprio.

Pendências: RBAC de membros (convites, remoção, impedir remover o último proprietário), limite de empresas por conta e proteção contra reserva abusiva de slug/@usuario, e cadastro empresarial (CNPJ, endereço, horários) quando necessário.

## Produtos da empresa (Fase 2 — catálogo com administração Web)

**Decisão da primeira versão — WEB × MOBILE:** a gestão comercial (listar, criar, editar, alterar disponibilidade e, no futuro, imagens e configurações) é feita **pela Web**. O **Mobile não terá administração de produtos** e será a experiência do cliente (ver catálogo, escolher, pedir). Não é limitação definitiva: o domínio e a API são independentes da interface, então o Mobile poderá administrar depois sem reconstruir banco, API ou regras.

Um único domínio: **PRODUTO DA EMPRESA**. Não existem "produto web", "produto mobile", "produto do chat" nem "produto da loja"; os canais só apresentam o mesmo domínio.

Modelagem (`produtos`):

- sem tabela `catalogos`: o catálogo de uma empresa é o conjunto dos produtos dela. Categorias, seções, ordenação e destaques poderão referenciar `produtos` depois;
- `empresa_id` (FK) é estrutural e **imutável**: não existe nos contratos de edição e o trigger `produtos_empresa_imutavel` recusa trocar de empresa. Transferência, se existir, será fluxo explícito;
- `nome` (1–120, trim), `descricao` (opcional, 1–1000, **null** em vez de vazio), `disponibilidade` `disponivel | indisponivel` (indisponível continua existindo e administrável; futuramente não entra em pedido novo), `criado_em`, `atualizado_em`;
- **dinheiro em centavos inteiros** (`preco_centavos integer`, 1–99.999.999; R$ 39,90 = 3990) no banco, nos contratos (inteiro JSON; fração/string recusadas) e na UI (conversão por texto, sem float). Sem produto gratuito ou "sob consulta" nesta versão;
- sem estoque, SKU, variações ou grade. **Sem exclusão nesta etapa** ("indisponível" cobre a operação); quando o Pedido existir, será exclusão **lógica** (`excluido_em`), nunca DELETE, pois pedidos históricos referenciarão o produto.

API administrativa (conta autorizada; toda operação passa por `autorizarEmpresa` com permissão e busca o produto **escopado pela empresa** — produto de outra empresa = 404):

- `GET|POST /empresas/:empresaId/produtos`, `GET|PATCH /empresas/:empresaId/produtos/:produtoId`, `PATCH .../disponibilidade`;
- permissões `ver-produtos`, `gerenciar-produtos` e `alterar-disponibilidade-produto` (separada, para um futuro atendente mudar disponibilidade sem mexer em preço). Hoje o proprietário tem todas;
- sem acesso e empresa inexistente são indistinguíveis (404); slug não é chave de acesso; `empresaId` no corpo é descartado.

Não públicos: a futura loja `/loja/<slug>`, o app e o chat terão **consulta pública própria** (empresa pública → produtos disponíveis), com contrato só de dados permitidos, sem proprietário, conta, vínculos ou permissões.

Web (técnico): "Minhas empresas" → Abrir → **Produtos** (lista com preço formatado e disponibilidade, novo/editar, marcar disponível/indisponível). **Imagem do produto aparece desabilitada ("Em breve")**: sem upload, storage ou fornecedor escolhido (seção 32).

## @usuario

- identificador público da identidade, separado do telefone;
- telefone não deve ser usado como identidade pública;
- normalizado em minúsculas e único;
- 3–30 caracteres;
- nomes institucionais reservados ficam centralizados em `@jaa/contratos`; a lista pode evoluir.

---

# 8. Multitenancy

O Jaa utilizará um modelo híbrido.

## Global

Usuários pessoais pertencem à plataforma Jaa e não a um tenant empresarial.

## Empresas

Empresas/organizações funcionarão como tenants lógicos.

Conta autenticável, identidade pessoal, empresa e permissões empresariais são conceitos separados. Uma mesma conta poderá futuramente operar uma ou mais empresas quando possuir autorização, sem transformar a identidade pessoal em identidade empresarial. Pertencer à equipe de uma empresa nunca concede acesso às conversas ou aos dados pessoais do proprietário.

Cada empresa será uma unidade de isolamento comercial. Quando esse domínio for implementado, dados empresariais deverão carregar uma referência interna confiável à empresa correspondente, conceitualmente `empresaId`/`empresa_id` quando aplicável. Isso inclui, no futuro, produtos, categorias, pedidos, configurações comerciais, identidade visual, logística própria, catálogo, funcionários, permissões empresariais e demais dados privados da operação.

Toda consulta ou mutação empresarial deverá validar o escopo da empresa no servidor. Nunca confiar apenas em um `empresaId` enviado pelo cliente: o servidor deve confirmar que a conta/identidade autenticada possui autorização para operar aquela empresa.

## Banco compartilhado

A arquitetura inicial será multiempresa em PostgreSQL compartilhado. O isolamento deverá existir no domínio, banco, repositórios, casos de uso e autorização, permitindo que a evolução do núcleo beneficie todas as empresas.

Não criar:

- um banco por empresa;
- uma aplicação por empresa;
- duplicação de tabelas por empresa.

Autorização obrigatória e índices adequados fazem parte do isolamento. Não antecipar Row Level Security nem outra estratégia específica apenas por esta decisão; a estratégia concreta será definida quando o domínio empresarial for implementado.

## Loja pública por empresa

Cada empresa poderá futuramente possuir uma loja pública dentro da mesma aplicação Web do Jaa. O formato inicial aprovado é:

```text
jaa.com.br/loja/<slug-da-empresa>
```

Exemplo: `jaa.com.br/loja/pizzaria-oasis`.

O slug identifica publicamente a loja, mas não substitui o identificador interno da empresa e nunca deve ser usado sozinho como mecanismo de autorização. A mesma aplicação Web deverá resolver o slug, localizar a empresa e renderizar o catálogo, as configurações e a identidade visual correspondentes. Não haverá site, base de código, aplicação ou catálogo separado para cada empresa.

A URL poderá ser aberta no navegador sem o aplicativo Jaa instalado e compartilhada por WhatsApp, Instagram, Google, redes sociais, QR Code e outros canais. A política sobre quais ações comerciais exigirão conta ou login será definida quando essa etapa for implementada.

## WhatsApp como canal de aquisição

O Jaa não dependerá de a empresa abandonar o WhatsApp. A empresa poderá manter seu atendimento atual e compartilhar, inclusive em resposta automática, o link público da loja:

```text
WhatsApp → link público /loja/<slug> → loja Web Jaa → catálogo/pedido
```

O link público funcionará como porta de entrada externa para o ecossistema Jaa.

## Mesmo domínio comercial na Web e no Chat

A loja Web e o chat Jaa deverão futuramente consumir o mesmo domínio comercial, sem duplicar catálogo ou pedido:

```text
WhatsApp/Instagram/Google → URL pública → Loja Jaa ─┐
                                                     ├─→ mesmo Catálogo/Pedido
Chat Jaa → Empresa → Ver loja/produtos ─────────────┘
```

Pedidos iniciados por linguagem natural dentro da conversa poderão existir posteriormente, mas não devem ser implementados agora. A visão futura permanece:

```text
POST → INTERESSE → CHAT → PRODUTO → PEDIDO → PAGAMENTO
```

## Domínio próprio futuro

A arquitetura deverá permitir que uma empresa utilize futuramente domínio próprio, como `pizzariaoasis.com.br`, resolvendo para a mesma empresa, catálogo e infraestrutura do Jaa. Isso não deverá duplicar banco, aplicação ou catálogo. Domínios personalizados não devem ser implementados agora.

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

Domínios já existentes da Fase 2: `empresas`, `catalogo`, `produtos` e `pedidos` (criação do pedido na conversa).

Domínios futuros poderão incluir:

```text
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

## Imports de `@jaa/contratos`

O pacote é consumido como código-fonte TypeScript, sem etapa de build (`exports` aponta para `src/index.ts`).

- imports relativos internos usam extensão `.ts` explícita (ex.: `./erros.ts`);
- o próprio pacote e seus consumidores (API e web) usam `allowImportingTsExtensions` com `noEmit`;
- motivo: é a forma resolvida por tsx (API), Turbopack (web) e `tsc`; imports `.js` apontando para arquivos `.ts` não são resolvidos pelo Turbopack.

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

## Tabelas do Better Auth

As tabelas pertencentes ao Better Auth (`users`, `sessions`, `accounts`, `verifications`, `rate_limits`) são exceção às convenções próprias do Jaa quando necessário para manter compatibilidade oficial com a biblioteca. Por isso a conta autenticável fica em `users`, e não em uma tabela `usuarios` própria.

- são geradas pela CLI oficial (`npm run autenticacao:gerar-schema -w @jaa/api`) e aplicadas por migration versionada;
- não renomear nem modificar manualmente essas estruturas apenas para adequá-las às convenções internas do Jaa;
- tabelas próprias do Jaa continuam seguindo normalmente as convenções deste arquivo.

## IDs

- IDs internos do Better Auth permanecem no formato gerado e esperado pela biblioteca;
- entidades próprias do Jaa (ex.: `identidades`, `conversas`) usam `uuid` gerado pelo banco;
- mensagens usam **UUIDv7 gerado pelo PostgreSQL** (`uuidv7()`): identidade global e também chave de ordenação e de paginação por cursor, com o relógio do banco como autoridade (nunca o do cliente). Consequência: **PostgreSQL 18+ é requisito**, inclusive em produção.

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

## Implementação atual (Fase 1)

Núcleo de mensagens de texto 1:1 entre identidades pessoais:

- modelo `conversas` → `participantes_conversa` (identidades, nunca contas) → `mensagens`;
- conversa direta: exatamente duas identidades; chave canônica única do par (A↔B = B↔A), resistente a criação concorrente; aberta pelo `@usuario` do destino;
- o banco garante que o remetente participa da conversa (FK composta com participantes);
- **enviar é comando HTTP autenticado** (`POST /conversas/:id/mensagens`); o Socket.IO só entrega o evento `mensagem:nova` depois do commit no PostgreSQL. Não há segunda forma de enviar;
- remetente e leitor são sempre a identidade da sessão; quem não participa recebe 404, sem revelar se a conversa existe;
- idempotência: `idCliente` gerado pelo cliente por tentativa, único por remetente; retry devolve a mensagem existente, sem nova cópia nem novo evento;
- histórico por cursor (`antesDe` = id da mensagem mais antiga recebida), em ordem determinística por id;
- texto de 1 a 4000 caracteres, sem conteúdo só com espaços, validado em `@jaa/contratos` e no banco.

## Resposta a uma mensagem (Fase 1)

- `mensagens.mensagem_respondida_id` (nulo = mensagem comum) com **FK composta** `(conversa_id, mensagem_respondida_id) → mensagens(conversa_id, id)`: o banco garante que a original existe e é da **mesma conversa**; CHECK impede responder a si mesma; índice parcial sustenta a FK;
- a referência aponta para a mensagem (qualquer tipo): responder foto, áudio, produto ou pedido no futuro reutiliza a mesma coluna; muda só a prévia, discriminada por `tipo`;
- exclusão é **lógica (tombstone)** (seção "Edição e exclusão"): a linha original permanece, a FK continua válida e a referência passa a indicar `excluida: true` sem conteúdo. Por isso a FK é `NO ACTION`, sem cascata nem `SET NULL`; `NO ACTION` também permite apagar em uma instrução mensagens que se referenciam (limpezas de teste);
- envio: `mensagemRespondidaId` opcional em `POST /conversas/:id/mensagens`, no mesmo fluxo validar → persistir → commit → `mensagem:nova` (sem evento próprio). Inexistente ou de outra conversa (mesmo que o remetente participe dela) → 404 `MENSAGEM_RESPONDIDA_NAO_ENCONTRADA`, sem distinguir os casos. A referência faz parte da tentativa: mesmo `idCliente` com referência diferente/ausente → 409 `ID_CLIENTE_REUTILIZADO`;
- leitura: toda `Mensagem` traz `mensagemRespondida` (null ou `{ id, remetente: { identidadeId, nomeExibicao }, tipo, previaConteudo, conteudoTruncado }`), montada por subconsulta pela PK (sem N+1) no histórico, no envio, em `mensagem:nova` e na lista. Não depende de a original estar na página carregada. Só dados públicos da identidade;
- a prévia é limitada pela API a 300 caracteres (payload previsível; a original não muda); a UI limita a duas linhas e adiciona reticências. "Você" é decidido no cliente comparando identidades;
- lista de conversas mostra só o conteúdo da nova mensagem, sem reproduzir a referência.

## Estados de entrega e leitura (Fase 1)

Ciclo `enviada → entregue → lida`, com significados distintos:

- **enviada**: a API persistiu a mensagem (commit). Falha no banco não gera mensagem nem evento;
- **entregue**: um cliente autenticado da identidade destinatária **confirmou** que recebeu/processou a mensagem. Persistir, `emit()`, socket conectado ou usuário online **não** contam;
- **lida**: o destinatário, com a conversa aberta e visível, confirmou leitura.

Modelagem (fatos que só crescem; nenhum estado gravado na própria mensagem):

- `recebimentos_mensagem (mensagem_id, destinatario_identidade_id)` PK, com `conversa_id` e FKs compostas garantindo que a mensagem é daquela conversa e o destinatário participa dela. Uma linha por mensagem × destinatário: vale para 1:1 e grupos. Várias abas/dispositivos confirmam a mesma linha (`ON CONFLICT DO NOTHING`); rastrear por dispositivo no futuro = nova coluna/tabela, sem mudar o contrato;
- `participantes_conversa.lida_ate_mensagem_id`: **marcador de leitura** por (conversa, identidade). Leu todas as mensagens dos outros com id (UUIDv7) ≤ marcador. Avança só por `UPDATE` condicional (`null` ou `<` novo), atômico sob concorrência; sem FK para mensagens para evitar ciclo, validado na mesma instrução;
- **estado derivado na leitura** (`estado-mensagem-sql.ts`): `lida` se todo destinatário tem marcador ≥ id; `entregue` se todo destinatário leu ou confirmou recebimento; senão `enviada`. Igual para remetente e destinatário e nunca regride. Em grupos grandes, se o custo por mensagem pesar, introduzir agregados sem mudar o contrato.

Comandos HTTP (identidade sempre da sessão; nada de `identidadeId`/`destinatarioId` do cliente):

- `POST /mensagens/recebimentos { mensagemIds }` (1–100, podem ser de conversas diferentes): só mensagens recebidas pela identidade (de outra identidade, em conversa de que participa). Tudo ou nada: qualquer id próprio, alheio ou inexistente → 404 `MENSAGEM_NAO_ENCONTRADA` sem gravar. Repetir é idempotente;
- `POST /conversas/:id/leitura { ateMensagemId }`: um marcador cobre qualquer quantidade de mensagens. Não participante → 404 `CONVERSA_NAO_ENCONTRADA`; mensagem que não foi recebida nesta conversa (inclusive a própria) → 404 `MENSAGEM_NAO_ENCONTRADA`. Leitura atrasada/repetida responde o marcador atual.

Realtime (após o commit, para todas as conexões dos participantes): `mensagens:entregues { conversaId, destinatarioIdentidadeId, mensagemIds }` só com recebimentos **novos**; `mensagens:lidas { conversaId, leitorIdentidadeId, ateMensagemId }` só quando o marcador **avança**. `Mensagem.estado` vem no histórico, na resposta do envio (retry devolve o estado atual), em `mensagem:nova` (`enviada`) e na `ultimaMensagem` da lista.

Cliente Web (regra da fase):

- confirma recebimento de tudo que processa (evento `mensagem:nova`, histórico, prévia da lista) em fila única por aba, agrupada e com nova tentativa em falha de rede;
- confirma leitura somente com a conversa selecionada, histórico apresentado e `document.visibilityState === "visible"`;
- reconcilia por id e `estadoMaisAvancado` (`@jaa/contratos`): eventos repetidos, fora de ordem ou anteriores à própria mensagem nunca regridem o estado; reconexão recarrega a página mais recente.

Pendências conhecidas:

- sem sincronização de "mensagens pendentes de entrega": o Web só confirma o que carrega. Após ficar offline, mensagens anteriores à última de cada conversa ficam `enviada` até a conversa ser aberta (a leitura as cobre). O mobile deverá sincronizar pendências e usar o mesmo endpoint de recebimento;
- privacidade de confirmação de leitura (desativar) ainda não existe.

## Edição e exclusão (Fase 1)

- **editar**: `PATCH /conversas/:c/mensagens/:m { conteudo }`, só o autor (identidade da sessão), só texto não excluído; mesmas validações do envio. Atualiza `conteudo` e `editada_em`; nunca cria mensagem nem muda `id`, `criado_em` (horário/ordem), estado ou referência. Mesmo conteúdo = no-op sem evento. Evento `mensagem:atualizada` com a mensagem completa; não conta como não lida nem notifica. Sem histórico de versões. Respostas citando a editada mostram o conteúdo **atual** (prévia lida da original, sem snapshot);
- **excluir para todos**: `DELETE ...?escopo=todos`, só o autor. Tombstone: `excluida_para_todos_em` + `conteudo = ''` apagado **no banco** (CHECK exige vazio), linha preservada para ordem, cursores, recebimentos e respostas. APIs/eventos entregam `excluidaEm`, `conteudo: ""`, sem referência nem `editadaEm`; referências a ela trazem `excluida: true` sem prévia. Não pode ser editada (409 `MENSAGEM_EXCLUIDA`) nem respondida. Emite `mensagem:atualizada`; repetir devolve o tombstone sem evento. Sem prazo para excluir nesta fase;
- **excluir para mim**: `DELETE ...?escopo=mim`, qualquer participante → linha em `mensagens_excluidas_para_identidade (mensagem_id, identidade_id)` (FKs compostas: mensagem da conversa e identidade participante). Some do histórico/lista só dessa identidade, persistente; os demais continuam vendo. Idempotente. Evento `mensagem:excluida-para-mim { conversaId, mensagemId, ultimaMensagem }` só para as conexões dela; quem ocultou não recebe mais atualizações daquela mensagem. Referências em respostas continuam mostrando a original (não é exclusão global);
- códigos: participante não autor → 403 `MENSAGEM_DE_OUTRA_IDENTIDADE`; mensagem inexistente/de outra conversa/oculta para quem pede → 404 `MENSAGEM_NAO_ENCONTRADA`; não participante → 404 `CONVERSA_NAO_ENCONTRADA`;
- idempotência de envio: retry do mesmo `idCliente` depois de o autor editar ou excluir para todos devolve a mensagem atual (conteúdo não é mais comparável), sem recriar;
- sem restauração/lixeira; exclusão física de mensagens não existe nas APIs.

## Não lidas (Fase 1)

- **sem contador paralelo**: derivada do marcador `lida_ate_mensagem_id` = mensagens de outras identidades com id acima dele, sem excluídas para todos e sem excluídas para quem conta. Próprias nunca contam; edição não altera;
- lista: subconsulta por linha **da página** (sem N+1), busca por intervalo no índice `(conversa_id, id)` limitada a `LIMITE_CONTAGEM_NAO_LIDAS` (100 = "100 ou mais"; a UI mostra "99+"). O custo não cresce com o histórico;
- realtime: `conversa:nao-lidas { conversaId, naoLidas }` com valor **absoluto** só para as conexões da identidade afetada, recalculado do banco após o commit quando pode mudar (mensagem recebida, leitura, exclusão para todos, exclusão para mim). Recálculos serializados e coalescidos por (identidade, conversa), para que o último valor emitido reflita o último commit;
- Web: badge por conversa (oculto na conversa aberta e visível, que está sendo lida) e total no título da aba; ler usa o mecanismo de leitura existente. Com várias instâncias da API, o atualizador em memória segue válido por instância, mas eventos exigem o adapter compartilhado (seção 22).

## Notificações (Fase 1)

- domínio no servidor (`features/notificacoes`): cada mensagem **criada** gera `notificacao-nova-mensagem` para cada destinatário, **nunca o remetente**. Retry idempotente, edição, exclusão e leitura não notificam. Payload só com dados públicos do autor (`identidadeId`, `nomeExibicao`, `nomeUsuario`), prévia limitada e horário;
- estado persistente = lista + não lidas; a notificação é só aviso (nada persistido);
- entrega atual: realtime `notificacao:nova-mensagem` às conexões do destinatário. O Web exibe aviso in-app (máx. 3, um por conversa, deduplicado por id) **exceto** para a conversa aberta e visível; clicar abre a conversa;
- pendente: **push Web e mobile reais** (provedor, service worker, tokens de dispositivo, preferências e horário de silêncio) serão outro assinante do mesmo fato de domínio, provavelmente só para destinatários sem conexão ativa. A Notification API do navegador não foi ativada: exige decisão de UX para pedir permissão.

## Mídias (ainda não implementadas)

O compositor mostra Foto, Vídeo, Áudio e Documento **desabilitados** ("Em breve"), só como lembrete visual. Não há seletor de arquivo, upload, endpoint, tabela, storage ou fornecedor; a decisão de storage continua aberta (seção 32).

## Conversas com empresa e catálogo do cliente (Fase 2)

**Identidade ATUANTE** (sem sistema paralelo de chat empresarial): toda operação do mensageiro acontece em nome de uma identidade — a pessoal da conta ou uma empresarial que ela pode operar.

- o cliente envia só a INTENÇÃO: cabeçalho `x-jaa-identidade` (HTTP) e `auth.identidadeId` (handshake). Ausente = pessoal;
- o servidor resolve com `autenticarIdentidade` → sessão → conta → `autorizarOperacaoIdentidade` (mesma camada de permissões da empresa). Não autorizada → 403 `IDENTIDADE_NAO_AUTORIZADA` no HTTP e recusa no handshake. localStorage, slug, `empresaId` ou `identidadeId` do corpo nunca autorizam;
- **inbox por identidade**: a lista de conversas, o histórico, não lidas, estados, notificações, presença e digitando são consultados para a identidade atuante no servidor (não é filtro visual). Selecionar a empresa não dá acesso às conversas pessoais e vice-versa;
- **PARTICIPAR ≠ OPERAR**: qualquer pessoa pode conversar COM a empresa; só quem tem vínculo pode falar COMO a empresa (hoje, o proprietário);
- conversa direta continua pelo par canônico de IDENTIDADES: Pessoa→Empresa e Empresa→Pessoa resolvem para a mesma conversa. Abrir por @usuario aceita pessoa ou empresa com status ativo;
- para o cliente, quem fala é a identidade (ex.: "Pizzaria BH"); a pessoa que digitou **nunca** é exposta. Auditoria interna: `mensagens.operador_usuario_id`, `editada_por_usuario_id` e `excluida_por_usuario_id` guardam a conta que executou cada ação e jamais são serializadas. Com atendentes, a presença da empresa agrega as conexões de todos os operadores — nada precisa mudar;
- pendências: anti-spam/solicitação de mensagem para conversas com empresas, e revogar acesso de quem está conectado quando um vínculo for removido (hoje o vínculo é checado a cada requisição e a cada nova conexão).

**Catálogo do cliente** (`/publico/...`, sem autenticação; contrato próprio em `catalogo/catalogo-publico.ts`):

- `GET /publico/empresas/:identidadeId/catalogo` e `.../catalogo/produtos/:produtoId`: resolvem a empresa pela **identidade pública** (empresa ativa) e devolvem só produtos **disponíveis**, com id, nome, descrição e preço em centavos. Nunca proprietário, conta, vínculos, permissões, `empresaId` interno ou campos administrativos; nenhum parâmetro transforma a consulta em administrativa;
- mesmo domínio Produto da administração (nada é copiado para "produto do chat"); a futura `/loja/<slug>` reusa a mesma consulta, resolvendo a empresa pelo slug;
- `GET /descoberta/empresas?busca=` é uma descoberta TÉCNICA autenticada e temporária (não é o "Encontrar"); lista só empresas ativas. Pendente antes de abrir ao público: rate limit e cache.

Web: "Agindo como" passou a guiar o mensageiro; na conversa com empresa há **Ver produtos** (lista → detalhe, com **imagem "Em breve" desabilitada**) e, para o cliente, **Adicionar ao carrinho** (seção "Carrinho e Pedido Jaa"). **Mobile**: o fluxo de cliente (conversar com empresa e ver catálogo) depende da autenticação mobile, que ainda não existe; contratos e API já são reutilizáveis por ele, e o Mobile continua sem qualquer administração de produtos.

## Carrinho e Pedido Jaa (Fase 2 — criação do pedido na conversa)

Fluxo implementado: cliente → conversa com a empresa → **Ver produtos** → adiciona ao carrinho (com quantidade) → revisa o carrinho → **escolhe o endereço de entrega** (seção "Endereço e ponto de entrega") → informa como vai pagar **na entrega** → confirma → **Pedido Jaa criado** → a empresa recebe o pedido na própria conversa.

**1. Um único domínio de Pedido.** Não existem "pedido do chat", "pedido da loja" nem "pedido do app": tabelas `pedidos` + `itens_pedido` servem a todas as origens. A origem é **atributo** (`origem`, hoje só `conversa`, com `conversa_id` exigido por CHECK), não um sistema paralelo. A loja pública e o feed entrarão como novas origens, sem domínio novo.

**2. Pagamento é NA ENTREGA; o Jaa não processa pagamento.** Nenhum gateway, cobrança, split, carteira ou saldo. O pedido só registra a **instrução** de pagamento combinada entre cliente e empresa.

**3. Formas: DINHEIRO ou CARTÃO na entrega** (`forma_pagamento_entrega`). Nada além disso nesta etapa (sem Pix, sem online).

**4. Troco só existe no DINHEIRO.** `troco_para_centavos` é preenchido apenas quando o cliente diz que precisa de troco; a pergunta "Troco para quanto?" só aparece no dinheiro e só depois dessa escolha.

**5. Sem troco quando não é preciso.** Dinheiro sem troco grava `NULL`. Troco **igual** ao total é normalizado para `NULL` (não é troco); troco **menor** que o total é recusado (`PAGAMENTO_INVALIDO`).

**6. CARTÃO nunca tem troco.** O contrato do cartão é `.strict()` (troco no corpo = 400) e o CHECK `pedidos_troco_por_forma` impede a linha no banco.

**7. Nenhuma credencial financeira.** É proibido pedir, trafegar, exibir ou armazenar número, nome impresso, validade, CVV, senha, token ou qualquer dado de cartão. O pagamento é presencial, com a solução da própria empresa.

**8. O servidor é a autoridade do dinheiro.** O cliente envia só `produtoId` + `quantidade`; a API relê preço e disponibilidade no banco, recalcula subtotais e total em **centavos inteiros** e recusa produto indisponível, de outra empresa, inexistente ou repetido (`ITENS_INVALIDOS`). O carrinho do navegador é interface: nunca autoridade comercial. Segunda linha de defesa no banco: CHECK `itens_pedido_subtotal_coerente` (`subtotal = preço × quantidade`) e limites de quantidade/preço/total.

**9. Itens são SNAPSHOT.** `itens_pedido` guarda nome, preço unitário, quantidade e subtotal **no momento do pedido**; mudar o preço do produto depois não altera pedido nenhum. `produto_id` é referência auxiliar (`ON DELETE SET NULL`), não a fonte do valor.

**10. O carrinho é de UMA empresa só.** Produto de outra empresa exige **substituição explícita** confirmada pelo cliente — nunca troca silenciosa. O carrinho é persistido por identidade no navegador (sobrevive a recarregar e navegar) e some ao confirmar o pedido.

Modelagem e garantias:

- `pedidos`: `empresa_id`, `cliente_identidade_id`, `conversa_id` (FK composta `(conversa_id, cliente_identidade_id)` → `participantes_conversa`: o banco exige que o cliente participe da conversa), `status` (`status_pedido` já com `recebido → confirmado → em_preparacao → pronto → saiu_para_entrega → em_rota → entregue`; **default `recebido`**; a evolução e o cancelamento estão em "Operação do pedido"), forma de pagamento, troco, `total_centavos`, `id_cliente`;
- **criação atômica**: pedido + itens + mensagem do card em **uma transação**; ou tudo existe, ou nada existe (evento realtime só depois do commit);
- **idempotência** igual à das mensagens: `id_cliente` único por identidade (`pedidos_id_cliente_por_identidade_unico`). Repetir a mesma tentativa devolve **200** com o mesmo pedido (sem segundo card, sem segundo evento); a mesma chave com conteúdo diferente é **409 `ID_CLIENTE_REUTILIZADO`**;
- **card na conversa sem duplicar dados**: `mensagens.tipo` ganhou `pedido` e a coluna `pedido_id` (CHECK `mensagens_pedido_por_tipo`: tipo `pedido` ⇔ `pedido_id` presente, conteúdo vazio). O card lê o Pedido real (resumo em subconsulta JSON), então realtime, não lidas, notificações e exclusão continuam valendo sem regra nova. Card não é texto: não se edita nem responde;
- **API**: `POST /pedidos` (só identidade **pessoal**; empresarial = 403) e `GET /pedidos/:pedidoId`, visível **apenas** ao cliente dono e a quem opera a empresa do pedido — qualquer outra identidade recebe 404 (não revela existência);
- Web (técnica): "Adicionar" na lista/detalhe do catálogo, painel **Carrinho** (quantidade, remover, total, forma de pagamento, troco), confirmação, **card do pedido** no balão e **Ver pedido**. **Mobile**: nada de carrinho/pedido ainda (depende da autenticação mobile); contratos e API são reutilizáveis por ele.

## Operação do pedido: empresa conduz, cliente acompanha (Fase 2)

Mesmo domínio Pedido: a EMPRESA opera, o CLIENTE acompanha. Não existe pedido paralelo, nem nesta etapa entregador, GPS, mapa, rota, ETA ou frete — só a evolução operacional do estado.

**Máquina de estados** (`pedidos/status-pedido.ts`, compartilhada por API e clientes; o servidor é quem decide, o cliente usa só para exibir):

```text
recebido → confirmado → em_preparacao → pronto → saiu_para_entrega → em_rota → entregue
                              ↘ (a qualquer momento, pela empresa) cancelado
```

- **um passo por vez**: salto (recebido → entregue) e regressão (em_rota → em_preparacao) são recusados com 409 `TRANSICAO_PEDIDO_INVALIDA`;
- **pronto → saiu_para_entrega exige entregador atribuído e ativo** (409 `ENTREGADOR_NAO_ATRIBUIDO`; ver "Entregadores e atribuição");
- **dois terminais**: `entregue` (fim normal) e `cancelado` — nenhum dos dois avança, retrocede ou cancela de novo;
- **CANCELADO é da empresa**, enquanto o pedido não terminou, e **exige motivo curto** (3–200 caracteres; sugestões na interface + texto livre), gravado em `pedidos.motivo_cancelamento` (CHECK: motivo ⇔ cancelado) e no histórico. O cliente ainda **não** cancela sozinho: solicitação de cancelamento será outra regra;
- a interface mostra **só a próxima ação válida** (Confirmar pedido → Iniciar preparação → Marcar como pronto → Saiu para entrega → Marcar em rota → Marcar como entregue), nunca sete botões de status; cancelar exige confirmação explícita com motivo.

**Histórico append-only** (`historico_status_pedido`): `pedidos.status` é o estado ATUAL; a tabela guarda o que aconteceu (status, `ocorrido_em`, motivo quando cancelado). O evento `recebido` é gravado **na mesma transação da criação** do pedido (migration 0011 fez o backfill dos pedidos anteriores), e cada mudança grava status + histórico **numa transação só** — atual e histórico nunca divergem. Índice único `(pedido_id, status)`: o fluxo não repete etapa. Nada de evento futuro adiantado: a timeline exibida deriva as etapas futuras da máquina de estados só para visualização.

**Concorrência**: a empresa envia o `statusAtual` que estava vendo e o UPDATE só se aplica se o banco ainda estiver nesse status (`where id = … and status = …`). Dois operadores simultâneos → um vence, o outro recebe 409 e recarrega. Nunca se produz histórico impossível.

**Auditoria**: `historico_status_pedido.operador_usuario_id` guarda a CONTA que executou pela empresa (null quando o evento nasceu do cliente, na criação). Como em mensagens, **jamais é serializado**: para o cliente quem opera é a EMPRESA, nunca uma pessoa.

**Autorização** (central, `autorizarEmpresa`, com as permissões novas `ver-pedidos` e `gerenciar-pedidos`): empresa nenhuma lista, abre, altera ou cancela pedido de outra; sem acesso e inexistente são 404. O CLIENTE só lê o próprio pedido (`GET /pedidos/:id`, com histórico): qualquer tentativa de definir status, confirmar, cancelar ou usar as rotas da empresa é 404, inclusive mandando `x-jaa-identidade` da empresa.

**API** (intenção operacional, nunca `PATCH { status: qualquerCoisa }`): `GET /empresas/:empresaId/pedidos?filtro&antesDe&limite` (mais recentes primeiro, cursor por id UUIDv7, limite padrão 20 e máximo 50; o filtro "Em entrega" agrupa `saiu_para_entrega` + `em_rota` só na interface), `GET /empresas/:empresaId/pedidos/:pedidoId`, `POST …/avancar` e `POST …/cancelar`.

**Realtime**: `pedido:status-atualizado` (após o commit) vai só para o cliente dono e a identidade da empresa — nunca broadcast, nunca para terceiros. **Não é mensagem**: não cria mensagem, não reordena a conversa e **não incrementa não lidas**; o MESMO card da conversa passa a mostrar o novo status. Detalhe e timeline são relidos da API (o evento avisa, o banco é a verdade).

Web (técnica): agindo como a empresa surge a área **Pedidos** (filtros por status, lista com cliente/itens/total/pagamento/status, detalhe com timeline e a próxima ação); o cliente abre **Ver pedido** no card e vê a timeline (concluídas ✓, atual ●, futuras ○) e, se cancelado, o motivo. **Mobile**: nada de administração empresarial; o contrato de acompanhamento já é reutilizável quando a autenticação mobile existir.

## Endereço e ponto de entrega (Fase 2)

**Duas informações diferentes, nunca equivalentes:** o endereço TEXTUAL diz como o local é conhecido (rua, número, complemento, bairro, cidade/UF, CEP, referência) e é do cliente; a COORDENADA confirmada diz "entregar exatamente aqui". Geocodificação erra número, condomínio tem entrada em outra rua e base cartográfica tem imprecisão — por isso:

- **o mapa NUNCA corrige o texto**: ajustar o pin não faz reverse geocoding nem troca rua, número, bairro ou CEP. Cliente informou "Rua X, 150"? Continua 150, ainda que o mapa ache que ali é o 142;
- **geocodificação ≠ confirmação**: o palpite só serve para ABRIR o mapa perto do lugar provável. Só a ação explícita "Confirmar ponto de entrega" grava `latitude`, `longitude` e `localizacao_confirmada_em`. Abrir o mapa não confirma nada;
- **o pin é ajustável** (marcador fixo no centro e o mapa se move embaixo dele — funciona com uma mão no celular) e continua ajustável depois ("Ajustar ponto no mapa"): nova confirmação substitui o ponto e a data;
- **localização do aparelho é só REFERÊNCIA**, pedida quando o cliente toca no botão, explicada na hora ("apenas para ajudar você a conferir o ponto") e **nunca armazenada**. Ela jamais vira o destino sozinha: pedir para a casa da mãe estando no trabalho é normal, e **estar longe não bloqueia o pedido** (nada de regra rígida de distância).

**Agenda privada** (`enderecos_cliente`): vários endereços por identidade PESSOAL, com apelido ("Casa", "Trabalho"). Endereço nasce **sem ponto**; o banco garante tudo-ou-nada (lat + long + data) e faixas válidas (−90..90 / −180..180), com `numeric(9,6)` ≈ 0,11 m — precisão de navegação urbana **sem PostGIS**. Remoção é lógica (`arquivado_em`), porque pedidos antigos referenciam o endereço.

**Privacidade**: só o dono lista, cadastra, edita, arquiva e confirma (`/enderecos*`, identidade da sessão; endereço alheio é indistinguível de inexistente, 404). **Identidade empresarial não tem agenda de consumidor** (403) e **a empresa nunca acessa a agenda do cliente**: ela vê apenas o snapshot do endereço daquele Pedido.

**Reutilização e invalidação** (regra central em `enderecos/endereco.ts`, usada pela API e pela interface): endereço já confirmado é reutilizado direto nos próximos pedidos — sem mapa de novo. Mudar campo ESTRUTURAL (CEP, logradouro, número, complemento, bairro, cidade, UF) **invalida** a confirmação: as coordenadas são apagadas e a próxima utilização pede nova confirmação. Complemento entra na lista porque "Apto 302" → "Casa 2 dos fundos" pode ser outra entrada física; na dúvida, pedir de novo é melhor que entregar no lugar errado. Apelido é etiqueta pessoal e **não** invalida.

**Snapshot no Pedido** (`destinos_pedido`, 1:1 com o pedido): ao confirmar, o servidor copia do banco o endereço textual completo + a coordenada confirmada. Como nos itens, é histórico: editar o endereço salvo depois **não altera pedido nenhum**. `endereco_id` é referência auxiliar (`SET NULL`), não a fonte. Pedidos anteriores a esta etapa simplesmente não têm destino (`destino: null`) e continuam válidos — nada é inventado para eles.

**Servidor é autoridade**: o cliente envia só `enderecoId`; a API confere sessão → identidade pessoal → endereço é dele → ponto confirmado → monta o snapshot. Sem isso, 404 `ENDERECO_NAO_ENCONTRADO` ou 409 `LOCALIZACAO_NAO_CONFIRMADA`; o navegador nunca envia endereço nem coordenadas do pedido. Criação continua **atômica**: pedido + itens + destino + histórico inicial + card, tudo em uma transação.

**Fronteiras com fornecedores** (o domínio não conhece nenhum): `GeocodificadorEndereco` na API (implementação compatível com Nominatim/OpenStreetMap, ativada só por `GEOCODIFICACAO_URL`; sem ela nada externo é chamado e o mapa abre sem palpite) e `CriarMapaPonto` na Web (implementação Leaflet + tiles OSM, livre e sem chave, com URL configurável). Trocar de fornecedor — ou usar mapa nativo no Mobile — é escrever outra implementação.

**Preparado para o futuro, sem implementar agora**: a coordenada confirmada é a base de navegação do entregador, múltiplas entregas, ordenação/reordenação de rota, ETA e fila do cliente. Nada disso existe nesta etapa. Web: etapa "Entregar em" no carrinho (antes do pagamento) e "Ver ponto no mapa" no detalhe do pedido; latitude/longitude cruas não são exibidas para pessoas. **Mobile**: sem telas ainda (depende da autenticação mobile); contratos e API já servem a ele.

## Entregadores e atribuição das entregas (Fase 2)

**Entregador é um VÍNCULO de uma pessoa com uma empresa** (`entregadores_empresa`), não um login paralelo e **não um administrador**. Dentro do vínculo há duas coisas diferentes: o **STATUS** (profissional, administrado pela empresa) e a **DISPONIBILIDADE** (operacional, decidida pelo entregador) — ver "Disponibilidade" abaixo. A conta continua sendo uma pessoa comum do Jaa (mesma identidade pessoal, mesmas conversas) que também entrega; o vínculo é por empresa, então a mesma pessoa pode entregar para várias — nada de "usuario.entregador = true".

**Permissões separadas**: OPERAR A EMPRESA (`membros_empresa` + permissões, agora com `gerenciar-entregadores`) é uma coisa; EXECUTAR ENTREGA é outra. Entregador não acessa produtos, preços, catálogo administrativo, pedidos da empresa, conversas, outros entregadores nem configurações — todas essas rotas respondem 404 para ele. Quem opera a empresa, por sua vez, não é cadastrado como entregador dela (409).

**Convite e consentimento**: a empresa convida pelo **@usuario público** (nunca busca por telefone; a empresa só vê nome e @usuario). O vínculo nasce `convidado` e só a própria pessoa aceita (vira `ativo`) ou recusa (`inativo`). A empresa liga/desliga (`ativo`/`inativo`), mas não "aceita" por ninguém. Reconvidar reutiliza o mesmo vínculo, preservando o histórico dele.

**Atribuição** (`atribuicoes_entrega`): a empresa atribui ao pedido um entregador dela que esteja **ATIVO E DISPONÍVEL**. Só quando o pedido está **pronto**, **saiu_para_entrega** ou **em_rota** — antes disso não há o que atribuir, e terminal (entregue/cancelado) não aceita. **PRONTO → SAIU_PARA_ENTREGA exige entregador atribuído e ativo**, validado no servidor (409 `ENTREGADOR_NAO_ATRIBUIDO`); a interface só ajuda.

**Reatribuição e histórico append-only**: a linha sem `encerrado_em` é a atribuição ATUAL (índice único parcial: nunca dois entregadores atuais); reatribuir encerra a anterior e abre outra **na mesma transação**, inclusive com o pedido já em rota (imprevisto acontece). O histórico responde "14:30 Paulo, 14:45 Carlos, por qual operador", e **nunca é apagado** — mas **a autorização olha só a atribuição atual**: quem perdeu o pedido perde o acesso na hora. Concorrência: a empresa manda o entregador que via na tela; se mudou, 409 `ATRIBUICAO_CONFLITANTE` em vez de histórico incoerente.

**Revogação imediata**: desativar o vínculo encerra na hora as atribuições em aberto daquela pessoa (motivo "Entregador desativado"), e o pedido volta a não ter entregador — sem entregador não sai para entrega. Cancelar ou entregar o pedido também encerra a atribuição; o histórico permanece.

**O que o entregador vê** (`GET /entregas` e `/entregas/:pedidoId`, só o que está atribuído a ele AGORA): empresa, destino **snapshot** com o ponto que o CLIENTE confirmou (o entregador **nunca geocodifica de novo**), nome público do cliente, itens e como receber na entrega (dinheiro com "Troco para R$ X", ou cartão). Nada além disso: sem telefone do cliente, sem outros endereços, sem outras conversas, sem outros pedidos, sem histórico do cliente. Um entregador pode ter **várias entregas ativas ao mesmo tempo** (a rota com várias paradas vem depois). Entregue e cancelado saem da lista ativa.

**Máquina de estados continua da EMPRESA**: o entregador não confirma, prepara, marca pronto nem cancela — nesta etapa ele consulta suas entregas. Ações próprias dele virão com o fluxo de rota/GPS.

**Realtime** (`entrega:atualizada`, após o commit, só para as conexões do entregador envolvido — nunca broadcast): atribuição, mudança de status, reatribuição, cancelamento e revogação chegam sem F5; `entrega: null` significa "saiu da sua lista" e a tela remove o que ele não pode mais ver. O cliente não recebe nada disso: **trocas internas de entregador não são exibidas para ele** nesta etapa.

Web (técnica): agindo como a empresa há **Entregadores** (convidar por @usuario, ativar/desativar) e, no detalhe do pedido pronto, **Atribuir/Trocar entregador** com o histórico; a pessoa com vínculo vê **Minhas entregas**, separada da administração, com "Abrir no mapa" usando o ponto do pedido. **Mobile**: o entregador será principalmente móvel — contratos, API e autorização já são independentes do Next.js; as telas dependem da autenticação mobile, que ainda não existe.

### Disponibilidade operacional (por empresa)

**ATIVO ≠ DISPONÍVEL.** `status = ativo` diz que existe vínculo profissional válido ("esta pessoa entrega para nós"); `disponivel` diz que **ela está aceitando novas entregas desta empresa agora**. São decisões de donos diferentes: o vínculo é da empresa, a disponibilidade é de quem entrega.

- **é por empresa**, dentro do vínculo — nunca algo global como `usuario.disponivel`. Paulo pode estar disponível na Pizzaria A e indisponível na B, ou **disponível nas duas ao mesmo tempo**: o Jaa não escolhe por ele;
- **só o próprio entregador muda a sua** (`PATCH /entregas/vinculos/:id`, escopado pela conta da sessão). A empresa não tem rota para isso — tentar (empresa, outro entregador, estranho) é 404;
- **começa INDISPONÍVEL**: aceitar o convite cria o vínculo ativo, mas ninguém passa a receber entrega sem escolher ficar disponível. Vínculos anteriores à migration também começaram indisponíveis;
- **convite pendente e vínculo inativo não escolhem disponibilidade**; desativar o vínculo derruba a disponibilidade (o CHECK do banco exige `disponivel ⇒ ativo`), e reativar **não** a devolve — ele escolhe de novo;
- **NOVA atribuição e reatribuição exigem ATIVO + DISPONÍVEL**, conferido **dentro da transação** com a linha travada: a tela velha do gestor não burla nada, e a recusa (409 `ENTREGADOR_INDISPONIVEL`) **não mexe no entregador atual** do pedido. O seletor da interface já mostra só quem pode receber;
- **ficar indisponível ≠ perder o que já é seu**: as entregas já atribuídas continuam com ele, acessíveis e concluíveis — nada é cancelado, devolvido nem apagado. Só param as NOVAS atribuições. (Desativar o vínculo, por ser decisão administrativa, continua revogando as entregas em aberto — seção acima.);
- **privacidade entre empresas**: a Pizzaria A só sabe se Paulo está disponível *para ela*. Não descobre a disponibilidade dele em B, nem quantas entregas ele tem lá, nem quais empresas ele atende. O evento realtime `entregador:disponibilidade` vai **apenas** para a identidade da empresa daquele vínculo (nunca broadcast), e o gestor vê "Paulo está disponível para entregas." sem F5 — sem push real, que é etapa futura;
- **só dois estados**: disponível e indisponível. Nada de "ocupado", "em rota" ou "lotado" — capacidade e carga entram junto com rotas.

Web: a pessoa vê **"Empresas em que trabalho"** (uma linha por empresa, com 🟢/⚪ e o botão inverso) dentro da sua área; a empresa vê, por entregador, **Vínculo** e **Disponibilidade** separados.

**Preparado, sem implementar agora**: rota sugerida para várias paradas (que o entregador poderá reordenar), fila do cliente ("3 entregas antes da sua"), ETA, GPS e notificação "Indo até você".

## Presença e digitando (Fase 1)

Atividade efêmera, sem tabela, migration ou histórico.

- **Presença pertence à identidade** (não à conta, sessão ou socket): online enquanto houver ≥ 1 conexão realtime autenticada dela em qualquer aba/dispositivo. Fechar uma de várias conexões não muda nada; a última conexão encerrada vira offline só após **tolerância de 5 s**, e reconectar dentro dela não gera evento (reload/reconexão não "piscam"). Estados exibidos: somente Online/Offline (sem "visto por último");
- **sem broadcast global**: o cliente envia `conversa:observar { conversaId }` para a conversa aberta; o servidor confere no banco que a identidade do handshake participa dela, inscreve a conexão em `conversa:<id>` e `presenca:<outros>` e responde a presença atual. Não participante/inexistente → `CONVERSA_NAO_ENCONTRADA`. Máximo de 10 conversas observadas por conexão. Cada (re)conexão observa de novo; `conversa:deixar-de-observar` ou a queda encerram a entrega;
- **digitando**: `digitando:informar { conversaId, digitando }` só é aceito de conexão que já observa a conversa; a identidade vem do handshake. Repassado a quem observa a conversa, exceto as conexões da própria identidade. Agregado por (conversa, identidade): para quando a última conexão para;
- **controle de volume e estado preso**: o cliente avisa ao começar, renova no máximo a cada 2,5 s e para após 3 s sem tecla, ao apagar, enviar ou sair. O servidor absorve renovações com menos de 2 s, encerra por validade de 6 s sem renovação, na queda da conexão, ao deixar de observar e ao persistir mensagem do remetente (antes de `mensagem:nova`). O receptor descarta "digitando" não renovado em 8 s e limpa ao receber mensagem do outro ou perder a conexão;
- limitação conhecida: a autorização por participação permite observar a presença de quem se abriu conversa pelo `@usuario`; privacidade de presença, bloqueio e solicitação de mensagem refinarão essa regra quando existirem.

UI técnica da conversa (Web): cabeçalho só com nome, `@usuario` e Online/Offline/"digitando..." (sem prévia nem horário da última mensagem, que pertencem à lista). Cada balão mostra o horário do **seu** `criadoEm` persistido no canto inferior direito (data junto quando não é do dia) e, nas mensagens próprias, ✓/✓✓ do estado ao lado do horário.

## Lista de conversas (Fase 1)

- `GET /conversas?antesDe&limite`: somente conversas da identidade **da sessão**; nenhum parâmetro escolhe outra identidade;
- item = conversa + dados públicos da outra identidade (`identidadeId`, `nomeExibicao`, `nomeUsuario`) + última mensagem (com `estado`); nunca telefone, e-mail, conta ou sessão;
- atividade = última mensagem **visível para a identidade** (excluídas "para mim" são puladas; tombstone conta e aparece como "Mensagem excluída"); ordem e cursor = id (UUIDv7) da última mensagem, único entre conversas, logo determinístico mesmo com horários iguais; conversa sem mensagens visíveis não aparece;
- cada item traz `naoLidas` (seção "Não lidas");
- limite padrão 20, máximo 50;
- consulta única sem N+1 e **sem dado duplicado em `conversas`**: índice `participantes_conversa (identidade_id, conversa_id)` + busca `LATERAL ... LIMIT 1` no índice `(conversa_id, id)` de mensagens; só as linhas da página leem conteúdo e identidades. O custo cresce com o número de conversas da identidade (≈14 ms para 5.000 conversas localmente), não com o de mensagens;
- se identidades com dezenas de milhares de conversas (ex.: empresariais) exigirem, introduzir estado por participante (ex.: última atividade em `participantes_conversa`) mantido na mesma transação do envio, sem mudar o contrato;
- realtime: reutiliza `mensagem:nova`, sem evento novo. O cliente reconcilia por id da conversa, nunca regride para mensagem mais antiga; conversa ainda não carregada ou (re)conexão → recarrega a 1ª página.

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
- provedor de mapas/geocodificação para PRODUÇÃO (hoje: Leaflet + tiles OSM na Web e geocodificação opcional compatível com Nominatim, ambos livres e sem chave; a política de uso do OSM não cobre volume de produção, então o serviço definitivo será escolhido quando houver escala — sem inventar credenciais);
- infraestrutura de filas;
- Redis;
- mecanismo de busca;
- pagamentos online futuros (a primeira versão já está decidida: pagamento na entrega, sem pagamento dentro do Jaa; seção 3);
- biblioteca de styling mobile;
- infraestrutura final de rastreamento;
- estratégia de criptografia ponta a ponta, caso seja adotada;
- provedor de SMS comercial para entrega de OTP.

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
