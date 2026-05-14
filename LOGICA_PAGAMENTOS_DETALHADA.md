# 📋 LÓGICA DE PAGAMENTOS - DOCUMENTAÇÃO TÉCNICA DETALHADA

**Data:** 10 de abril de 2026  
**Projeto:** MotoFix - Sistema de Gestão de Serviços Automotivos  
**Versão:** 2.0 (Refatoração Completa)

---

## 📑 ÍNDICE

1. [Visão Geral](#visão-geral)
2. [Estrutura de Dados](#estrutura-de-dados)
3. [Estados de Pagamento](#estados-de-pagamento)
4. [Fluxos de Negócio](#fluxos-de-negócio)
5. [Cálculos e Fórmulas](#cálculos-e-fórmulas)
6. [Dashboard - Estatísticas](#dashboard---estatísticas)
7. [Exemplos Práticos](#exemplos-práticos)
8. [Implementação Técnica](#implementação-técnica)

---

## 🎯 VISÃO GERAL

### Objetivo Principal
Controlar com precisão o fluxo de caixa e contas a receber de um negócio de serviços automotivos (troca de óleo, revisões, etc).

### Problema Resolvido
- **Antes:** Não havia distinção entre serviços pagos e pendentes no Dashboard
- **Depois:** Sistema diferencia 3 tipos de pagamento (Pago, Parcial, Pendente) com cálculos automáticos

### Fluxo Simplificado
```
Cliente registra serviço
         ↓
Define status de pagamento (Pago/Parcial/Pendente)
         ↓
Sistema calcula automaticamente:
  - Receita (o que entrou no caixa)
  - Contas a Receber (o que ainda vai entrar)
         ↓
Dashboard exibe estatísticas em tempo real
```

---

## 💾 ESTRUTURA DE DADOS

### MaintenanceRecord (Serviço Realizado)

```typescript
interface MaintenanceRecord {
  // Identificação
  id: string;                          // ID único (Firestore)
  clientId: string;                    // Referência ao cliente
  clientName: string;                  // Nome do cliente (cópia para filtros)
  
  // Dados do Serviço
  serviceType: string;                 // 'Troca de Óleo', 'Revisão', 'Pneus', etc
  serviceValue: number;                // Valor TOTAL do serviço (R$)
  date: string;                        // Data do serviço (ISO 8601: 2026-04-10T12:00:00Z)
  
  // Controle de Pagamento (CORE DA LÓGICA)
  statusPagamento: 'Pago' | 'Parcial' | 'Pendente';  // Estado do pagamento
  valorPago: number;                   // Quanto foi pago até agora (R$)
  saldoDevedor: number;                // Quanto ainda falta pagar (R$)
  
  // Tipo de Receita
  isRecurringRevenue: boolean;         // true = receita recorrente (mensal)
  
  // Recorrência do Cliente
  recurrenceDays: number;              // Intervalo (29 dias é padrão)
  lastMaintenanceDate?: string;        // Última manutenção realizada
  nextMaintenanceDate?: string;        // Próxima manutenção prevista
  
  // Metadados
  notes?: string;                      // Observações do serviço
  isRecurringRevenue?: boolean;        // Indica receita recorrente
}
```

### Client (Cliente Cadastrado)

```typescript
interface Client {
  id: string;
  name: string;
  bikeModel: string;
  contact: string;                     // WhatsApp
  oilType: string;                     // Tipo de óleo padrão
  oilPrice: number;                    // Preço padrão da troca
  recurrenceDays: number;              // Intervalo padrão (29 dias)
  
  // Status Financeiro
  status: 'OK' | 'WARNING' | 'OVERDUE';
  lastServiceValue?: number;
  statusPagamento?: 'Pago' | 'Parcial' | 'Pendente';
  valorPago?: number;
  saldoDevedor?: number;
}
```

---

## 🔄 ESTADOS DE PAGAMENTO

### Estado 1: PAGO
**Definição:** O cliente pagou 100% do serviço na hora

**Condição:**
```javascript
statusPagamento === 'Pago'
```

**Impacto Financeiro:**
| Métrica | Fórmula | Exemplo |
|---------|---------|---------|
| Receita | serviceValue | Serviço R$ 100 → Receita R$ 100 |
| Contas a Receber | 0 | Nenhuma pendência |
| valorPago | serviceValue | R$ 100 |
| saldoDevedor | 0 | Sem débito |

**Exemplo Prático:**
```
Serviço registrado: Troca de Óleo - R$ 50
Cliente paga na hora
Status: "Pago"
valorPago: 50
saldoDevedor: 0

Dashboard:
- Receita Total: +R$ 50
- Contas a Receber: +R$ 0
```

---

### Estado 2: PARCIAL
**Definição:** O cliente pagou PARTE do serviço; o resto fica em aberto

**Condição:**
```javascript
statusPagamento === 'Parcial' && valorPago > 0 && valorPago < serviceValue
```

**Impacto Financeiro:**
| Métrica | Fórmula | Exemplo |
|---------|---------|---------|
| Receita | valorPago | Serviço R$ 100, pagou R$ 30 → Receita R$ 30 |
| Contas a Receber | serviceValue - valorPago | R$ 100 - R$ 30 = R$ 70 |
| saldoDevedor | serviceValue - valorPago | R$ 70 |

**Exemplo Prático:**
```
Serviço registrado: Revisão - R$ 100
Cliente paga R$ 30 na hora
Status: "Parcial"
valorPago: 30
saldoDevedor: 70

Dashboard:
- Receita Total: +R$ 30 (só o que foi pago)
- Contas a Receber: +R$ 70 (o que ainda falta)

Quando cliente paga mais R$ 40:
- Atualiza valorPago: 70
- Atualiza saldoDevedor: 30
- Receita Total: agora +R$ 70
- Contas a Receber: agora +R$ 30
```

---

### Estado 3: PENDENTE
**Definição:** O cliente NÃO pagou nada; 100% em aberto

**Condição:**
```javascript
statusPagamento === 'Pendente' && valorPago === 0
```

**Impacto Financeiro:**
| Métrica | Fórmula | Exemplo |
|---------|---------|---------|
| Receita | 0 | Nenhum dinheiro entrou |
| Contas a Receber | serviceValue | Serviço R$ 80 → Contas R$ 80 |
| valorPago | 0 | Nada pago |
| saldoDevedor | serviceValue | R$ 80 |

**Exemplo Prático:**
```
Serviço registrado: Pneus - R$ 150
Cliente vai pagar depois (sem data marcada)
Status: "Pendente"
valorPago: 0
saldoDevedor: 150

Dashboard:
- Receita Total: +R$ 0 (não entrou dinheiro)
- Contas a Receber: +R$ 150 (cliente deve)

Quando cliente paga R$ 60:
- Status muda para "Parcial"
- valorPago: 60
- saldoDevedor: 90
- Receita Total: agora +R$ 60
- Contas a Receber: agora +R$ 90
```

---

## 🔀 FLUXOS DE NEGÓCIO

### Fluxo 1: Serviço Pago na Hora

```
CLIENTE ENTRA NA OFICINA
         ↓
[Mecânico registra serviço]
  - Tipo: Troca de Óleo
  - Valor: R$ 50
         ↓
[Cliente paga: R$ 50]
         ↓
[Forma de Pagamento]
  ✓ Status: "Pago"
  ✓ valorPago: 50
  ✓ saldoDevedor: 0
         ↓
[Firebase salva o registro]
         ↓
[Dashboard atualiza em tempo real]
  Receita Total: +R$ 50
  Contas a Receber: +R$ 0
```

---

### Fluxo 2: Serviço com Pagamento de 30% Agora, 70% Depois

```
REGISTRO DO SERVIÇO
         ↓
[Valor total: R$ 100]
[Cliente paga agora: R$ 30]
         ↓
[Status: "Parcial"]
[valorPago: 30]
[saldoDevedor: 70]
         ↓
[Dashboard mostra]
  Receita: R$ 30 (entrou)
  Contas a Receber: R$ 70 (vai entrar)
         ↓
[Cliente volta e paga mais R$ 40]
         ↓
[Editar registro: valorPago = 70]
[saldoDevedor recalcula: 30]
         ↓
[Dashboard atualiza]
  Receita: R$ 70 (agora)
  Contas a Receber: R$ 30 (agora)
         ↓
[Cliente paga os R$ 30 finais]
         ↓
[Status muda para "Pago"]
[valorPago: 100]
[saldoDevedor: 0]
```

---

### Fluxo 3: Serviço Totalmente Pendente (Cliente Não Paga Agora)

```
CLIENTE DIZ: "Passo depois para pagar"
         ↓
[Serviço registrado: R$ 120]
[Status: "Pendente"]
[valorPago: 0]
[saldoDevedor: 120]
         ↓
[Dashboard mostra]
  Receita: R$ 0 (nada entrou)
  Contas a Receber: R$ 120 (cliente deve)
         ↓
[ALERTA: Cliente com débito vence em X dias]
[Sistema envia WhatsApp de cobrança]
         ↓
[Cliente paga: R$ 80]
         ↓
[Editar: Status = "Parcial", valorPago = 80]
[saldoDevedor = 40]
         ↓
[Dashboard atualiza]
  Receita: R$ 80
  Contas a Receber: R$ 40
```

---

## 🧮 CÁLCULOS E FÓRMULAS

### Fórmula Principal: Equação de Pagamento

```javascript
saldoDevedor = serviceValue - valorPago
```

**Válido para todos os estados:**
- **Pago:** 100 - 100 = 0 ✓
- **Parcial:** 100 - 30 = 70 ✓
- **Pendente:** 100 - 0 = 100 ✓

---

### Cálculo 1: Total Recebido (Receita Real)

**Regra:**
```javascript
totalReceita = SOMA(
  todos os serviços onde:
    SE statusPagamento === 'Pago'
      ENTÃO soma serviceValue (valor total)
    SENÃO (Parcial ou Pendente)
      ENTÃO soma valorPago (só o que foi pago)
)
```

**Código Real:**
```typescript
const totalReceita = maintenances.reduce((sum, m) => {
  if (m.statusPagamento === 'Pago') {
    return sum + (m.serviceValue || 0);
  } else if (m.statusPagamento === 'Parcial' || m.statusPagamento === 'Pendente') {
    return sum + (m.valorPago || 0);
  }
  return sum;
}, 0);
```

**Exemplo:**
```
Serviços de hoje:
1. Troca de Óleo (Pago) → serviceValue: 50
2. Revisão (Parcial) → serviceValue: 100, valorPago: 30
3. Pneus (Pendente) → serviceValue: 150, valorPago: 0

Cálculo:
totalReceita = 50 + 30 + 0 = R$ 80

Lógica:
- #1 é PAGO: soma 50 (valor completo) ✓
- #2 é PARCIAL: soma 30 (só o que foi pago) ✓
- #3 é PENDENTE: soma 0 (não foi pago) ✓
```

---

### Cálculo 2: Contas a Receber (O que falta cair)

**Regra:**
```javascript
contasAReceber = SOMA(
  todos os serviços onde statusPagamento === 'Parcial' OU 'Pendente'
    ENTÃO soma saldoDevedor
)
```

**Código Real:**
```typescript
const contasAReceber = maintenances
  .filter(m => m.statusPagamento === 'Parcial' || m.statusPagamento === 'Pendente')
  .reduce((sum, m) => sum + (m.saldoDevedor || 0), 0);
```

**Exemplo:**
```
Serviços de hoje:
1. Troca de Óleo (Pago) → saldoDevedor: 0
2. Revisão (Parcial) → saldoDevedor: 70
3. Pneus (Pendente) → saldoDevedor: 150

Cálculo:
contasAReceber = 0 + 70 + 150 = R$ 220

Lógica:
- #1 é PAGO: NÃO entra no filter (saldoDevedor = 0)
- #2 é PARCIAL: soma 70 (o que ainda falta) ✓
- #3 é PENDENTE: soma 150 (tudo está pendente) ✓
```

---

### Cálculo 3: Receita Recorrente (o que se repete)

**Regra:**
```javascript
recurrentRevenue = SOMA(
  todos os serviços onde isRecurringRevenue === true
    ENTÃO soma valorPago
)
```

**Código Real:**
```typescript
const recurrentRevenue = maintenances
  .filter(m => m.isRecurringRevenue === true)
  .reduce((sum, m) => sum + (m.valorPago || 0), 0);
```

**O que é "recorrente":**
- Trocas de óleo mensais
- Manutenções regulares
- Serviços que o cliente repete

**Exemplo:**
```
Serviços deste mês:
1. Troca de Óleo (isRecurringRevenue: true) → valorPago: 50
2. Revisão (isRecurringRevenue: false) → valorPago: 100
3. Troca de Óleo (isRecurringRevenue: true) → valorPago: 50

Cálculo:
recurrentRevenue = 50 + 50 = R$ 100

Lógica:
- #1: true → soma 50 ✓
- #2: false → não soma
- #3: true → soma 50 ✓
```

---

## 📊 DASHBOARD - ESTATÍSTICAS

### Cards Exibidos no Dashboard

#### Card 1: TOTAL RECEBIDO
```
Título: "💰 Total Recebido"
Subtítulo: "Este mês"
Valor: totalReceita
Fórmula: ↑ (TrendingUp icon)
Cor: Verde (emerald-500)

Mostra: Quanto dinheiro ENTROU no caixa este mês
```

#### Card 2: À RECEBER
```
Título: "⏳ A Receber"
Subtítulo: "Pendências abertas"
Valor: contasAReceber
Fórmula: ⏳ (clock icon)
Cor: Amarelo (amber-500)

Mostra: Quanto AINDA VAI ENTRAR (dívidas em aberto)
```

#### Card 3: RECEITA (MÊS)
```
Título: "Receita (Mês)"
Valor: totalReceita
Ícone: TrendingUp
Cor: Verde

Mostra: Mesmo que "Total Recebido"
```

#### Card 4: RECORRENTE
```
Título: "Recorrente"
Valor: recurrentRevenue
Ícone: RefreshCw (ciclo)
Cor: Laranja (primary)

Mostra: Receita que se repete (mensal)
```

#### Card 5: SERVIÇOS
```
Título: "Serviços"
Valor: servicesCount
Ícone: Wrench
Cor: Azul

Mostra: Total de serviços realizados
```

#### Card 6: GARANTIAS
```
Título: "Garantias"
Valor: activeWarrantiesCount
Ícone: ShieldCheck
Cor: Roxo

Mostra: Garantias ativas
```

### Gráfico: Histórico Mensal

```
Exibe: Quantidade de serviços por mês (últimos 6 meses)
Cor: Laranja (#f2780d)
Período: Nov, Dez, Jan, Fev, Mar, Abr

Utilidade: Visualizar tendência de crescimento/queda
```

---

## 💡 EXEMPLOS PRÁTICOS

### Exemplo Completo: Semana de Maria e seu Gol

**Modelo:** Maria possui um Gol 2010, troca óleo a cada 29 dias.

#### Dia 1 (Segunda-feira)
```
Serviço: Troca de Óleo
Cliente: Maria (Gol 2010)
Valor: R$ 60
Cliente paga na hora em dinheiro

REGISTRO:
✓ statusPagamento: "Pago"
✓ serviceValue: 60
✓ valorPago: 60
✓ saldoDevedor: 0
✓ date: 2026-04-13T10:30:00Z
✓ isRecurringRevenue: true (é recorrente)

DASHBOARD AGORA:
- Total Recebido: R$ 60
- À Receber: R$ 0
- Receita (Mês): R$ 60
- Recorrente: R$ 60
```

#### Dia 15 (Segunda próxima)
```
Serviço: Revisão em Geral
Cliente: Maria
Valor: R$ 200
Cliente diz: "Passo o dinheiro amanhã"

REGISTRO:
✓ statusPagamento: "Pendente"
✓ serviceValue: 200
✓ valorPago: 0
✓ saldoDevedor: 200
✓ isRecurringRevenue: false

DASHBOARD AGORA:
- Total Recebido: R$ 60 (não mudou, ela não pagou)
- À Receber: R$ 200 (NOVO DÉBITO)
- Receita (Mês): R$ 60
- Recorrente: R$ 60
```

#### Dia 16 (Terça)
```
Maria chega com R$ 100 dos R$ 200

EDITAR REGISTRO:
✓ statusPagamento: "Parcial" (mudou de Pendente)
✓ valorPago: 100 (agora pagou isso)
✓ saldoDevedor: 100 (ainda deve isso)

DASHBOARD AGORA:
- Total Recebido: R$ 60 + 100 = R$ 160
- À Receber: R$ 100 (reduziu de 200)
- Receita (Mês): R$ 160
```

#### Dia 20 (Sexta)
```
Maria volta com os R$ 100 restantes

EDITAR REGISTRO:
✓ statusPagamento: "Pago" (finalmente!)
✓ valorPago: 200 (pagamento completo)
✓ saldoDevedor: 0

DASHBOARD FINAL:
- Total Recebido: R$ 60 + 200 = R$ 260
- À Receber: R$ 0 (nada mais pendente de Maria)
- Receita (Mês): R$ 260
```

---

## 🔧 IMPLEMENTAÇÃO TÉCNICA

### 1. Ao Registrar um Novo Serviço

**Função:** `handleSaveClient(clientData)`

```typescript
const handleSaveClient = async (clientData: {
  name: string;
  bikeModel: string;
  contact: string;
  serviceType: string;
  serviceValue: number;
  statusPagamento: 'Pago' | 'Parcial' | 'Pendente';
  valorPago: number;
  isRecurringRevenue?: boolean;
  recurrenceDays?: number;
  notes?: string;
}) => {
  try {
    // 1. Validação
    const whatsapp = clientData.contact.replace(/\D/g, '');
    if (whatsapp.length < 10) {
      toast.error('WhatsApp inválido');
      return;
    }

    // 2. Calcular saldoDevedor (AUTOMATICAMENTE)
    const saldoDevedor = clientData.serviceValue - clientData.valorPago;

    // 3. Criar objeto MaintenanceRecord
    const maintenanceRecord: MaintenanceRecord = {
      id: doc.id,
      clientId: clientId,
      clientName: clientData.name,
      serviceType: clientData.serviceType,
      serviceValue: clientData.serviceValue,
      statusPagamento: clientData.statusPagamento,
      valorPago: clientData.valorPago,
      saldoDevedor: saldoDevedor, // ← CALCULADO
      isRecurringRevenue: clientData.isRecurringRevenue ?? true,
      recurrenceDays: clientData.recurrenceDays ?? 29,
      date: new Date().toISOString(),
      notes: clientData.notes || ''
    };

    // 4. Salvar no Firestore
    await addDoc(collection(db, 'maintenance_records'), maintenanceRecord);

    // 5. Firebase listener atualiza o estado
    // (em tempo real, o Dashboard se atualiza automaticamente)

    toast.success('Serviço registrado com sucesso!');
  } catch (error) {
    toast.error('Erro ao registrar serviço');
  }
};
```

---

### 2. Ao Editar um Serviço (Receber Pagamento Adicional)

**Cenário:** Cliente pagou parcialmente, agora vai pagar mais

```typescript
const handleUpdatePayment = async (recordId: string, newValorPago: number) => {
  try {
    const recordRef = doc(db, 'maintenance_records', recordId);
    const recordSnapshot = await getDoc(recordRef);
    const record = recordSnapshot.data() as MaintenanceRecord;

    // 1. Validar novo valor não pode ser > serviceValue
    if (newValorPago > record.serviceValue) {
      toast.error('Valor não pode ser maior que o serviço');
      return;
    }

    // 2. Calcular novo saldoDevedor
    const newSaldoDevedor = record.serviceValue - newValorPago;

    // 3. Definir novo status automaticamente
    let newStatus: 'Pago' | 'Parcial' | 'Pendente';
    if (newValorPago === 0) {
      newStatus = 'Pendente';
    } else if (newValorPago === record.serviceValue) {
      newStatus = 'Pago';
    } else {
      newStatus = 'Parcial';
    }

    // 4. Atualizar no Firestore
    await updateDoc(recordRef, {
      valorPago: newValorPago,
      saldoDevedor: newSaldoDevedor,
      statusPagamento: newStatus
    });

    // 5. Dashboard atualiza automaticamente via listener
    toast.success('Pagamento atualizado!');
  } catch (error) {
    toast.error('Erro ao atualizar pagamento');
  }
};
```

---

### 3. Cálculo das Estatísticas (useMemo)

**Arquivo:** `src/App.tsx` - linhas ~1420-1460

```typescript
const financialStats = useMemo(() => {
  // ✅ Receita Total (Dinheiro em Caixa)
  const totalReceita = maintenances.reduce((sum, m) => {
    if (m.statusPagamento === 'Pago') {
      // Se é Pago, soma o valor TOTAL do serviço
      return sum + (m.serviceValue || 0);
    } else if (m.statusPagamento === 'Parcial' || m.statusPagamento === 'Pendente') {
      // Se é Parcial ou Pendente, soma APENAS o valorPago
      return sum + (m.valorPago || 0);
    }
    return sum;
  }, 0);

  // ✅ Contas a Receber (O que falta cair)
  const contasAReceber = maintenances
    .filter(m => m.statusPagamento === 'Parcial' || m.statusPagamento === 'Pendente')
    .reduce((sum, m) => sum + (m.saldoDevedor || 0), 0);

  // ✅ Receita Recorrente (o que se repete)
  const recurrentRevenue = maintenances
    .filter(m => m.isRecurringRevenue === true)
    .reduce((sum, m) => sum + (m.valorPago || 0), 0);

  // ✅ Contadores
  const totalClientes = clients.length;
  const totalGarantias = warranties.length;

  // ✅ Despesas
  const totalDespesas = (settings?.expenses || []).reduce(
    (sum, e) => sum + (Number(e.value) || Number(e.valor) || 0), 
    0
  );

  // ✅ Lucro Líquido
  const lucroLiquido = totalReceita - totalDespesas;

  return {
    totalReceita,
    contasAReceber,
    recurrentRevenue,
    totalClientes,
    totalGarantias,
    totalDespesas,
    lucroLiquido
  };
}, [maintenances, clients, warranties, settings?.expenses]);
```

---

### 4. Renderização no Dashboard

```tsx
{/* Card: Total Recebido */}
<div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20">
  <p className="text-[9px] font-bold text-emerald-500 uppercase">
    💰 Total Recebido
  </p>
  <div>
    <p className="text-2xl font-bold text-emerald-400">
      R$ {financialStats.totalReceita.toLocaleString('pt-BR', {
        minimumFractionDigits: 2
      })}
    </p>
    <p className="text-[10px] text-emerald-600/70 mt-1">Este mês</p>
  </div>
</div>

{/* Card: À Receber */}
<div className="bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20">
  <p className="text-[9px] font-bold text-amber-500 uppercase">
    ⏳ A Receber
  </p>
  <div>
    <p className="text-2xl font-bold text-amber-400">
      R$ {financialStats.contasAReceber.toLocaleString('pt-BR', {
        minimumFractionDigits: 2
      })}
    </p>
    <p className="text-[10px] text-amber-600/70 mt-1">Pendências abertas</p>
  </div>
</div>
```

---

### 5. Validações Importantes

**Ao registrar ou editar:**

```typescript
// ✓ Validação 1: serviceValue > 0
if (clientData.serviceValue <= 0) {
  throw new Error('Valor do serviço deve ser maior que zero');
}

// ✓ Validação 2: valorPago não pode ser negativo
if (clientData.valorPago < 0) {
  throw new Error('Valor pago não pode ser negativo');
}

// ✓ Validação 3: valorPago ≤ serviceValue
if (clientData.valorPago > clientData.serviceValue) {
  throw new Error('Valor pago não pode exceder valor do serviço');
}

// ✓ Validação 4: Consistência de Status
if (clientData.statusPagamento === 'Pago' && clientData.valorPago !== clientData.serviceValue) {
  throw new Error('Se status é Pago, valorPago deve ser igual a serviceValue');
}

if (clientData.statusPagamento === 'Pendente' && clientData.valorPago !== 0) {
  throw new Error('Se status é Pendente, valorPago deve ser zero');
}
```

---

## 🔗 FLUXO DE DADOS (Firestore)

```
[App.tsx]
   ↓
[Usuário registra serviço via formulário]
   ↓
[handleSaveClient() calcula saldoDevedor]
   ↓
[addDoc() salva em /maintenance_records]
   ↓
[Firebase Realtime Listener dispara]
   ↓
[maintenances state atualiza]
   ↓
[useMemo recalcula financialStats]
   ↓
[Dashboard re-renderiza com novos valores]
   ↓
[Usuário vê mudanças em tempo real]
```

---

## 📱 Estrutura Firestore

```
motofix-ypoc/
├── clients/
│   ├── client_001
│   │   ├── name: "Maria"
│   │   ├── bikeModel: "Gol 2010"
│   │   ├── contact: "11999999999"
│   │   └── recurrenceDays: 29
│   └── client_002
│
├── maintenance_records/
│   ├── record_001
│   │   ├── clientId: "client_001"
│   │   ├── clientName: "Maria"
│   │   ├── serviceValue: 60
│   │   ├── statusPagamento: "Pago"
│   │   ├── valorPago: 60
│   │   ├── saldoDevedor: 0
│   │   ├── date: "2026-04-13T10:30:00Z"
│   │   └── isRecurringRevenue: true
│   │
│   └── record_002
│       ├── clientId: "client_001"
│       ├── clientName: "Maria"
│       ├── serviceValue: 200
│       ├── statusPagamento: "Parcial"
│       ├── valorPago: 100
│       ├── saldoDevedor: 100
│       ├── date: "2026-04-15T15:00:00Z"
│       └── isRecurringRevenue: false
│
└── settings/
    └── config_001
        ├── oilTypes: ["10W30", "10W40", "5W40"]
        ├── expenses: [{name: "Aluguel", valor: 1500}, ...]
        └── warrantyCategories: [...]
```

---

## ✅ CHECKLIST: COMO REPLICAR A LÓGICA

- [ ] **1. Estrutura de Dados:** Criar interfaces MaintenanceRecord com statusPagamento, valorPago, saldoDevedor
- [ ] **2. Formulário:** Adicionar campos statusPagamento e valorPago ao cadastro de serviço
- [ ] **3. Validações:** Implementar validações de serviceValue > 0, valorPago ≤ serviceValue
- [ ] **4. Cálculo:**  Auto-calcular saldoDevedor = serviceValue - valorPago
- [ ] **5. Persistência:** Salvar em Firestore com campos corretos
- [ ] **6. useMemo:** Implementar cálculos de totalReceita, contasAReceber, recurrentRevenue
- [ ] **7. Dashboard:** Exibir 2 cards grandes (Total Recebido + À Receber)
- [ ] **8. Testes Manuais:** Registrar serviços em cada status (Pago, Parcial, Pendente) e validar números

---

## 🎓 RESUMO EXECUTIVO

| Aspecto | Descrição |
|---------|-----------|
| **Objetivo** | Diferenciar serviços pagos, parciais e pendentes |
| **Campos-chave** | statusPagamento, valorPago, saldoDevedor |
| **Cálculo Principal** | saldoDevedor = serviceValue - valorPago |
| **Receita** | Soma de serviceValue (Pago) + valorPago (Parcial/Pendente) |
| **Contas a Receber** | Soma de saldoDevedor (Parcial + Pendente) |
| **Dashboard** | 2 cards grandes mostram Receita e Contas a Receber |
| **Atualizações** | Em tempo real via Firebase Listener |

---

**Documento Versão 2.0 - Refatoração Completa do Sistema de Pagamentos**  
**Última atualização: 10 de abril de 2026**
