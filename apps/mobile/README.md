# Jaa — aplicativo mobile

Aplicativo ÚNICO do Jaa (React Native + Expo SDK 57 + Expo Router). Não existem apps separados de
cliente, entregador ou profissional: as capacidades pertencem à mesma identidade pessoal e vêm do
servidor (`GET /conta/contexto`). As regras do projeto estão no `CLAUDE.md` da raiz.

## Estrutura

- `src/app` — rotas FINAS: `_layout` (Stack raiz), `(abas)` (Início, Entregas, Conta) e `diagnostico`
  (tela temporária de desenvolvimento, aberta pela aba Conta);
- `src/features` — domínio: `autenticacao` (senha e OTP, Better Auth + SecureStore), `conta` (contexto
  central, portão de sessão, conta), `inicio`, `entregas` (saída em andamento e rastreamento);
- `src/components/ui` — primitivos visuais do Jaa (Texto, Botao, CampoTexto, Cartao, Selo, Aviso…);
- `src/constants/theme.ts` — tokens (cores, espaços, raios), com os mesmos nomes semânticos da Web.

## Rodar (Development local)

Development é **local**: a API e o PostgreSQL rodam no PC, e o celular físico acessa o Metro e a API
pela **mesma rede Wi-Fi**. Não existe API pública, Railway nem Neon de Development, e o uso normal
não precisa de cabo USB.

**Um comando só** (quando for trabalhar no Mobile; nada inicia sozinho com o PC):

```bash
jaa-mobile        # ou: npm run mobile:iniciar
jaa-mobile-stop   # ou: npm run mobile:parar
```

`jaa-mobile` (`scripts/ambiente-local.sh`):

1. detecta o IP atual do Windows na rede e o IP atual do WSL;
2. confere o encaminhamento das portas 3333 e 8081 do Windows para o WSL e as regras de firewall.
   Se o IP mudou (depois de reiniciar, por exemplo) ou falta regra, corrige — e só nesse caso o
   Windows pede permissão de Administrador (UAC). Nada é duplicado;
3. liga o PostgreSQL local se estiver parado (sem migrations, sem alterar dados);
4. encerra API/Metro antigos do Jaa que tenham ficado abertos e sobe a API em segundo plano;
5. mostra o IP do PC, a URL da API e **o endereço para abrir no Jaa Dev** (`http://<ip-do-pc>:8081`);
6. abre o Metro neste terminal (teclas `r`, `j`, `m` funcionam). `Ctrl+C` fecha o Metro;
   `jaa-mobile-stop` encerra API e Metro.

Registros para copiar erros: `~/.cache/jaa/metro.log` (inclui os erros que aparecem no Android) e
`~/.cache/jaa/api.log` (inclui o código OTP de desenvolvimento). Não usa USB nem adb, e não inicia a Web.

No celular, abra o **Jaa Dev** (Development Client) e informe o endereço mostrado pelo comando (fica
nos recentes).

A URL da API **não é fixa no código**: sem `EXPO_PUBLIC_JAA_API_URL`, o app usa o mesmo host de onde
o Metro o serviu, na porta 3333. Abriu por `http://<ip-do-pc>:8081` → a API é `http://<ip-do-pc>:3333`;
se o IP do PC mudar, muda só o endereço digitado (o `jaa-mobile` já sobe o Metro sem essa variável).

Emulador Android: `jaa-android` (adb reverse + localhost), ou
`EXPO_PUBLIC_JAA_API_URL=http://10.0.2.2:3333 npx expo start --dev-client`.

A tela de entrada mostra, em desenvolvimento, a linha "Servidor: …" com o endereço da API em uso.

## Verificações

```bash
npm run typecheck -w mobile
npm test -w mobile          # lógica pura (node:test)
```

## Ambientes, builds e updates OTA

O Jaa tem **somente dois ambientes**, que são dois aplicativos Android diferentes e nunca se misturam:

| Ambiente | App | Pacote | Scheme |
| --- | --- | --- | --- |
| `development` | Jaa Dev | `com.jaa.app.dev` | `jaa-dev` |
| `production` | Jaa | `com.jaa.app` | `jaa` |

Quem decide é `APP_VARIANT` (`development` ou `production`; qualquer outro valor falha; ausente =
`development`). As regras ficam em `src/lib/variante.ts` e a configuração, em `app.config.ts` (não
existe `app.json`).

| Ambiente | API e banco |
| --- | --- |
| `development` | API e PostgreSQL **locais no PC**; celular pela rede Wi-Fi (seção "Rodar") |
| `production` | API pública `https://api.jaaa.com.br` + Neon; Web em `https://jaaa.com.br` |

Não existe terceiro ambiente (nada de preview, staging ou homologação), e os dois nunca compartilham
banco, API, sessão nem canal de update.

O **Jaa Dev** é o Development Client: gerado na nossa máquina (prebuild + Gradle), aberto pelo Metro.
Não usa o `eas.json`. O APK pode ir para o celular por qualquer meio (arquivo, Drive, adb).

**Versão**: `version` (em `app.config.ts`) é a versão do Jaa; o `runtimeVersion` segue a política
`appVersion`, então um update só chega a binários da MESMA `version`. Nos builds do EAS, o
`versionCode` (número do binário Android) é contado pelo EAS, um contador por pacote, +1 a cada
build — builds não alteram o código-fonte. Cada aparelho mostra o seu no fim da aba Perfil
("Jaa 0.6.0 · Build 3" e, no Jaa Dev, "Development").

