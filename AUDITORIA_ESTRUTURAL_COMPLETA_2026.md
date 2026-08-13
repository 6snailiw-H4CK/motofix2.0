# 🔍 AUDITORIA ESTRUTURAL COMPLETA - MotoFix 2.0

**Data da Auditoria:** 2026-08-12  
**Versão do Projeto:** 2.1.0  
**Status Geral:** ⚠️ EM DESENVOLVIMENTO ATIVO (com issues críticas)

---

## 📋 SUMÁRIO EXECUTIVO

O MotoFix 2.0 é um **CRM de recorrência + ERP operacional** para oficinas de motocicletas, construído em **React 19 + TypeScript + Vite** no frontend e **Node.js/Express** no backend, usando **Firebase/Firestore** como banco de dados.

### 🟢 Pontos Fortes
- ✅ Cache persistente offline (IndexedDB)
- ✅ Fila de sincronização com retry automático
- ✅ Soft delete obrigatório em Firestore
- ✅ Testes de segurança passando (11/11 offline, 100+ Firestore rules)
- ✅ Build e CI/CD funcionando
- ✅ Documentação técnica viva bem mantida

### 🔴 Pontos Críticos
- ❌ **5 erros de TypeScript** no lint (`npm run lint` FAILING)
- ❌ **2 vulnerabilidades críticas de segurança** em Firestore (delete físico)
- ❌ **Transações não-atômicas** em fluxos críticos (cliente + manutenção)
- ❌ **Fila offline frágil** (localStorage pode ser limpo)
- ⚠️ **Módulo fiscal beta** (não em produção)

---

## 1️⃣ STACK REAL

### Frontend
| Tecnologia | Versão | Propósito |
|------------|--------|----------|
| **React** | 19.0.0 | Framework UI |
| **TypeScript** | ~5.8.2 | Tipagem estática |
| **Vite** | 6.2.0 | Build + dev server |
| **Tailwind CSS** | 4.1.14 | Estilização |
| **Recharts** | 3.8.0 | Gráficos |
| **Lucide React** | 0.546.0 | Ícones |
| **date-fns** | 4.1.0 | Manipulação de datas |
| **jsPDF + html2canvas** | 4.2.1 + 1.4.1 | Geração de PDFs |
| **Sonner** | 2.0.7 | Toast notifications |

### Backend
| Tecnologia | Versão | Propósito |
|------------|--------|----------|
| **Node.js** | LTS (npm 12+) | Runtime |
| **Express** | 4.22.2 | Web framework |
| **Firebase Admin SDK** | 14.0.0 | Acesso privilegiado ao Firestore |
| **Stripe** | 22.0.0 | Pagamentos |
| **@open-wa/wa-automate** | 4.76.0 | Automação WhatsApp |

### Banco de Dados & Auth
| Serviço | Versão | Propósito |
|--------|--------|----------|
| **Firebase Authentication** | - | OAuth (Google) + token JWT |
| **Firestore** | v9+ (realtime) | Banco NoSQL com sincronização |
| **Firestore IndexedDB** | - | Cache persistente offline |

### DevOps & Deploy
| Ferramenta | Versão | Propósito |
|------------|--------|----------|
| **Firebase Hosting** | - | Deploy frontend |
| **Firebase CLI** | - | Deploy regras + functions |
| **Docker** | - | Containerização (Dockerfile.fiscal) |
| **GitHub** | - | Versionamento (git log mostra 25 commits) |

---

## 2️⃣ ARQUITETURA

### 2.1 Fluxo Geral da Aplicação

```
main.tsx
  ↓
App.tsx (orquestrador central)
  ├─ useAuthProfile() → Firebase Auth + perfil do usuário
  ├─ useUserCollections() → Firestore listeners para dados do usuário
  ├─ useOfflineDataPreload() → Pré-carga 24h + retry
  ├─ useOfflineSyncStatus() → Monitor conexão + fila
  └─ useSubscriptionExpiryGuard() → Bloqueio de usuários expirados
      ↓
  AppHeader/TopBar (tema, notificações)
  ↓
  BottomNav (menu mobile-first)
  ↓
  View dinamicamente renderizada (dashboard, clients, etc)
```

### 2.2 Estrutura de Pastas

