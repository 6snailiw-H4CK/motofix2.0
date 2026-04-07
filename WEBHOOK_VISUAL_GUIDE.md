# 🎯 Guia Visual - Configurar Webhook no Stripe (Passo-a-Passo COM PRINT)

## 📍 Você está aqui: Passo 4️⃣ de 10

---

## ✅ PASSO 1: Acessar Seção de Webhooks

### Na tela do Stripe Dashboard:

1. **Canto superior esquerdo** → Veja o **menu hambúrguer** (três linhas)
2. Clique em **Developers**
   ```
   📍 Stripe Dashboard (canto superior)
   └── Developers (clique aqui)
   ```

3. Você entrará em **Developers**
4. No lado esquerdo, veja menu:
   ```
   Webhooks ← (clique aqui)
   Events
   Logs
   API Reference
   ```

5. Clique em **"Webhooks"**

---

## ✅ PASSO 2: Criar Novo Webhook Endpoint

### Na página de Webhooks:

1. Veja o botão **azul** no canto superior direito
   ```
   [Add endpoint] ← clique
   ```

2. Uma caixa vai abrir com campos:
   ```
   ┌─────────────────────────────────────┐
   │ Endpoint URL                        │
   │ ┌─────────────────────────────────┐ │
   │ │                                 │ │
   │ │ http://localhost:3001/api/...   │ │
   │ │ ← COPIE A URL CORRETA AQUI      │ │
   │ └─────────────────────────────────┘ │
   └─────────────────────────────────────┘
   ```

---

## 🔑 PASSO 3: Qual URL Usar?

### Escolha uma das opções:

| Situação | URL | Quando Usar |
|----------|-----|-----------|
| **Desenvolvimento Local** | `http://localhost:3001/api/payments/webhook` | ✅ Agora (testing) |
| **Deploy em Produção** | `https://seu-dominio.com/api/payments/webhook` | Depois (production) |

### Para TESTE LOCAL, copie:
```
http://localhost:3001/api/payments/webhook
```

Coloque exatamente assim na caixa de **Endpoint URL**.

---

## ✅ PASSO 4: Selecionar Eventos

### Após preencher a URL:

1. Veja a seção: **"Events to send"**
2. Verá duas opções:
   ```
   ○ Send me all events (beta)
   ● Select specific events
   ```

3. **Clique em "Select specific events"** (provavelmente já está selecionado)

4. Uma caixa com eventos vai aparecer:
   ```
   ☐ charge.amount_disputed
   ☐ charge.captured
   ☐ charge.dispute.closed
   ... (muitos eventos)
   ```

5. **PROCURE por** (ou use Ctrl+F):
   - `payment_intent.succeeded` ← ✅ MARQUE
   - `payment_intent.payment_failed` ← ✅ MARQUE

6. **ROLE PARA BAIXO** e procure:
   - `customer.subscription.updated` ← ✅ MARQUE
   - `customer.subscription.deleted` ← ✅ MARQUE

### Resultado final:
```
✅ payment_intent.succeeded
✅ payment_intent.payment_failed
✅ customer.subscription.updated
✅ customer.subscription.deleted
```

---

## ✅ PASSO 5: Criar o Endpoint

### No final da caixa:

1. Veja um botão **azul**:
   ```
   [Add events] ← (pode haver este botão)
   ```

2. Depois veja:
   ```
   [Create endpoint] ← clique aqui (botão azul no final)
   ```

3. **PRONTO!** Você vai ver mensagem:
   ```
   ✓ Endpoint created successfully
   ```

---

## 🔐 PASSO 6: Copiar Webhook Secret

### Após criar o endpoint:

1. Você voltará à página de **Webhooks**
2. Veja seu endpoint listado:
   ```
   http://localhost:3001/api/payments/webhook ← seu novo endpoint
   
   Status: Enabled (verde)
   ```

3. **Clique NO SEU ENDPOINT** para abrir detalhes

4. Você verá uma tela com detalhes:
   ```
   Endpoint Details
   ├── URL: http://localhost:3001/api/payments/webhook
   ├── Version: 2024-04-10 (ou similar)
   ├── Events: 4 selected
   └── Signing secret: ......
   ```

5. **Procure por "Signing secret"**:
   ```
   Signing secret
   [Reveal] ← clique neste botão
   ```

6. Clique em **"Reveal"**
   ```
   whsec_1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P ← COPIE ISTO
   ```

7. **Copie toda a chave** que começa com `whsec_`

---

## 📝 PASSO 7: Adicionar ao `.env.local`

### Voltando ao seu código:

1. Abra o arquivo `.env.local` na raiz do seu projeto
2. Adicione:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P
   ```

3. Salve o arquivo (Ctrl+S)

---

## ✅ PASSO 8: Verificar Configuração

### Para garantir que tudo está certo:

1. Seu `.env.local` deve ter:
   ```env
   STRIPE_PUBLISHABLE_KEY=pk_test_... (já tem?)
   STRIPE_SECRET_KEY=sk_test_... (já tem?)
   STRIPE_WEBHOOK_SECRET=whsec_... (ACABOU DE ADICIONAR)
   STRIPE_PRICE_ID=price_... (já tem?)
   ```

2. **Se faltou algo**, volte aos passos anteriores

3. **Se tudo está preenchido**, ✅ Parabéns!

---

## 🚀 PRÓXIMA ETAPA

Agora você tem **tudo configurado para testar localmente!**

Próximo passo (Passo 7 do guia):
1. Abre terminal
2. Executa: `npm run dev`
3. Acessa: `http://localhost:5173`
4. Faz login
5. Clica em "Pagar agora com PIX ou Cartão"
6. Usa número de cartão: `4242 4242 4242 4242`

---

## 🆘 Problemas Comuns

### ❌ "Não acho a página de Webhooks"
**Solução**: 
1. Acesso direto: https://dashboard.stripe.com/developers/webhooks
2. Ou: Dashboard → Developers (menu lateral) → Webhooks

### ❌ "Não vejo o botão 'Add endpoint'"
**Solução**: 
1. Você está em **Test Mode**? (vê escrito "Test mode" no topo?)
2. Se não, clique no toggle no canto superior direito

### ❌ "Criei o endpoint mas não acho o Signing Secret"
**Solução**:
1. Clique no endpoint que criou (na lista)
2. Procure por "Signing secret" (em inglês)
3. Clique em "Reveal"
4. Copie a chave inteira

### ❌ "Copiei a chave mas parece estar errada"
**Solução**:
1. Certifique-se que começa com `whsec_`
2. Copie SEM espaços
3. Salve em `.env.local` com:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_sua_chave_aqui
   ```

---

## 📞 Agora Avance!

Quando terminar este passo:
1. ✅ Webhook criado no Stripe
2. ✅ Signing Secret copiado
3. ✅ `.env.local` atualizado

**Diga quando terminar para te ajudar no próximo passo!** 🚀

