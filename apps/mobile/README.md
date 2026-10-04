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

## Rodar (emulador Android + API local)

```bash
# 1. API na porta 3333 (raiz do monorepo)
npm run dev -w @jaa/api

# 2. Metro (em apps/mobile). No emulador Android, 10.0.2.2 é o computador que hospeda o emulador.
EXPO_PUBLIC_JAA_API_URL=http://10.0.2.2:3333 npx expo start --clear
```

A tela de entrada mostra, em desenvolvimento, a linha "Servidor: …" com o endereço da API em uso.

## Verificações

```bash
npm run typecheck -w mobile
npm test -w mobile          # lógica pura (node:test)
```

## Rastreamento da entrega (localização em background)

O aplicativo compartilha a localização do entregador **somente enquanto existe uma saída EM ANDAMENTO
atribuída a ele**. Terminou a saída (concluída, cancelada ou perdida), o rastreamento para — e o
servidor recusa qualquer posição fora da operação. Fora de uma entrega o Jaa não coleta localização.

Localização em background **não funciona no Expo Go**; exige development build
(`npx expo prebuild` + `npx expo run:android`). As permissões já estão no `app.json`. A interface
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