```
src/
├── App.tsx                           # Orquestrador central (5k+ linhas)
├── firebase.ts                       # Inicialização Firebase + cache
├── types.ts                          # Tipos centrais
├── index.css                         # Tailwind + custom CSS
├── main.tsx                          # Entry point
│
├── components/ (22 módulos)
│   ├── admin/AdminView.tsx
│   ├── appointments/AppointmentsView.tsx
│   ├── auth/AuthScreen.tsx
│   ├── cash/CashRegisterView.tsx
│   ├── checkout/CheckoutScreen.tsx  # Stripe
│   ├── clients/ClientsView.tsx
│   ├── dashboard/DashboardView.tsx   # Principal
│   ├── expenses/ExpensesView.tsx
│   ├── financial-health/            # Novo: Saúde financeira
│   ├── fiscal/FiscalView.tsx         # Beta: NFSe
│   ├── Forms/ClientForm.tsx
│   ├── history/HistoryView.tsx
│   ├── layout/
│   │   ├── AppHeader.tsx
│   │   ├── BottomNav.tsx
│   │   ├── AppViewRenderer.tsx       # Renderizador de views
│   │   ├── LoadingScreen.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── OfflineSyncPill.tsx       # Status offline
│   │   └── AppShell.tsx
│   ├── pendencies/PendenciesView.tsx
│   ├── products/ProductsView.tsx
│   ├── reports/GeneralReportView.tsx
│   ├── returns/ReturnsView.tsx
│   ├── settings/SettingsView.tsx
│   ├── warranties/WarrantiesView.tsx
│   └── whatsapp/WhatsAppView.tsx
│
├── hooks/ (28 hooks customizados)
│   ├── useAuthProfile.ts             # Auth + perfil do usuário
│   ├── useUserCollections.ts         # Listeners do Firestore
│   ├── useClientActions.ts           # CRUD de clientes
│   ├── useMaintenanceActions.ts      # Manutenções + pagamentos
│   ├── useCashRegisterActions.ts     # Ordens de serviço
│   ├── useExpenseActions.ts          # Despesas
│   ├── useWarrantyActions.ts         # Garantias + PDF
│   ├── useAppointmentActions.ts      # Agenda
│   ├── useAdminActions.ts            # Admin: bloquear/ativar usuários
│   ├── useSubscriptionExpiryGuard.ts # Bloqueio por assinatura vencida
│   ├── useOfflineDataPreload.ts      # Pré-carga 24h
│   ├── useOfflineSyncStatus.ts       # Status sincronização
│   ├── useWhatsAppReminderActions.ts # Lembretes WhatsApp
│   ├── useFinancialHealth.ts         # Métricas financeiras
│   ├── useFiscalActions.ts           # Emissão NFSe
│   ├── useServiceTypeActions.ts      # Categorias de serviço
│   ├── useClientFormState.ts         # Estado do formulário
│   ├── useClientStatusSync.ts        # Sincronização status de cliente
│   ├── useNotificationActions.ts     # Notificações
│   └── ... (+9 hooks)
│
├── services/ (32 repositórios + serviços)
│   ├── clientRepository.ts           # Firestore clients CRUD
│   ├── maintenanceRepository.ts      # Manutencoes CRUD
│   ├── cashRegisterRepository.ts     # O.S. com transação estoque
│   ├── expenseRepository.ts          # Despesas
│   ├── warrantyRepository.ts         # Garantias
│   ├── appointmentRepository.ts      # Agenda
│   ├── productRepository.ts          # Mercadorias
│   ├── messageLogRepository.ts       # Logs WhatsApp
│   ├── settingsRepository.ts         # Configurações
│   ├── userRepository.ts             # Usuários + admin
│   ├── firestoreOfflineQueue.ts      # Fila de replay offline
│   ├── firestoreWriteReplay.ts       # Executor de retry
│   ├── offlineDataPreload.ts         # Pré-carga 24h
│   ├── softDelete.ts                 # Helpers soft delete
│   ├── emergencyBackup.ts            # CSV + JSON backup
│   ├── firestoreError.ts             # Padronização de erros
│   ├── stripeService.ts              # Integração Stripe
│   ├── fiscalApi.ts                  # Emissão NFSe
│   ├── serviceWorkerRegistration.ts  # Service worker offline
│   └── ... (+14 serviços)
│
├── modules/
│   └── whatsapp/ (stub vazio, lógica em server/)
│
├── utils/ & lib/
│   ├── Helpers para formatação, cálculo, validação
│
├── constants/
│   └── appDefaults.ts                # Versão, constantes
│
└── config/
    └── Configurações de tema, idioma

server/
├── server.ts                         # Express app + rotas
├── firebaseAdmin.ts                  # Inicialização Firebase Admin
├── httpSecurity.ts                   # CORS + rate limit
│
├── fiscal/
│   ├── fiscalRoutes.ts               # POST /api/fiscal/...
│   ├── types.ts                      # Tipos NFSe
│   └── focusNfeIntegration.ts        # API Focus NFe
│
├── whatsapp/
│   ├── whatsappRoutes.ts             # GET/POST /api/whatsapp/...
│   ├── WhatsAppSessionService.ts     # Sessão @open-wa
│   ├── whatsappRemindersService.ts   # Envio de lembretes
│   └── types.ts
│
├── dataResetRoutes.ts                # POST /api/data-reset/...
├── backupRoutes.ts                   # GET /api/backup/...
└── automaticBackup.ts                # Backup automático

scripts/
├── offline-resilience-test.ts        # 11 testes offline
├── firestore-rules-validation.mjs    # Análise estática rules
├── firestore-rules-scenarios.mjs     # Testes emulador
├── fiscal-smoke-test.mjs             # Teste fiscal
├── validate-firestore-rules.mjs      # Validação estática
├── set-admin-claim.mjs               # Utilitário admin
└── build.mjs                         # Build script customizado

public/
├── index.html                        # HTML base
├── manifest.json                     # PWA manifest
├── sw.js                             # Service worker offline
├── motofix-logo.svg
└── offline-assets.json               # Assets para offline

vite.config.ts                        # Config build + plugins offline
tsconfig.json                         # TypeScript config (ES2022)
firebase.json                         # Config Firebase Hosting
firestore.rules                       # Regras de segurança
firestore.indexes.json                # Índices Firestore
.firebaserc                           # Projeto Firebase
```

### 2.3 Fluxo de Dados

```
Usuário → Component → Hook (useClientActions, etc)
                        ↓
                    Repository (clientRepository.ts)
                        ↓
                    queueFirestoreVoidWrite()
                        ↓
          ┌─────────────┴─────────────┐
          ↓                           ↓
      Online          Offline (1.2s timeout)
      Sucesso           ↓
      (Imediato)    localStorage + IndexedDB (retry)
                        ↓
              Espera reconectar
                        ↓
              firestoreWriteReplay.ts
                        ↓
                    Firestore ✓
```

---

## 3️⃣ BANCO DE DADOS

