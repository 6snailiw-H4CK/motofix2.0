# Auditoria de Integridade de Dados - MotoFix 2.0

## Objetivo
Avaliar se existe qualquer possibilidade de perda de dados operacionais da oficina, focando apenas em:

- Clientes
- Motos
- Ordens de Serviço
- Garantias
- Receitas
- Despesas
- Histórico de Manutenções
- Caixa

Ignorar marketing, Stripe, assinaturas, WhatsApp, SEO, escalabilidade, performance e UI.

---

## Visão Geral da Arquitetura de Persistência

O sistema usa:

- **Firestore** como fonte de verdade
- **IndexedDB** via cache persistente do Firestore (`persistentLocalCache()` + `persistentMultipleTabManager()`)
- **localStorage** para:
  - fila offline de gravações pendentes
  - drafts de formulários

O Firestore já oferece persistência offline local e aplica um modelo de `last write wins` em conflitos de documento entre múltiplas gravações.

Isso significa que o risco principal não é apenas "usar offline"; o risco grave é o app dizer que salvou antes de confirmar e depois não reconciliar o estado real.

O código crítico de fila está em `src/services/firestoreOfflineQueue.ts`.

---

## Funcionamento da Fila Offline

A fila offline registra gravações pendentes em `localStorage` com chave `motofix:firestore-offline-queue-state`.

Cada operação de escrita passa por:

- `queueFirestoreWrite()` ou `queueFirestoreVoidWrite()`
- `trackWrite()` adiciona um `writeId` à fila
- `WRITE_ACK_TIMEOUT_MS` = 1200 ms
- Se o Firestore não confirmar em 1.2s, a operação é considerada enfileirada
- `useOfflineSyncStatus()` usa `waitForPendingWrites(db)` para detectar o commit
- `confirmPendingWriteCheckpoint()` remove itens confirmados da fila

---

## Drafts Locais

Os drafts são salvos em `localStorage` sob prefixo `motofix:draft:`.

Dados importantes:

- `saveLocalDraft()` persiste rascunhos automaticamente
- `loadLocalDraft()` restaura rascunhos ao reabrir o formulário
- `clearLocalDraft()` remove drafts apenas após salvação bem-sucedida

---

## Principais Problemas Identificados

### 1. Falsa sensação de sucesso após salvar

O usuário pode ver um retorno de sucesso antes do dado ser confirmado no Firestore.

- `queueFirestoreWrite()` retorna `undefined` quando a operação é colocada em fila
- O sistema exibe success toast mesmo quando a escrita ainda não foi confirmada
- Isso é um falso positivo de salvamento

### 2. Operação pode ser removida da fila em caso de erro

No `.catch()` do `writePromise`, o código remove o `writeId` da fila mesmo quando a escrita falha:

```ts
persistedQueue.writes = persistedQueue.writes.filter((write) => write.id !== writeId);
```

- Isso pode causar perda permanente de um dado que ainda não foi sincronizado
- A fila fica inconsistente

### 3. Falta de retry automático

Quando `waitForPendingWrites(db)` falha, o erro é logado, mas não há retry ou fallback.

- Usuário não é notificado de forma robusta
- O dado pode ficar em limbo indefinidamente

### 4. `localStorage` é ponto único de falha para pendências

Se o usuário limpar dados do navegador ou se o storage falhar:

- `motofix:firestore-offline-queue-state` é perdido
- drafts não sincronizados são perdidos
- pendências exclusivamente offline desaparecem

---

## Cenários Específicos Avaliados

### 1. Após clicar em SALVAR

Existe cenário em que sistema mostra sucesso mas o dado não fica gravado?

- **Resposta**: SIM
- Explicação: o sistema pode retornar sucesso antes da validação final do Firestore. Dados pendentes podem permanecer em fila ou serem removidos prematuramente da fila.

### 2. Internet cai durante salvamento

Avaliação por entidade:

- Cliente: NÃO perde imediatamente, mas pode ficar em fila e ser perdido se a fila for limpa.
- O.S.: NÃO perde imediatamente, mas risco semelhante a Cliente.
- Garantia: SIM, há risco de perda parcial/ID não gerado corretamente.
- Receita: NÃO perde imediatamente, mas fica em fila.
- Despesa: NÃO perde imediatamente, mas fica em fila.

### 3. Navegador fecha abruptamente

- Cliente: NÃO, localStorage e IndexedDB preservam a fila.
- O.S.: NÃO, mesmo padrão.
- Garantia: NÃO, mas risco de fila em limbo se não sincronizar depois.
- Receita: NÃO.
- Despesa: NÃO.

### 4. Computador reinicia inesperadamente

- Fila offline: NÃO perde desde que `localStorage` não seja apagado.
- Drafts: NÃO perde enquanto `localStorage` persiste.
- Sincronização: NÃO perde, pois o estado retoma na próxima sessão.

### 5. Sincronização falha

