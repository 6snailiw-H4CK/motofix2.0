# 💳 Guia de Configuração do Stripe + MotoFix Manager

Este guia detalha como integrar pagamentos Stripe para gerenciar assinaturas de R$ 49,90/mês no MotoFix Manager.

## 🎯 Visão Geral

- **Ambiente**: Node.js Express + Firebase
- **Pagamentos**: PIX, Cartão de Crédito via Stripe
- **Criptografia**: Webhooks do Stripe assinados
- **Automação**: Ativação automática de assinatura após pagamento confirmado
- **Moeda**: Real Brasileiro (BRL)

---

## 1️⃣ Criar Conta Stripe

### A. Registre-se
1. Acesse [https://stripe.com/br](https://stripe.com/br)
2. Clique em **"Comece Agora"**
3. Preencha dados da sua empresa:
   - Nome: Seu Nome/Nome da Oficina
   - Email: seu@email.com
   - País: Brasil
   - Moeda preferida: Real (BRL)

### B. Verifique Email
- Confirme seu email pelo link enviado
- Faça login no dashboard Stripe

### C. Ative PIX
1. No dashboard, vá para **Settings → Payment Methods**
2. Ative **Pix** como método de pagamento
3. Configure conta bancária para receber transferências

---

## 2️⃣ Obter Credenciais Stripe

### A. Chaves da API

1. Vá para [https://dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)
2. Você verá **2 linhas**:
   - **Publishable Key** (pk_...) - Segura usar no frontend
   - **Secret Key** (sk_...) - ⚠️ Mantenha em segredo!

### Ambiente de Teste
Para desenvolver e testar **sem cobrar dinheiro real**:
- Toggle para **Test Mode** (canto superior direito)
- Use chaves com prefixo `pk_test_` e `sk_test_`

### Ambiente de Produção
Para cobrar **de verdade**:
- Toggle para **Live Mode**
- Use chaves com prefixo `pk_live_` e `sk_live_`

---

## 3️⃣ Criar Produto e Preço

### A. Criar Produto

1. Vá para **Products** → **Add product**
2. Preencha:
   - **Name**: "MotoFix Manager - Assinatura Mensal"
   - **Description**: "Acesso ilimitado ao sistema de gestão de oficina"
   - **Type**: "Service" (Serviço)
   - **Pricing**: Deixe para fazer no próximo passo

### B. Criar Preço

1. Na página do produto, clique em **"Add pricing"**
2. Configure:
   - **Billing period**: Monthly (Mensal)
   - **Price**: 49.90 BRL
   - **Billing behavior**: Send invoice to customer
   - **ID do preço**: Anote o valor (ex: `price_1A2B3C4D5E6F7G8H`)

Salve o **Price ID** - você vai usar na configuração abaixo.

---

## 4️⃣ Configurar Webhook

### O que é um Webhook?
É uma URL que o Stripe chama para notificar seu servidor sobre pagamentos. Sem ele, o sistema não sabe quando ativar a assinatura.

### A. Criar Endpoint do Webhook

1. Vá para **Developers** → **Webhooks**
2. Clique em **"Add endpoint"**
3. Configure:
   - **URL**: `https://seu-dominio.com/api/payments/webhook`
     - **Local (desenvolvimento)**: `http://localhost:3001/api/payments/webhook`
   - **Version**: Deixe a padrão (api version mais recente)
   - **Events to send**:
     - ✅ `payment_intent.succeeded`
     - ✅ `payment_intent.payment_failed`
     - ✅ `customer.subscription.updated`
     - ✅ `customer.subscription.deleted`

4. Clique em **"Create endpoint"**

### B. Copiar Webhook Secret

Após criar o endpoint:
1. Clique no endpoint para abrir detalhes
2. Vá para a aba **"Signing secret"**
3. Clique em **"Reveal"**
4. Copie a chave (começa com `whsec_`)

---

## 5️⃣ Configurar Variáveis de Ambiente

### Criar arquivo `.env.local`

Na raiz do projeto:

```bash
# ========== STRIPE ==========
STRIPE_PUBLISHABLE_KEY=pk_test_sua_chave_publica_aqui
STRIPE_SECRET_KEY=sk_test_sua_chave_secreta_aqui
STRIPE_WEBHOOK_SECRET=whsec_seu_webhook_secret_aqui
STRIPE_PRICE_ID=price_sua_price_id

# ========== FIREBASE ==========
VITE_FIREBASE_API_KEY=sua_api_key
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu_numero
VITE_FIREBASE_APP_ID=seu_app_id

# ========== ADMIN ==========
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# ========== SERVER ==========
NODE_ENV=development
PORT=3001
VITE_STRIPE_API_URL=http://localhost:3001
```

### ⚠️ Nunca commit `.env.local`

Adicione ao `.gitignore`:
```
.env.local
.env
firebase-service-account.json
```

---

## 6️⃣ Configurar Firebase Admin SDK

Você precisa de um arquivo JSON com credenciais do Firebase para o backend atualizar Firestore.

### A. Gerar Arquivo de Credenciais

1. Vá para [Firebase Console](https://console.firebase.google.com)
2. Selecione seu projeto
3. **Settings** → **Service Accounts**
4. Clique em **"Generate new private key"**
5. Um arquivo JSON será baixado automaticamente

### B. Adicionar ao Projeto

1. Copie o arquivo JSON para a raiz do projeto:
   ```
   cp ~/Downloads/firebase-service-account-key.json ./firebase-service-account.json
   ```

2. Atualize no `.env.local`:
   ```
   FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
   ```

3. Adicione ao `.gitignore` para não commitar credenciais:
   ```
   firebase-service-account.json
   ```

---

## 7️⃣ Testar Integração

### A. Iniciar o Servidor Local

```bash
npm install  # Se não instalou dependências ainda
npm run dev  # Inicia Vite + Server na porta 3001
```

### B. Verificar Saúde do Servidor

```bash
curl http://localhost:3001/api/health

# Resposta esperada:
# {"status":"ok","timestamp":"2024-04-06T..."}
```

### C. Testar com Números de Teste do Stripe

Use números de cartão de teste:

**Sucesso**:
```
4242 4242 4242 4242
MM/AA: Qualquer data futura
CVC: Qualquer 3 dígitos
```

**Falha intencional**:
```
4000 0000 0000 0002
MM/AA: Qualquer data futura
CVC: Qualquer 3 dígitos
```

### D. Simular Webhook Localmente

Use Stripe CLI para testar webhooks sem deploy:

```bash
# 1. Instale Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Windows: Faça download em https://stripe.com/docs/stripe-cli

# 2. Login
stripe login

# 3. Ouça webhooks
stripe listen --forward-to localhost:3001/api/payments/webhook

# 4. Copie a chave de signing (whsec_...) para .env.local
STRIPE_WEBHOOK_SECRET=whsec_...

# 5. Em outro terminal, dispare evento de teste
stripe trigger payment_intent.succeeded
```

---

## 8️⃣ Estrutura do Fluxo de Pagamento

```
┌─────────────────────────────────────────────────────────┐
│ 1. Usuário clica "Pagar agora com PIX ou Cartão"       │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Frontend (React) chamada POST /api/payments/create   │
│    Envia: { userId, userEmail, priceId }               │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Backend cria PaymentIntent no Stripe                 │
│    Retorna clientSecret para o frontend                 │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Frontend renderiza Stripe Payment Element            │
│    Mostra PIX QR Code ou form de cartão                 │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Usuário completa pagamento                           │
│    PIX: Escaneia QR Code                                │
│    Cartão: Insere dados                                 │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Stripe confirma pagamento ✓                          │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 7. Webhook notification: POST /api/payments/webhook     │
│    Evento: payment_intent.succeeded                     │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 8. Backend atualiza Firestore                           │
│    - subscription.status = "active"                     │
│    - subscription.expiresAt = now + 30 dias             │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 9. Usuário é redirecionado ao Dashboard                │
│    Tem acesso total ao sistema                          │
└─────────────────────────────────────────────────────────┘
```

---

## 9️⃣ Deploy para Produção

### A. Gerar Chaves Reais do Stripe
1. No dashboard, toggle para **Live Mode**
2. Copie as chaves com prefixo `pk_live_` e `sk_live_`
3. Atualize `.env` em produção

### B. Desdobramos para Firebase Hosting + Cloud Run

```bash
# Build da aplicação
npm run build

# Deploy dos estáticos para Firebase Hosting
firebase deploy --only hosting

# Para o backend, você pode:
# - Usar Cloud Run (Google Cloud)
# - Usar Railway
# - Usar Heroku
# - Fazer self-hosting
```

### C. Atualizar URL do Webhook
1. Em produção, altere para: `https://seu-dominio.com/api/payments/webhook`
2. Vá para **Developers** → **Webhooks**
3. Edite o endpoint e altere a URL
4. Atualize `STRIPE_WEBHOOK_SECRET` em produção

---

## 🔟 Troubleshooting

### "Webhook signature verification failed"
- ❌ `STRIPE_WEBHOOK_SECRET` está incorreto
- ✅ Copie novamente do dashboard Stripe

### "Firebase service account file not found"
- ❌ `firebase-service-account.json` não está na raiz do projeto
- ✅ Verifique o caminho em `FIREBASE_SERVICE_ACCOUNT_PATH`

### "Insufficient permissions" no Firestore
- ❌ Regras de Firestore não permitem escrita
- ✅ Atualize firestore.rules para permitir escrita no campo `subscription`

### Pagamento bem-sucedido mas assinatura não ativa
- ❌ Webhook não está recebendo eventos
- ✅ Verifique logs em **Developers** → **Webhooks** → clique no endpoint

---

## 📞 Próximos Passos

1. ✅ Configurou todas as variáveis de ambiente?
2. ✅ Testou pagamento com cartão de teste?
3. ✅ Verificou se assinatura ficou `active` no Firestore?
4. ✅ Atualizou descrições na tela inicial (já feito!)
5. ✅ Deployou para produção?

---

## 📚 Referências

- 📖 [Documentação Stripe](https://stripe.com/docs)
- 🎯 [Stripe Payment Methods](https://stripe.com/docs/payments/payment-element)
- 🔐 [Webhooks Stripe](https://stripe.com/docs/webhooks)
- 🔑 [Stripe Testing](https://stripe.com/docs/testing)

---

**Dúvidas? Contate support@stripe.com ou consulte a documentação oficial.**