### 3.1 Estrutura Firestore

**Escopo:** Por usuário (multi-tenant com isolamento via `uid`)

```
users/{uid}
├── profile: UserProfile
│   ├── uid: string
│   ├── email: string
│   ├── displayName: string
│   ├── role: "user" | "admin"
│   ├── isActive: boolean
│   ├── subscription: "free" | "premium"
│   ├── subscriptionExpiresAt: Timestamp
│   ├── createdAt: Timestamp
│   ├── updatedAt: Timestamp
│
├── settings/
│   └── config/
│       ├── companyName: string
│       ├── companyDocument: string
│       ├── theme: "light" | "dark"
│       ├── serviceTypes: string[]
│       ├── oilTypes: {name, price}[]
│       ├── fiscalEnabled: boolean
│       └── ... (+10 campos)
│
├── clients/ (subcollection)
│   └── {clientId}
│       ├── name, bikeModel, oilType, oilPrice
│       ├── contact, email, vehiclePlate, mileageKm
│       ├── lastMaintenanceDate, nextMaintenanceDate, recurrenceDays
│       ├── status: "OK" | "WARNING" | "OVERDUE"
│       ├── isRecurringRevenue: boolean
│       ├── statusPagamento: "Pago" | "Pendente" | "Parcial"
│       ├── saldoDevedor?: number
│       ├── automation.lastAlertDate, lastSendAt, lastSendStatus
│       ├── userId: string
│       ├── createdAt: Timestamp
│       ├── deletedAt?: Timestamp (soft delete)
│
├── maintenances/ (subcollection)
│   └── {maintenanceId}
│       ├── clientId, clientName, bikeModel, serviceType
│       ├── date: Timestamp
│       ├── serviceValue, oilType, oilPrice
│       ├── isRecurringRevenue: boolean
│       ├── statusPagamento, valorPago, saldoDevedor
│       ├── notes, userId
│       ├── createdAt: Timestamp
│       ├── deletedAt?: Timestamp
│
├── warranties/ (subcollection)
│   └── {warrantyId}
│       ├── clientId, clientName, bikeModel
│       ├── warrantyNumber (único)
│       ├── serviceType, expiryDate
│       ├── value, notes
│       ├── createdAt: Timestamp
│
├── appointments/ (subcollection)
│   └── {appointmentId}
│       ├── clientId, clientName, date (Timestamp)
│       ├── time, notes, confirmed: boolean
│       ├── createdAt: Timestamp
│
├── expenses/ (subcollection)
│   └── {expenseId}
│       ├── description, supplier, amount
│       ├── paymentMethod, date, note
│       ├── userId, createdAt
│
├── products/ (subcollection)
│   └── {productId}
│       ├── sourceCode, description, variation
│       ├── ncm, salePrice, stockQuantity
│       ├── trackStock: boolean
│       ├── userId, createdAt
│
├── cash_launches/ (subcollection - O.S./Ordens de Serviço)
│   └── {launchId}
│       ├── items: {productId, description, quantity, unitPrice, total}[]
│       ├── discountValue, discountPercent
│       ├── date: Timestamp
│       ├── paymentMethod
│       ├── issuedAt?: Timestamp (NFSe)
│       ├── userId, createdAt
│
├── message_logs/ (subcollection)
│   └── {logId}
│       ├── clientId, clientName, phone
│       ├── channel: "whatsapp" | "email" | "manual"
│       ├── status: "pending" | "sent" | "failed"
│       ├── trigger: "manual" | "scheduled"
│       ├── message, createdAt, sentAt, error
│
├── operational_logs/ (subcollection)
│   └── {logId}
│       ├── timestamp, usuario, acao (cliente_criado, etc)
│       ├── resultado: "sucesso" | "salvo_offline" | "erro"
│       ├── targetId, details
│
├── fiscal_companies/ (subcollection - admin)
│   └── {companyId}
│       ├── cnpj, razaoSocial, regime
│       ├── certificateFile, password
│       ├── apiKey (Focus NFe)
│
├── fiscal_invoices/ (subcollection)
│   └── {invoiceId}
│       ├── rps, status, number
│       ├── issuedAt, value
│       ├── clientData, items
│
└── whatsapp_sessions/ (subcollection)
    └── {sessionId}
        ├── phone, status, connectedAt
```

### 3.2 Colecções Globais (Non-user scoped)

**Observação:** Atualmente mínimas. A maioria está isolada por `uid`.

---

## 4️⃣ AUTENTICAÇÃO

### 4.1 Fluxo de Login

1. **Frontend:** Usuário clica "Entrar com Google"
2. **Firebase Auth:** Popup OAuth Google
3. **Token JWT:** Firebase retorna token com `uid` e claims customizadas
4. **Custom Claims:** Admin claim definida via Admin SDK (`setCustomUserClaims()`)
5. **Perfil do Usuário:** Criado automaticamente em `users/{uid}`
6. **Persistência Local:** Token + uid salvos em `localStorage` para fallback offline

### 4.2 Autorização (Role-Based)

| Role | Permissões |
|------|-----------|
| **user** | Acesso a próprios dados + colecções pessoais |
| **admin** | Acesso a todos os dados + painel admin |

**Como é definido:**
- Custom claim `admin` no Firebase Authentication (via `setCustomUserClaims`)
- Fallback para campo `role` no documento `users/{uid}` (para offline)
- Verificação em Firestore rules via `hasAdminClaim()` ou `isAdmin()`

### 4.3 Sessão Offline

- Token armazenado em `localStorage` por tempo indeterminado
- Atualização automática quando houver conexão
- Se renovação falhar, continua usando token em cache
- **Risco:** Token expirado pode funcionar offline, causando confusão na UI