- Dado permanece pendente? Depende: a fila pode reter o writeId ou removê-lo incorretamente.
- Usuário é avisado? Parcialmente, apenas via console e estado de erro mínimo.
- Dado desaparece? Sim, se a fila for perdida ou removida incorretamente.

### 6. Firestore indisponível

- Comportamento: gravações são enfileiradas localmente.
- Persistência: sim, enquanto `localStorage` estiver intacto.
- Recuperação: depende de `waitForPendingWrites()` e de novo acesso ao Firestore.

### 7. Exclusão de cliente

- Histórico, garantias e O.S. são removidos em batch via `writeBatch()` do Firestore.
- Se estiver realmente usando um único batch Firestore válido, esse batch é atômico: ou tudo é apagado, ou nada é apagado.
- O risco de exclusão parcial existe se a operação for dividida em múltiplas etapas ou em vários batches independentes.
- Mesmo assim, para um sistema de oficina, ainda é recomendável evitar hard delete e preferir soft delete.

### 8. Múltiplas abas

- Edição simultânea pode causar sobrescrita
- Firestore aplica last-write-wins
- Não há resolução de conflito de negócio
- localStorage da fila não é realmente compartilhado entre abas

### 9. Limpeza de cache/localStorage

O que pode ser perdido:

- Cliente salvo: não, se já estiver no Firestore
- O.S. salva: não, se já estiver no Firestore
- Garantia salva: não, se já estiver no Firestore
- Receita salva: não, se já estiver no Firestore
- Despesa salva: não, se já estiver no Firestore
- Histórico salvo: não, se já estiver no Firestore
- Draft não sincronizado: SIM, perdido
- Fila offline não sincronizada: SIM, perdida

---

## Risco de perda por entidade

- Cliente: MÉDIO
- Moto: MÉDIO
- O.S.: MÉDIO
- Garantia: MÉDIO-ALTO
- Receita: MÉDIO
- Despesa: MÉDIO
- Histórico: BAIXO

---

## Veredito Final

1. Posso colocar 3 oficinas utilizando o sistema durante 60 dias?

- **Resposta**: SIM, mas com risco significativo e apenas se houver controle rígido das condições de uso.

2. Existe algum cenário onde um lançamento já salvo pode desaparecer?

- **Resposta**: SIM.

3. Existe algum cenário onde um cliente já salvo pode desaparecer?

- **Resposta**: SIM.

4. O risco atual de perda de dados operacionais é:

- **ALTO**

### Ajuste técnico importante

- **Risco de inconsistência e falsa confirmação de salvamento é ALTO.**
- **Risco de perda definitiva depende de o Firestore ter recebido ou não a escrita antes da falha.**
- O Firestore tem persistência offline, mas o app precisa controlar claramente os estados: salvo localmente, pendente e confirmado na nuvem.

### Justificativa técnica

- Há dependência de `localStorage` para pendências offline, sem backup extra.
- A fila de escrita pode ser removida incorretamente em caso de erro.
- A confirmação real de gravação no Firestore não é garantida para o usuário.
- Multi-aba e exclusão em batch expõem cenários de inconsistência.
- Falhas de sincronização não têm retry robusto.

---

## Prioridade de correção

### 1. Corrigir o falso sucesso

Hoje o botão não deveria exibir apenas:

> “Salvo com sucesso”

Ele deveria diferenciar:

```
Salvo localmente. Aguardando sincronização.
```

e depois:

```
Confirmado na nuvem.
```

Esse é o ajuste mais importante.

### 2. Nunca remover da fila quando der erro

Erro não é confirmação. O item precisa continuar na fila com status de falha.

Modelo melhor:

```
{  id: writeId,  entity: "serviceOrder",  operation: "create",  status: "pending" | "syncing" | "confirmed" | "failed",  retryCount: 0,  createdAt,  updatedAt,  lastError}
```

### 3. Criar tela de sincronização

Uma tela simples:

```
Sincronização✅ 18 itens confirmados⏳ 2 pendentes⚠️ 1 falhou
```

E permitir:

```
Tentar sincronizar novamente
```

### 4. Trocar hard delete por soft delete

Para cliente, moto, OS, garantia, receita e despesa, usar:

```
deletedAt: serverTimestamp()
deletedBy: userId
status: "deleted"
```

Assim, se alguém excluir errado, dá para recuperar.

### 5. Criar trilha de auditoria

Toda ação importante deveria gerar log:

```
auditLogs/{id}{  entity: "clients",  entityId: "...",  action: "create" | "update" | "delete" | "restore",  before,  after,  userId,  createdAt}
```

Isso protege muito o sistema quando entrar cliente real.

### 6. Backup diário

Mesmo que seja simples no começo: exportar clientes, motos, OS, garantias, receitas e despesas para JSON/CSV diariamente.

O objetivo não é sofisticação. É ter como recuperar se algo der errado no piloto.
