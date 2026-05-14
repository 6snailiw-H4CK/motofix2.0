# 📊 ARQUITETURA DE DADOS - MotoFix

**Data:** 10 de abril de 2026  
**Status:** ✅ Documentação de Orientação

---

## 🎯 PRINCÍPIO FUNDAMENTAL

```
MAINTENANCES (Serviços Reais)
        ↓
   ÚNICA FONTE DE VERDADE
        ↓
   ├─ Dashboard (métricas financeiras)
   ├─ Histórico (agrupado para visualização)
   └─ Relatórios/Analytics
```

---

## 📁 COLEÇÕES FIRESTORE

### 1️⃣ `users/{uid}/maintenances` 
**PAPEL:** Fonte de verdade para serviços e finanças

```typescript
interface MaintenanceRecord {
  id: string;
  clientId: string;
  clientName: string;
  serviceType: string;        // "Troca de Óleo", "Revisão", etc
  serviceValue: number;       // Valor TOTAL do serviço
  date: string;               // ISO 8601 da execução
  statusPagamento: 'Pago' | 'Parcial' | 'Pendente';
  valorPago: number;          // Quanto foi pago
  saldoDevedor: number;       // Quanto ainda falta
  isRecurringRevenue: boolean;
  notes?: string;
  userId: string;
}
```

**Uso:**
- ✅ Alimentar Dashboard (totalReceita, contasAReceber, etc)
- ✅ Gerar Histórico (agrupado por cliente)
- ✅ Calcular Top Serviços
- ✅ Validar dados antes de exibir

**NÃO É PERMITIDO:**
- ❌ Modificar sem salvar em cliente primeiro
- ❌ Duplicar dados de outras coleções aqui
- ❌ Usar apenas parte dos dados

---

### 2️⃣ `users/{uid}/message_logs`
**PAPEL:** Log de auditoria (apenas para suporte)

```typescript
interface MessageLog {
  id: string;
  clientId: string;
  clientName: string;
  messageType: 'whatsapp' | 'alert' | 'reminder' | 'system';
  content: string;
  status: 'sent' | 'pending' | 'failed';
  createdAt: string;
}
```

**Uso:**
- ✅ Visualizar histórico de mensagens enviadas
- ✅ Debugar problemas de comunicação
- ✅ Auditoria e conformidade

**NÃO É PERMITIDO:**
- ❌ Usar para calcular métricas financeiras
- ❌ Substituir `maintenances` em cálculos
- ❌ Alimentar dashboard com esses dados

---

### 3️⃣ `users/{uid}/clients`
**PAPEL:** Perfil do cliente (dados de contato)

```typescript
interface Client {
  id: string;
  name: string;
  bikeModel: string;
  contact: string;
  oilType: string;
  oilPrice: number;
  status: 'OK' | 'WARNING' | 'OVERDUE';
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  // ⚠️ NÃO manter cópias de statusPagamento/valorPago aqui
  // (deve vir de maintenances)
}
```

---

## 🔄 FLUXO DE DADOS CORRETO

### Quando registra um serviço novo:

```
Usuário preenche formulário
    ↓
ClientProfileForm submite dados
    ↓
App.tsx: handleSaveClient()
    ↓
    ├─ Salva/atualiza Cliente em /clients
    ├─ Cria MaintenanceRecord em /maintenances  ✅ FONTE DE VERDADE
    └─ Firebase Listener atualiza estado
    ↓
useMemo(financialStats) recalcula usando maintenances
    ↓
Dashboard re-renderiza com novos números
```

### Quando edita um serviço existente:

```
Usuário abre "Editar cliente"
    ↓
App.tsx: handleSelectClientSuggestion()
    ↓
    ├─ Busca ÚLTIMA maintenance em /maintenances  ✅
    ├─ Carrega: valorPago, statusPagamento, saldoDevedor
    └─ Renderiza no ClientProfileForm
    ↓
Usuário edita valores
    ↓
handleSaveClient() executa:
    ├─ updateDoc() /clients (perfil)
    ├─ updateDoc() /maintenances (pagamento)  ✅ ATUALIZACIÓN CORRETA
    └─ Firebase dispara update
    ↓
Dashboard recalcula com novos dados
```

---

## 📊 DASHBOARD - Fonte De Dados

### Cálculo de `financialStats`:

```typescript
const financialStats = useMemo(() => {
  // ❌ ERRADO: usar groupedHistory ou messageLogs
  // ✅ CORRETO: usar maintenances
  
  const totalReceita = maintenances.reduce((sum, m) => {
    if (m.statusPagamento === 'Pago') {
      return sum + m.serviceValue;
    } else {
      return sum + (m.valorPago || 0);
    }
  }, 0);
  
  const contasAReceber = maintenances
    .filter(m => m.statusPagamento === 'Parcial' || m.statusPagamento === 'Pendente')
    .reduce((sum, m) => sum + (m.saldoDevedor || 0), 0);
    
  // ... resto dos cálculos
  
}, [maintenances]);  // ✅ Atualiza quando maintenances muda
```

### Cards que alimentam:
- 💰 Total Recebido → `totalReceita`
- ⏳ À Receber → `contasAReceber`
- 🔄 Recorrente → `recurrentRevenue` (de maintenances)
- 👥 Total Clientes → `clients.length`
- 🛡️ Garantias → `warranties.length`

---

## 📋 HISTÓRICO - Visualização Formatada

### Cálculo de `groupedHistory`:

```typescript
const groupedHistory = useMemo(() => {
  // ✅ CORRETO: Agrupa maintenances para exibição
  // ❌ NÃO usar messageLogs para isso
  
  const filtered = maintenances.filter(record => {
    return matchesDate && matchesClient && matchesType;
  });
  
  // Agrupa por cliente
  const grouped = new Map<string, MaintenanceRecord[]>();
  filtered.forEach(record => {
    grouped.set(record.clientName, [...]);
  });
  
  return Array.from(grouped);
  
}, [maintenances, historyFilters]);  // ✅ Monitora maintenances
```

### O que exibe:
- Lista de clientes
- Serviços de cada cliente (expandível)
- Data, status, valores

**Propósito:** Log visual dos serviços realizados (suporte visual)

---

## ⚠️ ERROS COMUNS A EVITAR

### ❌ Erro 1: Usar `groupedHistory` para cálculos financeiros
```typescript
// ERRADO
const totalReceita = groupedHistory.reduce(...);
// CERTO
const totalReceita = maintenances.reduce(...);
```

### ❌ Erro 2: Usar `messageLogs` para saber se serviço foi pago
```typescript
// ERRADO
const status = messageLogs.find(m => m.clientId === id);
// CERTO
const status = maintenances.find(m => m.clientId === id);
```

### ❌ Erro 3: Não atualizar `maintenances` ao editar pagamento
```typescript
// ERRADO
await updateDoc(doc(db, 'clients', clientId), {
  statusPagamento: 'Pago'
});
// CERTO
await updateDoc(doc(db, 'maintenances', recordId), {
  statusPagamento: 'Pago',
  valorPago: newValue,
  saldoDevedor: 0
});
```

### ❌ Erro 4: Duplicar dados entre coleções
```typescript
// ERRADO
clients: {
  statusPagamento: 'Pago',    // ← NÃO
  valorPago: 100,             // ← NÃO
  saldoDevedor: 0             // ← NÃO
}
// CERTO - deixar em maintenances apenas
maintenances: {
  statusPagamento: 'Pago',    // ← SIM
  valorPago: 100,             // ← SIM
  saldoDevedor: 0             // ← SIM
}
```

---

## ✅ CHECKLIST - Implementação Correta

- [ ] **Dashboard usa `maintenances`** para cálculos
- [ ] **Histórico agrupa `maintenances`** para exibição
- [ ] **Message logs são apenas para auditoria** (não para métricas)
- [ ] **Editar pagamento atualiza `maintenances`** imediatamente
- [ ] **Não duplicar dados** entre coleções
- [ ] **Firebase listeners** monitoram apenas `maintenances`, `clients`, `warranties`
- [ ] **Validação:** Dados no dashbaord = Dados em maintenances

---

## 🔍 COMO DEBUGAR

Se o dashboard **não atualiza** após editar pagamento:

```
1. Verificar se updateDoc() foi executado com sucesso
2. Abrir Firestore Console → users/{uid}/maintenances
3. Confirmar se valorPago foi atualizado
4. Verificar se Firebase Listener em maintenances dispara
5. Verificar useMemo() tem [maintenances] como dependência
```

Se o histórico **mostra dados errados**:

```
1. Verificar se groupedHistory filtra maintenances corretamente
2. NÃO verificar messageLogs (eles são logs, não dados)
3. Confirmar filtros (data, cliente, tipo serviço)
4. Resetar filtros (startDate/endDate)
```

---

## 📌 RESUMO EM UMA FRASE

> **MAINTENANCES = Fonte de verdade única. Dashboard e Histórico leem de lá. MessageLogs = Apenas auditoria.**