---

## 5️⃣ SEGURANÇA

### 5.1 Firestore Rules (firestore.rules)

**Status:** ✅ **Endurecidas em Julho/2026**

#### ✅ Implementado

| Controle | Descrição | Status |
|----------|-----------|--------|
| Acesso anônimo negado | `signedIn()` obrigatório | ✅ |
| Isolamento por usuário | `isOwner(uid)` em colecções | ✅ |
| Soft delete obrigatório | `allow delete if false` | ✅ **NOVO** |
| Validação schema | Campos permitidos validados | ✅ |
| Admin via claim ou doc | `isAdmin()` com fallback | ✅ |
| Bloqueio de usuários inativos | `isActiveOwner()` | ✅ |

#### 🔴 Ainda Pendente

| Issue | Severidade | Status |
|-------|-----------|--------|
| Delete físico bloqueado | ✅ RESOLVIDO | ✅ |
| Reset operacional apaga dados | ✅ RESOLVIDO | ✅ |
| Transações não-atômicas | 🟡 MÉDIA | ⏳ Pendente |
| Backup incompleto | 🟡 MÉDIA | ⏳ Pendente |

### 5.2 Segurança HTTP (Backend)

**Arquivo:** `server/httpSecurity.ts`

- ✅ CORS restringido
- ✅ Rate limiting
- ✅ Headers segurança (HSTS, CSP)
- ✅ JSON size limits (512KB normal, 6MB fiscal)
- ⚠️ Webhook Stripe (2MB)

### 5.3 Segurança de Dados

| Aspecto | Status |
|--------|--------|
| Criptografia em transit (HTTPS) | ✅ Firebase Hosting |
| Criptografia em repouso | ✅ Firestore nativo |
| Soft delete (não apagar fisicamente) | ✅ Implementado |
| Backup automático | ⏳ Parcial (JSON frontend) |
| Export completo | ⏳ Não implementado |
| Restore testado | ❌ Não testado |

### 5.4 Erros de TypeScript (CRÍTICO)

**Status:** ❌ `npm run lint` FAILING com 5 erros

```
server/whatsapp/WhatsAppSessionService.ts (4 erros)
├─ Linha 5: Cannot find module '@open-wa/wa-automate'
├─ Linha 6: Cannot find module '@open-wa/wa-automate/dist/api/model/aliases'
├─ Linha 18: Cannot find module '@open-wa/wa-automate' (type)
└─ Linha 328: Cannot find module '@open-wa/wa-automate' (dynamic import)

src/components/layout/AppViewRenderer.tsx (1 erro)
└─ Linha 702: Property 'onExportFullBackup' does not exist on type 'SettingsViewProps'
```

**Impacto:** Projeto não passa na validação de build CI/CD

---

## 6️⃣ MÓDULOS

### 6.1 Dashboard
- ✅ Clientes para contatar hoje
- ✅ Pendências + garantias vencendo
- ✅ Gastos vs receita do mês
- ✅ Gráficos com Recharts
- ⏳ Status não atualiza em tempo real (atualiza por cron notturna)

### 6.2 Clientes
- ✅ CRUD completo
- ✅ Cálculo automático próxima manutenção
- ✅ Soft delete
- ⚠️ Sem sincronização de status real-time

### 6.3 Lançamentos em Caixa / O.S.
- ✅ Criar ordem de serviço rápida
- ✅ Transação atômica com estoque
- ✅ Auto-emissão NFSe (se habilitado)
- ⏳ Cancelamento de O.S.

### 6.4 Saúde Financeira ⭐ (NOVO)
- ✅ Métricas customizáveis
- ✅ Gráfico trends 12 meses
- ✅ Ranking serviços/produtos por lucro
- ✅ Meta por moto = (Lucro Desejado) / (Motos/mês)

### 6.5 Fiscal - NFSe (BETA RESERVADO)
- ✅ Emissão NFSe implementada
- ❌ Backend em localhost (não em produção)
- ❌ NF-e e NFC-e apenas preparadas
- ⚠️ Visível apenas se `VITE_FISCAL_MODULE_ENABLED=true`

### 6.6 WhatsApp - Lembretes
- ✅ Envio manual + registro automático
- ✅ Sessão @open-wa headless
- ⚠️ Pode desconectar por timeout
- ⏳ Configuração de grupos

### 6.7 Offline & Sincronização
- ✅ Cache persistente IndexedDB
- ✅ Pré-carga 24h
- ✅ Fila local com retry
- ⚠️ localStorage frágil (pode ser limpo)
- ⏳ Bloquear logout com pendências

### 6.8 Admin
- ✅ Ativar/bloquear usuários
- ✅ Ajustar vencimento assinatura
- ✅ Listar todos os usuários
- ⏳ Audit log

### 6.9 Relatórios
- ✅ Geral (receita, despesas, lucro)
- ✅ Financeiro (12 meses)
- ⏳ Tributos

---

## 7️⃣ DEPENDÊNCIAS

### 7.1 Dependências Principais (npm)

