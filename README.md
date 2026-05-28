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
users/{uid}/message_logs
users/{uid}/settings/config
```

Admins podem listar e gerenciar usuarios quando autenticados por custom claim `admin` ou pelos e-mails admin configurados nas regras atuais.

## Firestore Rules

As regras atuais foram endurecidas para:

- negar qualquer acesso anonimo;
- permitir que usuarios ativos acessem apenas as proprias subcolecoes;
- permitir que usuarios leiam o proprio perfil;
- permitir auto-bloqueio do proprio usuario quando a assinatura expira;
- permitir acesso admin via custom claim `admin` ou e-mail admin verificado;
- negar qualquer outro documento fora de `users/{uid}`.

Antes de producao, prefira migrar definitivamente para custom claims e remover validacao de admin por e-mail.

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

## Build e deploy

O build gera frontend e servidor em `dist`:

```bash
npm run build
```

No Windows, esse comando aplica uma configuracao de memoria para reduzir falhas ocasionais do esbuild durante o build.

O Firebase Hosting esta configurado para servir `dist` com rewrite para `index.html`.