**Builds e updates pelo EAS** (`scripts/distribuicao.ts`, `eas.json`) existem para o app
DISTRIBUÍDO, que abre sem Metro e por isso exige uma API HTTPS pública — a de Production.
**Não há APK Development distribuído**: Development não tem API pública, e os scripts recusam
publicar com localhost, IP interno ou túnel temporário.

**Production no Android é um APK** (perfil `production` do `eas.json`, `buildType: "apk"`),
distribuído **diretamente pelo site** `jaaa.com.br` — sem Play Store por enquanto. Quem instalou
recebe as mudanças compatíveis por update OTA; mudança nativa exige um APK novo (abaixo). O APK novo
só instala por cima do anterior se for assinado com a MESMA chave: a keystore do EAS não pode ser
trocada nem perdida.

```bash
npm run mobile:versao                              # versão, pacotes, canais, projeto EAS
npm run mobile:build:production                    # APK de produção (pede "PRODUCTION")
npm run mobile:update:production -- "o que mudou"  # update OTA de produção (pede "PRODUCTION")
```

**Variáveis públicas do app distribuído** ficam no ambiente do EAS (nunca no código nem na máquina
local) e são embutidas no JavaScript em cada build e em cada update. Em `production` as três são
obrigatórias — o script recusa build e update sem elas:

| Variável | Para quê |
| --- | --- |
| `EXPO_PUBLIC_JAA_API_URL` | API (`https://api.jaaa.com.br`); HTTPS pública e estável, sem fallback para localhost |
| `EXPO_PUBLIC_JAA_SITE_URL` | site (`https://jaaa.com.br`), de onde sai o Link do Jaaa |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | token PÚBLICO (`pk.`) dos mapas da rota e do pedido; nunca um token secreto |

Todas com visibilidade `plaintext` (o script lê o valor para validar). O `.env.local` do app vale só
para o desenvolvimento local e não vai para o EAS. Nenhum segredo vai para o EAS: banco, R2 e Better
Auth ficam só na API.

**Guarda Development × Production** (`src/lib/guarda-variante.ts`, primeiro import do layout raiz):
na abertura, o pacote realmente instalado é comparado com a variante do JavaScript em execução —
`com.jaa.app` só aceita `production` e `com.jaa.app.dev` só aceita `development`. Se não baterem o app
para antes de operar; num update OTA publicado no canal errado, esse erro faz o expo-updates descartar
o update e voltar ao JavaScript anterior.

**Update OTA serve para**: JS/TS, telas, componentes, estilos, textos, regras e imagens/fontes
importadas pelo código. A publicação é sempre explícita (nada sai a cada salvamento). O app verifica ao
abrir, baixa em segundo plano e aplica na abertura SEGUINTE. No Jaa Dev (Development Client) não há update OTA: o JavaScript vem do Metro.

**Novo build é obrigatório para**: biblioteca nativa nova ou removida, permissão nova, plugin ou
qualquer mudança no `app.config.ts` que altere o binário (ícone, splash, scheme, pacote), atualização
do SDK do Expo. Nesses casos: subir `version` (isso muda o runtime e impede o update de chegar a
binários antigos), gerar o build e distribuir o APK novo. **Nunca publicar update depois de uma mudança
nativa sem subir a `version`**: o JavaScript novo chegaria a um binário sem o código nativo.

**Vínculo com o EAS**: projeto `jaa-app/jaa`; o id fica em `PROJETO_EAS` (`app.config.ts`), de onde saem
`extra.eas.projectId` e `updates.url`.

## Rastreamento da entrega (localização em background)

O aplicativo compartilha a localização do entregador **somente enquanto existe uma saída EM ANDAMENTO
atribuída a ele**. Terminou a saída (concluída, cancelada ou perdida), o rastreamento para — e o
servidor recusa qualquer posição fora da operação. Fora de uma entrega o Jaa não coleta localização.

Localização em background **não funciona no Expo Go**; exige development build
(`npx expo prebuild` + `npx expo run:android`). As permissões já estão no `app.config.ts`. A interface
mostra a situação real (`permissao_negada`, `somente_primeiro_plano`, `gps_desligado`, `ativo`) em vez
de prometer acompanhamento contínuo. A política de envio é compartilhada em `@jaa/contratos`
(`POLITICA_RASTREAMENTO`, `decidirEnvioDePosicao`).

Pendência conhecida: o estado local do rastreamento fica em memória (ver `CLAUDE.md`, seção 7,
"Rastreamento durante a saída").

## Foto do perfil (câmera e galeria)

Na aba Perfil, tocar no avatar abre: **Tirar foto**, **Escolher da galeria** e, havendo foto,
**Remover**. O envio usa a MESMA rota da Web (`POST|DELETE /perfil/foto`, multipart com o campo
`arquivo`), com a sessão do aparelho e a identidade atuante; nenhuma credencial de armazenamento existe
no app. Antes do envio a imagem é recortada em quadrado e reduzida a JPEG de até 1024 px
(`expo-image-manipulator`): isso garante formato aceito pela API (HEIC/HEIF viram JPEG) e pouco
tráfego. A permissão de câmera é pedida só ao tocar em "Tirar foto"; a galeria usa o seletor de fotos
do sistema, sem permissão de armazenamento.

`expo-image-picker` e `expo-image-manipulator` são módulos nativos: depois de instalá-los é preciso
GERAR UM NOVO development build (`npx expo run:android`), senão o app falha ao abrir o seletor.