```json
{
  "dependencies": {
    "@open-wa/wa-automate": "^4.76.0",      // WhatsApp (PROBLEMA: tipos faltando)
    "@stripe/react-stripe-js": "^6.1.0",    // Pagamentos (parcial)
    "@stripe/stripe-js": "^9.0.1",
    "@tailwindcss/vite": "^4.1.14",         // Tailwind
    "@vitejs/plugin-react": "^5.0.4",       // React plugin Vite
    "axios": "^1.14.0",                     // HTTP client
    "clsx": "^2.1.1",                       // Util clsx
    "date-fns": "^4.1.0",                   // Datas
    "dotenv": "^17.2.3",                    // .env
    "express": "^4.22.2",                   // Backend
    "firebase": "^12.13.0",                 // SDK frontend
    "firebase-admin": "^14.0.0",            // SDK backend (requer imports modulares)
    "html2canvas": "^1.4.1",                // HTML → Canvas
    "jspdf": "^4.2.1",                      // PDF generation
    "lucide-react": "^0.546.0",             // Ícones
    "motion": "^12.23.24",                  // Animações
    "qrcode": "^1.5.4",                     // QR codes
    "react": "^19.0.0",                     // React 19
    "react-dom": "^19.0.0",                 // React DOM
    "recharts": "^3.8.0",                   // Gráficos
    "sonner": "^2.0.7",                     // Toast
    "stripe": "^22.0.0",                    // Stripe backend
    "tailwind-merge": "^3.5.0"              // Merge Tailwind classes
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^5.0.1",
    "@types/*": "latest",
    "autoprefixer": "^10.4.21",
    "esbuild": "^0.27.4",                   // Bundle server
    "patch-package": "^6.5.1",              // Patches
    "typescript": "~5.8.2",                 // TypeScript
    "vite": "^6.2.0"                        // Build tool
  }
}
```

### 7.2 Problemas de Dependências

| Lib | Versão | Problema | Solução |
|-----|--------|---------|---------|
| `@open-wa/wa-automate` | 4.76.0 | Tipos TypeScript faltando | Adicionar `@types` ou corrigir imports |
| `stripe` | 22.0.0 | Checkout não integrado | Implementar webhook |
| `firebase-admin` | 14.0.0 | Imports antigos (admin.credential.cert) | Usar imports modulares |

---

## 8️⃣ APIs

### 8.1 Backend Express (server.ts)

**Host:** `http://localhost:3001` (dev)  
**Port:** `3001` ou `PORT` env var

#### Rotas Implementadas

| Método | Endpoint | Handler | Status |
|--------|----------|---------|--------|
| `POST` | `/api/fiscal/issue` | Emissão NFSe | ⚠️ Beta |
| `GET` | `/api/fiscal/status/{id}` | Status NFSe | ⚠️ Beta |
| `POST` | `/api/whatsapp/send` | Enviar mensagem | ✅ |
| `GET` | `/api/whatsapp/session` | Status sessão | ✅ |
| `POST` | `/api/data-reset/operational` | Reset com arquivamento | ✅ |
| `GET` | `/api/backup/full` | Export JSON completo | ✅ |
| `POST` | `/api/stripe/webhook` | Webhook Stripe | ⏳ Parcial |

#### Configuração de Segurança

```env
CORS_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
JSON_BODY_LIMIT=512kb
FISCAL_BODY_LIMIT=6mb
WEBHOOK_BODY_LIMIT=2mb
FOCUS_NFE_TIMEOUT_MS=20000
```

### 8.2 Firebase Cloud Functions

- ❌ Não está implementado como Cloud Functions
- ⚠️ Usa Node.js + Express (servidor próprio)

### 8.3 Integrações Externas

| Serviço | Integração | Status |
|---------|-----------|--------|
| **Firebase** | Auth + Firestore | ✅ |
| **Stripe** | Pagamentos | ⏳ Webhook pronto, checkout não |
| **Focus NFe** | Emissão NFSe | ⚠️ Beta |
| **@open-wa/wa-automate** | WhatsApp | ✅ (com problemas de tipo) |

---

## 9️⃣ FIRESTORE RULES

**Arquivo:** `firestore.rules`  
**Status:** ✅ Endurecidas em Julho/2026

### 9.1 Estrutura das Regras

```firestore
match /users/{userId} {
  // Perfil do usuário
  match /users/{userId} {
    allow read: if canReadUserData(userId);
    allow create: if validUserProfileCreate(userId);
    allow update: if isOwner(userId);
    allow delete: if false;  // ✅ Bloqueado
  }

  // Subcollections (clientes, manutencoes, etc)
  match /clients/{docId} {
    allow read: if canReadUserData(userId);
    allow create, update: if validClientWrite();
    allow delete: if false;  // ✅ Bloqueado
  }

  // ... (similar para maintenances, warranties, etc)
}
```

### 9.2 Funções de Validação

| Função | Propósito |
|--------|----------|
| `signedIn()` | Autenticado |
| `isOwner(uid)` | É o dono |
| `isAdmin()` | Tem claim admin OU field role==admin |
| `isActiveOwner()` | Dono + ativo |
| `canReadUserData()` | Dono OR admin |
| `validClientWrite()` | Schema + soft delete |
| `softDeleteMetadataValid()` | Campos deletedAt, etc válidos |

### 9.3 Campos Soft Delete Obrigatórios

```firestore
deletedAt?: string | null        // ISO timestamp
deletedBy?: string | null        // UID do deletador
deletedReason?: string | null    // Razão da exclusão
resetAt?: string | null          // Timestamp do reset
resetId?: string | null          // ID do reset batch
```

### 9.4 Testes de Rules

| Teste | Resultado |
|-------|-----------|
| `npm run test:rules:static` | ✅ 8/8 |
| `npm run test:rules:scenarios` | ✅ 100+ |
| `npm run test:rules` | ✅ Emulador |

---

## 🔟 SINCRONIZAÇÃO OFFLINE

**Documentação:** `OFFLINE_SYNC.md`

