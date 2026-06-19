# MotoFix 2.0

Sistema web para gestao de oficinas de motocicletas. O app centraliza clientes, servicos, recorrencias de manutencao, agenda, garantias, gastos, lembretes por WhatsApp, dashboard financeiro e administracao de usuarios.

## Documentacao

- `DOCUMENTACAO.md`: memoria tecnica viva, plano de refatoracao e pendencias atuais.
- `ANALISE_TECNICA_COMPLETA_APP.md`: analise tecnica ampla usada como referencia historica.
- `README.md`: guia rapido para rodar e entender o projeto.

## Stack

- Frontend: React 19, TypeScript, Vite e Tailwind CSS 4.
- Backend: Node.js com Express.
- Auth e banco: Firebase Authentication e Firestore.
- Pagamentos: Stripe no backend.
- Graficos: Recharts.
- PDF: jsPDF e html2canvas.
- UI: Lucide React e Sonner.

## Funcionalidades

- Login com Google via Firebase Auth.
- Cadastro e acompanhamento de clientes.
- Registro de servicos e historico de manutencoes.
- Calculo automatico de proxima manutencao por recorrencia.
- Status de manutencao: `OK`, `WARNING` e `OVERDUE`.
- Agenda de atendimentos.
- Controle de garantias com geracao de PDF.
- Controle de gastos em `users/{uid}/expenses`.
- Dashboard financeiro com receita, contas a receber, despesas e lucro liquido.
- Lembretes via link do WhatsApp com log em `message_logs`.
- Painel admin para ativar/bloquear usuarios e ajustar vencimento de assinatura.

## Configuracao local

Crie um arquivo `.env` baseado em `.env.example`.

Variaveis principais:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=

FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
NODE_ENV=development
PORT=3001
VITE_STRIPE_API_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
JSON_BODY_LIMIT=512kb
FISCAL_BODY_LIMIT=6mb
WEBHOOK_BODY_LIMIT=2mb
FOCUS_NFE_TIMEOUT_MS=20000
```

## Comandos

```bash
npm install
npm run dev
npm run lint
npm run build
npm run start
```

## Estrutura de dados

Os dados operacionais ficam em subcolecoes por usuario:

```text
users/{uid}
users/{uid}/clients
users/{uid}/maintenances
users/{uid}/warranties
users/{uid}/appointments
users/{uid}/expenses
users/{uid}/products
users/{uid}/cash_launches
users/{uid}/message_logs
users/{uid}/settings/config
```

Admins podem listar e gerenciar usuarios quando autenticados por custom claim `admin`.

## Firestore Rules

As regras atuais foram endurecidas para:

- negar qualquer acesso anonimo;
- permitir que usuarios ativos acessem apenas as proprias subcolecoes;
- permitir que usuarios leiam o proprio perfil;
- permitir auto-bloqueio do proprio usuario quando a assinatura expira;
- permitir acesso admin via custom claim `admin`;
- validar schema/tipos basicos das colecoes principais do usuario antes de writes do frontend;
- bloquear escrita direta do frontend em campos fiscais sensiveis e colecoes privadas de XML/PDF/certificados;
- negar qualquer outro documento fora de `users/{uid}`.

Antes de producao, aplique as regras no Firebase e renove o token dos admins apos configurar a custom claim. As regras devem ser publicadas junto com Hosting quando houver mudanca de schema ou permissao.

## Stripe

O backend possui endpoints para criar/verificar pagamentos e receber webhooks:

```text
GET  /api/health
GET  /api/payments/publishable-key
POST /api/payments/create-checkout
GET  /api/payments/session/:sessionId
POST /api/payments/webhook
```

A tela de checkout do frontend ainda precisa ser integrada ao Stripe Elements para pagamento completo dentro da UI. Enquanto isso, o fluxo real de ativacao deve ser administrado pelo painel admin ou pelo webhook quando acionado por um pagamento valido.

## Segredos

Nunca versione arquivos sensiveis:

- `.env`
- `.env.*`
- `firebase-service-account.json`
- qualquer arquivo `*.credentials.json`

O arquivo `firebase-service-account.json` deve ficar fora do Git e, em producao, idealmente deve ser substituido por secrets do ambiente de deploy.

## Backend Express

O servidor aplica headers basicos de seguranca, CORS por allowlist, limite de payload, rate limit simples em `/api` e timeout nas chamadas Focus NFe.

Em producao, configure `APP_URL`, `FRONTEND_URL` ou `CORS_ORIGINS` com os dominios reais do frontend quando ele estiver em origem diferente do backend.

## Build e deploy

O build gera dois artefatos separados:

- `dist/`: frontend que pode ser publicado no Firebase Hosting.
- `dist-server/`: bundle do servidor Express, fora da pasta publica do Hosting.

```bash
npm run build
```

No Windows, esse comando aplica uma configuracao de memoria para reduzir falhas ocasionais do esbuild durante o build.

O Firebase Hosting esta configurado para servir apenas `dist` com rewrite para `index.html`.

Deploy recomendado:

```bash
npm run deploy:prod
```

Esse comando roda o build e publica Hosting junto com Firestore Rules. Para publicar separadamente:

```bash
npm run deploy:hosting
npm run deploy:rules
```

Evite rodar somente `firebase deploy --only hosting` em producao se as regras Firestore tambem tiverem mudado.

## Operacao offline

A aplicacao agora possui cache persistente do Firestore, fila de escritas offline e service worker para abrir o app sem conexao depois do primeiro carregamento online. A documentacao completa esta em [`OFFLINE_SYNC.md`](./OFFLINE_SYNC.md).
