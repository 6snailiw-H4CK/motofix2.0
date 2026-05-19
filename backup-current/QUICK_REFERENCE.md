# ⚡ Referência Rápida - Checkout & Assinaturas

## 📦 Arquivos Modificados/Criados

| Arquivo | Tipo | O quê |
|---------|------|-------|
| `src/App.tsx` | ✏️ Modificado | Adicionado CheckoutScreen + view 'checkout' |
| `src/types.ts` | ✏️ Modificado | Nova interface Subscription |
| `server.ts` | ✏️ Modificado | Backend com rotas Stripe + webhooks |
| `src/services/stripeService.ts` | ✨ Novo | Cliente HTTP para Stripe API |
| `.env.example` | ✏️ Atualizado | Variáveis de ambiente necessárias |
| `STRIPE_SETUP.md` | ✨ Novo | Guia completo de configuração |
| `CHECKOUT_SUMMARY.md` | ✨ Novo | Resumo desta implementação |
| `QUICK_REFERENCE.md` | ✨ Novo | Este arquivo |

---

## 🔑 Variáveis de Ambiente Obrigatórias

```bash
# Stripe (obter em https://dashboard.stripe.com/apikeys)
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

# Firebase (obter em https://console.firebase.google.com)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
# ... etc (veja .env.example)

# Admin
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# Server
PORT=3001
VITE_STRIPE_API_URL=http://localhost:3001
```

---

## 📡 API Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/health` | Verifica saúde do servidor |
| `GET` | `/api/payments/publishable-key` | Obtém chave pública Stripe |
| `POST` | `/api/payments/create-checkout` | Cria Payment Intent |
| `GET` | `/api/payments/session/{id}` | Verifica status de pagamento |
| `POST` | `/api/payments/webhook` | Webhook Stripe |

---

## 💳 Dados de Teste Stripe

**Cartão que sucede**:
```
4242 4242 4242 4242
MM/AA: Qualquer data futura
CVC: Qualquer 3 dígitos
```

**Cartão que falha**:
```
4000 0000 0000 0002
MM/AA: Qualquer data futura
CVC: Qualquer 3 dígitos
```

**PIX**: Escolha "Pix" no form e escaneie o QR Code

---

## 🔄 Fluxo de Estado

```
Login
  ↓
isNewUser = true?
  ├─ Sim → CheckoutScreen
  │         └─ Pagar? 
  │           ├─ Sim→ Stripe form → Pagamento  
  │           │       └─ Success → Firestore (subscription.status = "active")
  │           │       └─ Failure → Msg erro
  │           └─ Não → Retry depois
  │
  └─ Não → Dashboard (subscription.status = "active")
```

---

## 🔒 Segurança

- ✅ Secret Key NUNCA deve estar no frontend
- ✅ Webhook precisa de validação de assinatura
- ✅ Arquivo `firebase-service-account.json` não deve fazer push
- ✅ `STRIPE_WEBHOOK_SECRET` é único por endpoint
- ✅ Firestore Rules devem permitir escrita em `subscription` field

---

## 🧪 Testar Localmente

```bash
# 1. Terminal 1: Servidor
npm run dev

# 2. Terminal 2: Stripe CLI (para simular webhooks)
stripe listen --forward-to localhost:3001/api/payments/webhook

# 3. Terminal 3: Disparar evento de teste
stripe trigger payment_intent.succeeded

# 4. Abrir http://localhost:5173 no navegador
# Fazer login → Vê CheckoutScreen → Clica "Pagar" → Usa números de teste
```

---

## 📊 Monitorar Webhooks (Production)

1. Stripe Dashboard → **Developers** → **Webhooks**
2. Clique no seu endpoint
3. Veja **Events** para logs de sucesso/erro
4. Se falhar, veja a resposta HTTP e erro detalhado

---

## 💰 Precificação

- **Plano**: Mensal
- **Preço**: R$ 49,90/mês
- **Renovação**: Automática (autoRenew = true)
- **Período de teste**: Não configurado (opcional: adicionar depois)
- **Cancelamento**: Manual pelo usuário

---

## 🚨 Erros Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| `STRIPE_PUBLISHABLE_KEY not configured` | `.env.local` não possui a chave | Adicione a chave pública |
| `Webhook signature failed` | `STRIPE_WEBHOOK_SECRET` está errado | Copie novamente do dashboard |
| `Firebase service account not found` | Arquivo JSON não existe | Baixe novamente e coloque na raiz |
| `Assinatura não ativa após pagamento` | Webhook não funcionou | Verificar logs em `Developers > Webhooks` |

---

## 📞 Comandos Úteis

```bash
# Instalar dependências
npm install

# Build para produção
npm run build

# Iniciar dev (frontend + backend)
npm run dev

# Apenas servidor
npm run build && node dist/server.js

# Limpar build
rm -rf dist

# Ver logs Firebase
firebase emulators:start --import=./data

# Deploy Firebase
firebase deploy --only hosting

# Testar build production localmente
npm run build && node dist/server.js
```

---

## 📚 Documentação Referenciada

- [Stripe Payments](https://stripe.com/docs/payments)
- [Payment Element](https://stripe.com/docs/payments/payment-element)
- [Webhooks](https://stripe.com/docs/webhooks)
- [Testing](https://stripe.com/docs/testing)
- [Firebase Admin SDK](https://firebase.google.com/docs/database/admin/start)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/start)

---

**Versão**: 1.0  
**Data**: 6 de Abril de 2024  
**Status**: ✅ Pronto para configuração