### 10.1 Componentes

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| **Cache Persistente** | `src/firebase.ts` | IndexedDB via Firestore SDK |
| **Pré-carga** | `src/services/offlineDataPreload.ts` | Buscar dados 24h em background |
| **Fila Local** | `src/services/firestoreOfflineQueue.ts` | Queue + retry localStorage |
| **Replay** | `src/services/firestoreWriteReplay.ts` | Executar retries ao reconectar |
| **Monitor** | `src/hooks/useOfflineSyncStatus.ts` | Status visualização |

### 10.2 Fluxo de Sincronização

```
1. Usuário entra online
   ↓
2. App carrega dados normalmente do Firestore
   ↓
3. Internet cai
   ↓
4. Usuário continua criando/editando dados
   ↓
5. SDK do Firestore (IndexedDB):
   - Armazena no cache local
   - Enfileira as gravações
   ↓
6. Custom fila (localStorage):
   - Aguarda 1.2 segundos por confirmação
   - Se não confirmar, marca como pendente
   ↓
7. Internet volta
   ↓
8. Firestore sincroniza automaticamente
   ↓
9. Custom fila executa retries
   ↓
10. UI atualiza status "Sincronizado"
```

### 10.3 Limitações

- ❌ Primeiro login precisa de internet
- ⚠️ localStorage pode ser limpo pelo navegador
- ⚠️ Se duas abas editarem mesmo doc, "last write wins"
- ⏳ Sem restore de pendências após limpeza de dados

---

## 1️⃣1️⃣ TESTES

### 11.1 Testes Implementados

| Teste | Arquivo | Status | Cobertura |
|-------|---------|--------|----------|
| **Offline Resilience** | `scripts/offline-resilience-test.ts` | ✅ | 11/11 cenários |
| **Firestore Rules Static** | `scripts/firestore-rules-validation.mjs` | ✅ | 8/8 validações |
| **Firestore Rules Scenarios** | `scripts/firestore-rules-scenarios.mjs` | ✅ | 100+ |
| **Firestore Emulator** | `scripts/firestore-rules-scenarios.mjs` | ✅ | Full coverage |
| **Fiscal NFSe** | `scripts/fiscal-smoke-test.mjs` | ⚠️ | Básico |
| **Automatic Backup** | `scripts/automatic-backup.test.ts` | ⏳ | Parcial |

### 11.2 Executar Testes

```bash
npm run test:offline            # 11/11 ✅
npm run test:rules:static      # 8/8 ✅
npm run test:rules:scenarios   # 100+ ✅
npm run test:rules             # Emulator ✅
npm run test:fiscal            # Beta ⚠️
npm run test:backup            # Parcial ⏳
```

### 11.3 Gaps de Teste

- ❌ Frontend components (React Testing Library)
- ❌ E2E (Cypress/Playwright)
- ❌ Performance/load testing
- ❌ Disaster recovery (restore)
- ⚠️ Stripe webhook (mocked)

---

## 1️⃣2️⃣ CI/CD

### 12.1 Build Pipeline

```bash
npm run build                   # Full build
npm run build:client           # Vite → dist/
npm run build:server           # esbuild → dist-server/server.js

npm run lint                   # TypeScript check (❌ FAILING)
npm run start                  # Node dist-server/server.js
npm run deploy:hosting         # Firebase Hosting
npm run deploy:rules           # Firestore rules
npm run deploy:prod            # Ambos acima
```

### 12.2 Arquivos de Config

| Arquivo | Propósito |
|---------|-----------|
| `firebase.json` | Firebase Hosting config |
| `.firebaserc` | Projeto Firebase (**PENDENTE:** confirmar ID) |
| `vite.config.ts` | Build config + offline manifest |
| `tsconfig.json` | TypeScript config |
| `package.json` | Scripts + dependências |

### 12.3 Status Atual

| Comando | Status | Observação |
|---------|--------|-----------|
| `npm run lint` | ❌ FAILING | 5 erros TypeScript |
| `npm run build:client` | ✅ PASSING | Vite OK |
| `npm run build:server` | ✅ PASSING | esbuild OK |
| `npm run test:offline` | ✅ PASSING | 11/11 |
| `npm run test:rules` | ✅ PASSING | 100+ |

**Action Necessária:** Corrigir 5 erros de TypeScript antes de fazer deploy

---

## 1️⃣3️⃣ HISTÓRICO GIT

### 13.1 Últimos 25 Commits

```
51ccd54 (HEAD) feat: add optional firestore debug diagnostics
12cb5ee (tag: firestore-429-fixed) fix: eliminate firestore listener recreation loop
c4399f8 chore: atualizar app com melhorias operacionais e fiscais
603f24e Isola modulo fiscal como beta reservado
ca2275f Adiciona cancelamento de OS no caixa
b59853f Corrige regras para baixa de estoque faturada
3faa515 Implementa estoque e sincronizacao operacional
1707a7b Consolida correcoes finais e backup geral
5db8c83 fix: stabilize settings build and deploy
8b17c86 fix(rules): allow owner operational_logs
6d323cf fix: corrigir permissões de Firestore
acd945e feat: reforca integridade offline e exclusoes seguras
8027d0c (tag: piloto-v1) chore(phase-2): Validação cliente_removido
3dacbb1 (tag: fase2-estavel) Estabiliza sincronizacao offline
... (10+ commits de estabilização)
```

### 13.2 Branches Ativos

- `fix/week1-professionalization` (HEAD)
- `origin/main`
- `backup/expenses-before-ui-2026-08-10`

### 13.3 Histórico de Problemas Resolvidos

✅ **Problema 1:** Delete físico em Firestore  
→ Resolvido: Regras agora bloqueiam `deleteDoc()`

