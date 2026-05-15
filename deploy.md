# Deploy do MotoFix-CORP

Este arquivo descreve os comandos necessários para preparar e fazer deploy do projeto.

## 1. Entrar na pasta do projeto

```bash
cd "c:\M O T O F I X A P P\MotoFix-CORP"
```

## 2. Instalar dependências

```bash
npm install
```

## 3. Gerar build de produção

```bash
npm run build
```

Este comando executa:
- `vite build` para gerar a aplicação frontend em `dist`
- `npm run build:server` para gerar `dist/server.js`

O build já foi validado com sucesso no ambiente local.

## 4. Preparar o Firebase

Se ainda não estiver logado no Firebase CLI:

```bash
firebase login
```

Confirmar o projeto ativo:

```bash
firebase use
```

O projeto padrão está configurado em `.firebaserc` como `motofix-ypoc`.

## 5. Fazer deploy no Firebase Hosting

```bash
firebase deploy --only hosting
```

> Observação: o `firebase.json` atual está configurado para servir o conteúdo de `dist` como Hosting estático.

## 5.1. Se o arquivo de credenciais ainda estiver no índice do Git

Se `firebase-service-account.json` já foi commitado, execute:

```bash
git rm --cached firebase-service-account.json
git commit -m "Remove Firebase service account from repository index"
```

Isso mantém o arquivo localmente, mas o remove do histórico futuro.

## 6. Validar backend e segredos antes de implantar

- Não commit `firebase-service-account.json`.
- Use apenas variáveis de ambiente em produção:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `FIREBASE_SERVICE_ACCOUNT_PATH`
- Para desenvolvimento local, use um `.env` válido, mas nunca envie esse arquivo para o repositório.

## 7. Deploy do backend

O app contém `server.ts`, mas o `firebase.json` atual não implanta o backend Node.js.

Opções possíveis:

1. Criar uma API separada em um host de backend (Vercel, Railway, Cloud Run, Heroku, etc.)
   - defina as variáveis de ambiente necessárias nesse host
   - mantenha o frontend hospedado no Firebase Hosting
   - use o backend para `POST /api/payments/create-checkout`, `GET /api/payments/session/:sessionId`, `GET /api/payments/publishable-key` e `/api/payments/webhook`

2. Migrar para Firebase Functions
   - ajustar `firebase.json` para incluir `functions`
   - mover a lógica de backend para uma função HTTP
   - usar o mesmo projeto Firebase para frontend e backend

3. Se quiser continuar com deploy só de frontend no Firebase Hosting,
   mantenha o backend em outro serviço e configure as URLs de API no frontend.

## 8. Validar dependências e licenças

Antes de lançar, rode:

```bash
npm audit
npm audit fix
```

Depois, valide versões e licenças:

```bash
npm ls --depth=0
npm install -g license-checker
license-checker --production --summary
```

Se algum pacote crítico apresentar vulnerabilidade ou licença incompatível,
avalie atualizar ou substituir esse pacote antes de colocar em produção.

## 9. Caso queira verificar localmente antes do deploy

```bash
npm run preview
```

ou

```bash
npm run dev
```

## Nota importante

O repositório inclui `server.ts`, mas a configuração `firebase.json` atual não está definida para deploy de funções ou backend Node.js. Se precisar implantar também o servidor, será necessário ajustar a configuração do Firebase para usar `functions` ou outro serviço de backend.
