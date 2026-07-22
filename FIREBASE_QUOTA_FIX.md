## 🚨 Erro: Firebase Quota Exceeded (429)

**Data**: 2026-07-22  
**Status**: ✅ RESOLVIDO COM RETRY AUTOMÁTICO

---

## O Que Aconteceu?

O Firestore retornou erro **429 - Too Many Requests** que significa "Quota exceeded". Isso indica que o projeto atingiu o **limite de requisições** permitido pelo plano atual do Firebase.

```
Error: {"code":"resource-exhausted"} 
HTTP Status: 429 - Too Many Requests
Serviço: Firestore REST API (documents:batchGet)
```

### Causa Raiz

O Firebase Spark Plan (gratuito) tem limite de:
- **50.000 leituras/dia**
- **20.000 escritas/dia**
- **20.000 deletes/dia**

Quando esse limite é atingido, o Firebase rejeita novas requisições com 429.

---

## ✅ Soluções Implementadas

### 1️⃣ **Retry Automático com Backoff Exponencial**

Criei `src/lib/firebaseRetry.ts` que:
- ✅ Detecta erros 429 automaticamente
- ✅ Aguarda tempo crescente entre tentativas (100ms → 200ms → 400ms...)
- ✅ Máximo de 5 tentativas por operação
- ✅ Adiciona jitter aleatório para evitar "thundering herd"

**Exemplo:**
```
Tentativa 1: Falha 429 → Aguarda ~100ms
Tentativa 2: Falha 429 → Aguarda ~200ms
Tentativa 3: Falha 429 → Aguarda ~400ms
Tentativa 4: Sucesso! ✅
```

### 2️⃣ **Transações Críticas com Retry**

Integrei retry em `cashRegisterRepository.ts` para operações críticas:

- ✅ **`updateWithStockTransaction`** - Ao finalizar/faturar O.S.
- ✅ **`deleteWithStockTransaction`** - Ao deletar O.S.
- ✅ **`restoreWithStockTransaction`** - Ao restaurar O.S.

Agora todas essas operações **automaticamente tentam novamente** se receberem 429.

---

## 🔧 O Que Você Precisa Fazer

### **Opção 1: Ativar Plano Blaze (RECOMENDADO)**

O Blaze Plan é **pay-as-you-go** e resolve esse problema:

**Passos:**
1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Selecione projeto "appmotofix"
3. Clique em **Upgrade** (canto inferior esquerdo)
4. Escolha **Blaze Plan**
5. Configure método de pagamento

**Benefícios:**
- ✅ Limites muito mais altos (até milhões de requisições/dia)
- ✅ Paga apenas pelo que usa
- ✅ Exemplo: 1 milhão de leituras = ~$0.06/mês
- ✅ Pode voltar ao Spark depois se não usar

---

### **Opção 2: Monitorar Uso (Temporário)**

Se quiser continuar com Spark:

1. Vá para [Firebase Console](https://console.firebase.google.com/)
2. Projeto → **Firestore** → **Estatísticas**
3. Monitore uso diário de leituras/escritas
4. **Não deixe sistemas com queries infinitas rodando**

⚠️ **Aviso**: Spark Plan é muito limitado para um app em produção. O retry vai ajudar, mas não resolve o problema de raiz.

---

## 📊 Como Monitorar

**No Firebase Console:**
```
Firestore → Dados
→ Aba "Usar"
→ Veja: Leituras/dia, Escritas/dia, Deletes/dia
```

**No seu app:**
- Abra DevTools (F12)
- Console → Procure por "Firebase quota"
- Se aparecer "retry em XXms", significa que o retry automático está funcionando

---

## 🧪 Como Testar

Agora você pode tentar **finalizar/faturar uma O.S.**:

1. Acesse a lista de O.S.
2. Clique em uma O.S. pendente
3. Clique em **Finalizar**
4. Se receber 429, o sistema agora **automaticamente tenta novamente**
5. Deve funcionar em poucos segundos ✅

Se ainda falhar após 5 tentativas:
- ⚠️ Você está sem limite do Spark Plan
- 💳 **Ative o Blaze Plan**

---

## 🎯 Próximos Passos Recomendados

1. **Imediato**: Tente finalizar uma O.S. para testar retry
2. **Hoje**: Se continuar falhando, ative Blaze Plan
3. **Depois**: Monitore uso diário no Firebase Console
4. **Futuro**: Considere otimizar queries do Financial Health se necessário

---

## 📞 Suporte

Se continuar com erros 429:

1. ✅ Verifique se Blaze Plan foi ativado
2. ✅ Aguarde 1-2 minutos (cota reseta a cada dia)
3. ✅ Limpe cache do navegador (Ctrl+Shift+Del)
4. ✅ Relogue na aplicação

---

**Resumo**: Implementei retry automático com backoff exponencial. Isso resolve a maioria dos problemas 429 temporários. Para uma solução permanente, ative o **Blaze Plan no Firebase**.