✅ **Problema 2:** Reset operacional apagava documentos  
→ Resolvido: Arquivamento com soft delete

✅ **Problema 3:** Firestore Error 429 (quota)  
→ Resolvido: `initializeFirestore()` com cache configurado

✅ **Problema 4:** Offline não funcionava bem  
→ Resolvido: Pré-carga 24h + IndexedDB + localStorage queue

---

## 1️⃣4️⃣ DOCUMENTAÇÃO EXISTENTE

### 14.1 Arquivos de Documentação

| Arquivo | Tamanho | Atualizado | Status |
|---------|--------|-----------|--------|
| [DOCUMENTACAO.md](DOCUMENTACAO.md) | ~400 linhas | Julho/2026 | ✅ Vivo |
| [README.md](README.md) | ~150 linhas | Julho/2026 | ✅ Atualizado |
| [OFFLINE_SYNC.md](OFFLINE_SYNC.md) | ~300 linhas | Julho/2026 | ✅ Completo |
| [FIREBASE_QUOTA_FIX.md](FIREBASE_QUOTA_FIX.md) | ~50 linhas | Junho/2026 | ✅ |
| [relatorio da auditoria.md](relatorio%20da%20auditoria.md) | ~400 linhas | Julho/2026 | ✅ |
| [correções finais.md](correções%20finais.md) | ~200 linhas | Julho/2026 | ✅ |
| [correcoes a ser feita.md](correcoes%20a%20ser%20feita.md) | ~200 linhas | Julho/2026 | ⏳ Obsoleto |
| [PASSO_A_PASSO_MODULO_FISCAL_RESERVADO.md](PASSO_A_PASSO_MODULO_FISCAL_RESERVADO.md) | ~100 linhas | Junho/2026 | ✅ |
| [PLANO_VENDAS_MOTOFIX.md](PLANO_VENDAS_MOTOFIX.md) | ~150 linhas | - | ⏳ |

### 14.2 Gaps de Documentação

- ❌ API documentation (OpenAPI/Swagger)
- ❌ Setup local guia passo-a-passo
- ❌ Troubleshooting offline
- ❌ Admin guide
- ❌ Architecture diagrams
- ⏳ Performance tuning

---

## 1️⃣5️⃣ TODOs E PROBLEMAS CONHECIDOS

### 15.1 TODOs/FIXMEs no Código

```
[Crítico - MÉDIA PRIORIDADE]

1. Escritas não-atômicas (cliente + manutenção)
   Arquivo: src/services/clientSaveService.ts:156-183
   Risco: Inconsistência se segunda escrita falhar
   Solução: Migrar para writeBatch

2. Fila offline em localStorage (frágil)
   Arquivo: src/services/firestoreOfflineQueue.ts:145+
   Risco: Pode ser limpa pelo navegador
   Solução: Migrar para IndexedDB

3. Backup incompleto (só dados ativos em memória)
   Arquivo: src/services/emergencyBackup.ts
   Risco: Não exporta deletedAt registros
   Solução: Exportar direto de Firestore com soft-deleted
```

### 15.2 Problemas Conhecidos

| ID | Problema | Severidade | Status |
|----|----------|-----------|--------|
| P1 | Lint failing (5 erros TS) | 🔴 CRÍTICO | ⏳ Corrigir |
| P2 | Módulo fiscal beta (não produção) | 🟡 MÉDIA | ⏳ Deploy |
| P3 | WhatsApp pode desconectar | 🟡 MÉDIA | ⏳ Retry |
| P4 | Status cliente não atualiza real-time | 🟡 MÉDIA | ⏳ Implementar |
| P5 | Transações não-atômicas | 🟡 MÉDIA | ⏳ Migrar writeBatch |
| P6 | Backup sem restore testado | 🟡 MÉDIA | ⏳ Implementar |
| P7 | Stripe checkout não completo | 🟡 MÉDIA | ⏳ Implementar |
| P8 | Roles/permissions admin inconsistente | 🟡 MÉDIA | ✅ Parcialmente resolvido |

---

## 1️⃣6️⃣ DECISÕES ARQUITETURAIS

### 16.1 Padrões Adotados

| Padrão | Justificativa | Impacto |
|--------|-----------------|--------|
| **Multi-tenant por uid** | Isolamento de dados + simplicidade | Escalabilidade OK até 10k users |
| **Soft delete obrigatório** | Recuperação de dados | Queries mais complexas (filtros `deletedAt`) |
| **Cache offline IndexedDB** | Disponibilidade offline | Complexidade + sincronização |
| **Custom fila localStorage** | Retry controle fino | localStorage frágil, pode ser limpo |
| **Service worker offline** | App funciona sem internet | Manutenção de assets |
| **Firebase Auth OAuth** | Simplicidade + segurança | Não suporta auth customizada |

### 16.2 Por que Cada Tecnologia?

| Tech | Por Quê |
|------|--------|
| **Firestore** | Real-time + offline support nativo |
| **React 19** | Hooks + latest features |
| **Tailwind 4** | CSS-in-JS mínimo + DX |
| **Vite** | Build rápido + dev experience |
| **Express** | Simples + middleware rich |
| **Firebase Hosting** | Deploy automático + free tier |

### 16.3 Trade-offs

| Decisão | Vantagem | Desvantagem |
|---------|----------|-----------|
| Soft delete | Recuperação fácil | Queries com filtro extra |
| localStorage queue | Simples | Pode ser limpo |
| IndexedDB cache | Confiável | Sincronização complexa |
| @open-wa/wa-automate | Sem credenciais | Tipo TypeScript ruim |
| OAuth Google only | Seguro | Sem login de email/senha |

---

## 1️⃣7️⃣ ESTADO ATUAL DE DESENVOLVIMENTO

### 17.1 Fases Completadas

| Fase | Escopo | Status |
|------|--------|--------|
| **Fase 0 (Piloto)** | CRM básico + auth | ✅ Completado |
| **Fase 1 (Estabilização)** | Offline + soft delete | ✅ Completado (Julho/2026) |
| **Fase 2 (Operacional)** | Estoque + fiscal beta | ✅ Completado (Julho/2026) |
| **Fase 3 (Profissionalização)** | Bug fixes + performance | 🔄 EM ANDAMENTO |

### 17.2 Velocidade de Desenvolvimento

- **Commits/semana:** ~3-4
- **Features concluídas:** ~2 por sprint
- **Bugs corrigidos:** ~3 por sprint
- **Documentação:** Viva (atualizada com cada release)

### 17.3 Métricas do Projeto

| Métrica | Valor |
|--------|-------|
| **Linhas de código (src)** | ~15.000 |
| **Componentes React** | 22 módulos |
| **Hooks customizados** | 28 |
| **Serviços/Repositories** | 32 |
| **Firestore colecções** | 12+ |
| **Testes** | 130+ casos |
| **Commits** | 25+ |

---

## 1️⃣8️⃣ RECOMENDAÇÕES E ROADMAP

### 18.1 Imediato (Esta Semana)

1. **Corrigir 5 erros de TypeScript** (P1 Crítico)
   - Arquivo: `server/whatsapp/WhatsAppSessionService.ts` (4 erros)
   - Arquivo: `src/components/layout/AppViewRenderer.tsx` (1 erro)
   - **Ação:** Corrigir imports e prop types

2. **Testar Stripe webhook completo** (P7 Média)
   - **Ação:** Implementar checkout end-to-end

### 18.2 Curto Prazo (2 Semanas)

3. **Implementar writeBatch para atomicidade** (P5 Média)
   - Cliente + manutenção em uma transação
   - Teste offline covering falha parcial

4. **Migrar fila offline para IndexedDB** (P2 Média)
   - Remover dependência localStorage
   - Adicionar bloquear logout se pendências

5. **Deploy fiscal em produção** (P2 Média)
   - Cloud Run ou Railway
   - Ativar API `/api/fiscal` em produção

### 18.3 Médio Prazo (1 Mês)

6. **Implementar restore de backups** (P6 Média)
   - Teste de disaster recovery
   - Documentação de restore

7. **Status cliente real-time** (P4 Média)
   - Atualizar status conforme manutenção é registrada
   - UI feedback imediato

8. **Refatoração App.tsx** (Técnica)
   - 5.000+ linhas → componentes menores
   - Melhor testabilidade

### 18.4 Longo Prazo (2-3 Meses)

9. **Audit log implementado** (Admin)
   - Registrar toda ação crítica
   - Dashboard admin

10. **Performance audit** (Otimização)
    - Lighthouse score > 90
    - Bundle size reduction

11. **Analytics & monitoring** (Observabilidade)
    - Sentry para erros
    - Datadog/Firebase Analytics

---

## 1️⃣9️⃣ COMO INICIAR O PROJETO LOCALMENTE

### Pré-requisitos
- Node.js 18+
- npm 9+
- Git
- Firebase CLI

### Setup

```bash
# 1. Clonar e instalar
git clone <repo>
cd motofix2.0
npm install

# 2. Criar .env baseado em .env.example
cp .env.example .env
# Preencher variáveis do Firebase

# 3. Colocar firebase-service-account.json (não versionar!)

# 4. Instalar Firebase Emulator (opcional para offline)
firebase init emulators

# 5. Rodar em dev
npm run dev

# 6. Validar
npm run lint
npm run test:offline
npm run test:rules

# 7. Build final
npm run build
npm run start
```

### URLs Locais
- Frontend: `http://localhost:5173` (Vite)
- Backend: `http://localhost:3001`
- Firestore Emulator: `localhost:8080`

---

## 2️⃣0️⃣ CONTATOS E RECURSOS

### Recursos
- Firebase Console: https://console.firebase.google.com/project/appmotofix
- GitHub: [link do repo]
- Firebase Docs: https://firebase.google.com/docs
- Firestore Rules: https://firebase.google.com/docs/firestore/security/start
- React 19: https://react.dev

### Documentação Interna
- [DOCUMENTACAO.md](DOCUMENTACAO.md) - Memória técnica viva
- [OFFLINE_SYNC.md](OFFLINE_SYNC.md) - Estratégia offline
- [relatorio da auditoria.md](relatorio%20da%20auditoria.md) - Achados de segurança

---

## CONCLUSÃO

O MotoFix 2.0 é um projeto **bem estruturado** com **decisões arquiteturais sólidas**, mas está em **fase de polimento** antes de produção.

### Status Geral
- ✅ Funcionalidades core implementadas
- ✅ Segurança endurecida (soft delete, regras Firestore)
- ✅ Offline funcionando
- ⚠️ Testes de segurança passando
- ❌ 5 erros TypeScript bloqueando build
- ⏳ Admin/monitoring ainda incompleto

### Recomendação
**Não fazer deploy sem corrigir 5 erros TypeScript.** Depois disso, é recomendável testar fluxos críticos (cliente+manutenção, backup/restore, offline sync) antes de lançar para produção.

---

**Auditoria Concluída em 2026-08-12**  
**Próxima Revisão Recomendada:** 2026-09-12 (após resolve de issues críticas)
