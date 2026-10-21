import assert from 'node:assert/strict';

class MemoryStorage {
  private readonly values: Map<string, string>;

  constructor(values = new Map<string, string>()) {
    this.values = values;
  }

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

class FakeWindow extends EventTarget {
  public readonly sessionStorage = new MemoryStorage();

  constructor(public readonly localStorage: MemoryStorage) {
    super();
  }
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const sharedStorageValues = new Map<string, string>();
Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || 'offline-test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'motofix-offline-tests.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'motofix-offline-test',
  VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID || '1:123456789:web:offline-test',
  VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
});

const installBrowserEnvironment = (online: boolean) => {
  const fakeWindow = new FakeWindow(new MemoryStorage(sharedStorageValues));
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: online } });
  return fakeWindow;
};

const queueListenerWindow = installBrowserEnvironment(false);

const firebase = await import('../src/firebase.ts');
const drafts = await import('../src/services/localDrafts.ts');
const queue = await import('../src/services/firestoreOfflineQueue.ts');
const networkControl = await import('../src/services/firestoreNetworkControl.ts');

const syncCycleUser = 'offline-sync-cycle-test';
const syncCycleStart = Date.parse('2026-10-20T12:00:00.000Z');
sharedStorageValues.set('motofix:firestore-sync-session:v1', JSON.stringify({
  [syncCycleUser]: new Date(syncCycleStart).toISOString(),
}));
assert.equal(networkControl.isFirestoreSyncDue(
  syncCycleUser,
  syncCycleStart + networkControl.FIRESTORE_SYNC_INTERVAL_MS - 1
), false, 'nao deve iniciar ciclo automatico antes de completar quatro horas');
assert.equal(networkControl.isFirestoreSyncDue(
  syncCycleUser,
  syncCycleStart + networkControl.FIRESTORE_SYNC_INTERVAL_MS
), true, 'deve liberar ciclo automatico ao completar quatro horas');
assert.equal(networkControl.canMarkFirestoreSyncCompleted({
  failedCollections: 0,
  pendingWrites: 0,
  failedWrites: 0,
}), true, 'so deve concluir o ciclo quando leituras e fila estiverem limpas');
assert.equal(networkControl.canMarkFirestoreSyncCompleted({
  failedCollections: 1,
  pendingWrites: 0,
  failedWrites: 0,
}), false, 'nao deve concluir o ciclo com uma colecao que falhou');
assert.equal(networkControl.canMarkFirestoreSyncCompleted({
  failedCollections: 0,
  pendingWrites: 1,
  failedWrites: 0,
}), false, 'nao deve concluir o ciclo com gravacoes pendentes');
assert.equal(networkControl.canMarkFirestoreSyncCompleted({
  failedCollections: 0,
  pendingWrites: 0,
  failedWrites: 1,
}), false, 'nao deve concluir o ciclo com gravacoes recusadas');

drafts.saveLocalDraft('test:cash', 'O.S. em andamento', 'cash-register', {
  clientName: 'Cliente offline',
  items: [{ description: 'Oleo' }],
});
assert.equal(drafts.getLocalDraftCount(), 1, 'deve contar o draft salvo offline');

installBrowserEnvironment(false);
const reopenedDraft = drafts.loadLocalDraft<{ clientName: string }>('test:cash');
assert.equal(reopenedDraft?.data.clientName, 'Cliente offline', 'deve restaurar draft apos reabrir');

drafts.saveLocalDraft('test:expense', 'Gasto em andamento', 'expenses', { amount: '150,00' });
drafts.saveLocalDraft('test:warranty', 'Garantia em andamento', 'warranties', { clientName: 'Maria' });
assert.equal(drafts.getLocalDraftCount(), 3, 'deve manter multiplos drafts offline');

const firstWrite = deferred();
await queue.queueFirestoreVoidWrite(() => firstWrite.promise, 'Teste salvar offline');
assert.equal(queue.getFirestoreOfflineQueueState().pendingWrites, 1, 'deve manter write pendente apos timeout');
assert.ok(sharedStorageValues.get('motofix:firestore-offline-queue-state'), 'deve persistir fila para reabertura');

installBrowserEnvironment(true);
const reconnectCheckpoint = queue.getPendingWriteCheckpoint();
assert.equal(reconnectCheckpoint.length, 1, 'deve recuperar write pendente ao reconectar');
firstWrite.resolve();
await delay(10);
queue.confirmPendingWriteCheckpoint(reconnectCheckpoint);
assert.equal(queue.getFirestoreOfflineQueueState().pendingWrites, 0, 'deve zerar pendencias depois da sincronizacao');

installBrowserEnvironment(false);
const multipleWrites = [deferred(), deferred(), deferred()];
await Promise.all(multipleWrites.map((entry, index) => (
  queue.queueFirestoreVoidWrite(() => entry.promise, `Teste multiplo ${index + 1}`)
)));
assert.equal(queue.getFirestoreOfflineQueueState().pendingWrites, 3, 'deve enfileirar multiplos registros offline');

installBrowserEnvironment(true);
multipleWrites.forEach((entry) => entry.resolve());
await delay(10);
assert.equal(queue.getFirestoreOfflineQueueState().pendingWrites, 0, 'deve sincronizar multiplos registros posteriormente');

const failedWrite = deferred();
const failedPromise = queue.queueFirestoreVoidWrite(() => failedWrite.promise, 'Teste falha sincronizacao');
failedWrite.reject(new Error('permission-denied simulado'));
await assert.rejects(failedPromise, /permission-denied simulado/);
await delay(10);
const failedState = queue.getFirestoreOfflineQueueState();
assert.equal(failedState.pendingWrites, 0, 'falha nao pode ficar presa como pendencia eterna');
assert.ok(failedState.failureCount >= 1, 'deve contabilizar falha de sincronizacao');
assert.match(failedState.lastError || '', /permission-denied simulado/, 'deve preservar mensagem da falha');

const replayableWrite = deferred();
const replayablePromise = queue.queueFirestoreVoidWrite(
  () => replayableWrite.promise,
  'Teste retry seguro',
  queue.createFirestoreReplayDescriptor(
    'set',
    ['users', 'test-user', 'warranties', 'test-warranty'],
    { userId: 'test-user', clientName: 'Cliente de teste' }
  )
);
replayableWrite.reject(new Error('falha corrigivel simulada'));
await assert.rejects(replayablePromise, /falha corrigivel simulada/);
await delay(10);
assert.equal(
  queue.getFailedWrites().find((write) => write.context === 'Teste retry seguro')?.canRetry,
  true,
  'deve identificar descritor persistido como retry seguro'
);

const replayableBatchWrite = deferred();
const replayableBatchPromise = queue.queueFirestoreVoidWrite(
  () => replayableBatchWrite.promise,
  'Teste retry batch seguro',
  queue.createFirestoreBatchReplayDescriptor([
    {
      operation: 'set',
      path: ['users', 'test-user', 'products', 'produto-1'],
      data: { userId: 'test-user', description: 'Produto teste' },
      merge: true,
    },
    {
      operation: 'update',
      path: ['users', 'test-user', 'products', 'produto-2'],
      data: { deletedAt: new Date().toISOString() },
    },
  ])
);
replayableBatchWrite.reject(new Error('falha batch corrigivel simulada'));
await assert.rejects(replayableBatchPromise, /falha batch corrigivel simulada/);
await delay(10);
assert.equal(
  queue.getFailedWrites().find((write) => write.context === 'Teste retry batch seguro')?.canRetry,
  true,
  'deve identificar descritor de batch persistido como retry seguro'
);

await firebase.firestoreOfflineReady;
await queue.firestoreOfflineQueueReady;
assert.equal((await import('../src/services/firestoreNetworkControl.ts')).isFirestoreNetworkEnabled(), false,
  'as operacoes locais nao devem abrir a rede por conta propria');

const { clientRepository } = await import('../src/services/clientRepository.ts');
const { appointmentRepository } = await import('../src/services/appointmentRepository.ts');
const { maintenanceRepository } = await import('../src/services/maintenanceRepository.ts');
const { cashRegisterRepository } = await import('../src/services/cashRegisterRepository.ts');
const { productRepository } = await import('../src/services/productRepository.ts');
const { expenseRepository } = await import('../src/services/expenseRepository.ts');
const { warrantyRepository } = await import('../src/services/warrantyRepository.ts');
const { settingsRepository } = await import('../src/services/settingsRepository.ts');
const firestore = await import('firebase/firestore');
const offlineOwnerId = 'offline-workflow-owner';
const offlineProductId = 'offline-workflow-product';
const offlineUntrackedProductId = 'offline-untracked-product';

await queue.queueFirestoreVoidWrite(
  () => firestore.setDoc(firestore.doc(firebase.db, 'users', offlineOwnerId, 'products', offlineProductId), {
    userId: offlineOwnerId,
    sourceCode: 'OFFLINE-01',
    description: 'Produto de teste offline',
    variation: '',
    variations: [],
    ncm: '00000000',
    salePrice: 50,
    stockQuantity: 10,
    minStockQuantity: 1,
    trackStock: true,
  }),
  'Preparar produto de teste offline',
  queue.createFirestoreReplayDescriptor('set', ['users', offlineOwnerId, 'products', offlineProductId], {
    userId: offlineOwnerId,
    sourceCode: 'OFFLINE-01',
    description: 'Produto de teste offline',
    variation: '',
    variations: [],
    ncm: '00000000',
    salePrice: 50,
    stockQuantity: 10,
    minStockQuantity: 1,
    trackStock: true,
  })
);
await queue.queueFirestoreVoidWrite(
  () => firestore.setDoc(firestore.doc(firebase.db, 'users', offlineOwnerId, 'products', offlineUntrackedProductId), {
    userId: offlineOwnerId,
    sourceCode: 'SERVICO-01',
    description: 'Item sem controle de estoque',
    variation: '',
    variations: [],
    ncm: '00000000',
    salePrice: 80,
    stockQuantity: 0,
    minStockQuantity: 0,
    trackStock: false,
  }),
  'Preparar item sem controle de estoque',
  queue.createFirestoreReplayDescriptor('set', ['users', offlineOwnerId, 'products', offlineUntrackedProductId], {
    userId: offlineOwnerId,
    sourceCode: 'SERVICO-01',
    description: 'Item sem controle de estoque',
    variation: '',
    variations: [],
    ncm: '00000000',
    salePrice: 80,
    stockQuantity: 0,
    minStockQuantity: 0,
    trackStock: false,
  })
);

const clientId = await clientRepository.create(offlineOwnerId, {
  userId: offlineOwnerId,
  name: 'Cliente offline de teste',
  bikeModel: 'Moto teste',
  contact: '11999999999',
  deletedAt: null,
  deletedBy: null,
  deletedReason: null,
});
let clientSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'clients', clientId)
);
assert.equal(clientSnapshot.data()?.name, 'Cliente offline de teste', 'deve criar cliente no cache sem enviar ao servidor');
await clientRepository.remove(offlineOwnerId, clientId, 'Cenario offline');
clientSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'clients', clientId)
);
assert.ok(clientSnapshot.data()?.deletedAt, 'deve arquivar o cliente no cache sem enviar ao servidor');

const recurringClientId = await clientRepository.create(offlineOwnerId, {
  userId: offlineOwnerId,
  name: 'Cliente de recorrencia offline',
  bikeModel: 'Moto recorrente',
  status: 'OK',
  recurrenceDays: 30,
  oilPrice: 90,
  lastMaintenanceDate: '',
  nextMaintenanceDate: '',
});
const recurringWrite = await clientRepository.saveWithMaintenance(
  offlineOwnerId,
  {
    operation: 'update',
    id: recurringClientId,
    data: {
      lastMaintenanceDate: '2026-10-20T12:00:00Z',
      nextMaintenanceDate: '2026-11-19T12:00:00Z',
      status: 'Vencido',
      lastServiceType: 'Troca de óleo',
      lastServiceValue: 90,
      isRecurringRevenue: true,
    },
  },
  {
    operation: 'create',
    data: {
      clientId: recurringClientId,
      clientName: 'Cliente de recorrencia offline',
      bikeModel: 'Moto recorrente',
      date: '2026-10-20T12:00:00Z',
      serviceType: 'Troca de óleo',
      serviceValue: 90,
      isRecurringRevenue: true,
      statusPagamento: 'Pago',
      valorPago: 90,
      saldoDevedor: 0,
      userId: offlineOwnerId,
    },
  },
);
let recurringClientSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'clients', recurringClientId)
);
let recurringMaintenanceSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'maintenances', recurringWrite.maintenanceId)
);
assert.equal(recurringClientSnapshot.data()?.lastServiceValue, 90,
  'deve atualizar o cliente da recorrencia no cache offline');
assert.equal(recurringMaintenanceSnapshot.data()?.serviceValue, 90,
  'deve criar o servico recorrente no cache offline');
assert.equal(recurringMaintenanceSnapshot.data()?.isRecurringRevenue, true,
  'deve preservar o marcador de receita recorrente no cache offline');

await maintenanceRepository.remove(offlineOwnerId, recurringWrite.maintenanceId, 'Cenario offline');
await clientRepository.update(offlineOwnerId, recurringClientId, {
  lastMaintenanceDate: '',
  nextMaintenanceDate: '',
  status: 'OK',
  lastServiceType: '',
  lastServiceValue: 0,
  isRecurringRevenue: false,
});
recurringClientSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'clients', recurringClientId)
);
recurringMaintenanceSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'maintenances', recurringWrite.maintenanceId)
);
assert.ok(recurringMaintenanceSnapshot.data()?.deletedAt,
  'deve arquivar o lancamento recorrente no cache offline');
assert.equal(recurringClientSnapshot.data()?.status, 'OK',
  'deve atualizar o cliente quando o servico recorrente for removido offline');

const expenseId = await expenseRepository.create(offlineOwnerId, {
  userId: offlineOwnerId,
  description: 'Despesa offline de teste',
  amount: 75,
  date: '2026-10-20',
  category: 'Operacional',
});
let expenseSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'expenses', expenseId)
);
assert.equal(expenseSnapshot.data()?.amount, 75, 'deve criar gasto no cache offline');
await expenseRepository.remove(offlineOwnerId, expenseId, 'Cenario offline');
expenseSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'expenses', expenseId)
);
assert.ok(expenseSnapshot.data()?.deletedAt, 'deve arquivar gasto no cache offline');
await expenseRepository.restore(offlineOwnerId, expenseId);
expenseSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'expenses', expenseId)
);
assert.equal(expenseSnapshot.data()?.deletedAt, null, 'deve restaurar gasto no cache offline');

const warrantyResult = await warrantyRepository.create(offlineOwnerId, {
  userId: offlineOwnerId,
  clientName: 'Cliente garantia offline',
  bikeModel: 'Moto garantia',
  description: 'Garantia de teste offline',
  startDate: '2026-10-20',
  endDate: '2026-11-20',
});
const warrantyId = warrantyResult.id;
let warrantySnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'warranties', warrantyId)
);
assert.equal(warrantySnapshot.data()?.clientName, 'Cliente garantia offline',
  'deve criar garantia no cache offline');
await warrantyRepository.update(offlineOwnerId, warrantyId, { status: 'Em analise' });
warrantySnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'warranties', warrantyId)
);
assert.equal(warrantySnapshot.data()?.status, 'Em analise', 'deve atualizar garantia no cache offline');
await warrantyRepository.remove(offlineOwnerId, warrantyId, 'Cenario offline');
warrantySnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'warranties', warrantyId)
);
assert.ok(warrantySnapshot.data()?.deletedAt, 'deve arquivar garantia no cache offline');
await warrantyRepository.restore(offlineOwnerId, warrantyId);
warrantySnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'warranties', warrantyId)
);
assert.equal(warrantySnapshot.data()?.deletedAt, null, 'deve restaurar garantia no cache offline');

await settingsRepository.saveConfig(offlineOwnerId, {
  workshopName: 'Oficina offline de teste',
  offlineTestFlag: true,
});
const settingsSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'settings', 'config')
);
assert.equal(settingsSnapshot.data()?.workshopName, 'Oficina offline de teste',
  'deve salvar configuracoes no cache offline');

const appointmentId = await appointmentRepository.create(offlineOwnerId, {
  userId: offlineOwnerId,
  clientName: 'Cliente offline de teste',
  bikeModel: 'Moto teste',
  scheduledDate: '2026-10-20',
  serviceRequested: 'Revisao',
  completed: false,
});
let appointmentSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'appointments', appointmentId)
);
assert.equal(appointmentSnapshot.data()?.completed, false, 'deve criar agendamento no cache offline');
await appointmentRepository.remove(offlineOwnerId, appointmentId, 'Cenario offline');
appointmentSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'appointments', appointmentId)
);
assert.ok(appointmentSnapshot.data()?.deletedAt, 'deve arquivar agendamento no cache offline');

const productCrudId = await productRepository.save(offlineOwnerId, {
  sourceCode: 'OFFLINE-CRUD-01',
  description: 'Produto CRUD offline',
  variation: '',
  variations: [],
  ncm: '00000000',
  salePrice: 100,
  stockQuantity: 5,
  minStockQuantity: 1,
  trackStock: true,
});
let productCrudSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'products', productCrudId)
);
assert.equal(productCrudSnapshot.data()?.stockQuantity, 5, 'deve criar mercadoria e estoque no cache offline');
assert.ok(productCrudSnapshot.data()?.stockMovementId, 'entrada offline deve registrar o identificador da movimentacao');

await productRepository.save(offlineOwnerId, {
  sourceCode: 'OFFLINE-CRUD-01',
  description: 'Produto CRUD offline atualizado',
  variation: '',
  variations: [],
  ncm: '00000000',
  salePrice: 110,
  stockQuantity: 7,
  minStockQuantity: 1,
  trackStock: true,
}, productCrudId);
productCrudSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'products', productCrudId)
);
assert.equal(productCrudSnapshot.data()?.salePrice, 110, 'deve editar mercadoria no cache offline');
assert.equal(productCrudSnapshot.data()?.stockQuantity, 7, 'ajuste de estoque deve refletir no cache offline');
const productMovementId = productCrudSnapshot.data()?.stockMovementId as string;
assert.ok((await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'stock_movements', productMovementId)
)).exists(), 'ajuste de estoque offline deve criar movimentacao local');

await productRepository.delete(offlineOwnerId, productCrudId, 'Cenario offline');
productCrudSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'products', productCrudId)
);
assert.ok(productCrudSnapshot.data()?.deletedAt, 'deve arquivar mercadoria no cache offline');
await productRepository.restore(offlineOwnerId, productCrudId);
productCrudSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'products', productCrudId)
);
assert.equal(productCrudSnapshot.data()?.deletedAt, null, 'deve restaurar mercadoria no cache offline');

const orderItem = {
  id: 'offline-order-item',
  productId: offlineProductId,
  sourceCode: 'OFFLINE-01',
  description: 'Produto de teste offline',
  ncm: '00000000',
  quantity: 1,
  unitPrice: 50,
  discountValue: 0,
  discountPercent: 0,
  netUnitPrice: 50,
  total: 50,
  date: '2026-10-20',
};
const orderData = {
  orderNumber: 'LC-OFFLINE-TEST',
  clientName: 'Cliente offline de teste',
  bikeModel: 'Moto teste',
  status: 'Pendente' as const,
  openingDate: '2026-10-20',
  expectedDate: '2026-10-21',
  items: [orderItem],
  merchandiseTotal: 50,
  servicesTotal: 0,
  discountTotal: 0,
  total: 50,
  statusPagamento: 'Pendente' as const,
  valorPago: 0,
  saldoDevedor: 50,
  stockDeducted: false,
  userId: offlineOwnerId,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const createdOrder = await cashRegisterRepository.create(offlineOwnerId, orderData);
assert.equal(createdOrder.savedOffline, true, 'deve salvar O.S. pendente como operacao local');
let orderSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'cash_launches', createdOrder.id!)
);
assert.equal(orderSnapshot.data()?.status, 'Pendente', 'O.S. pendente deve aparecer no cache local');

const editedItem = { ...orderItem, quantity: 2, total: 100 };
const savedPendingEdit = await cashRegisterRepository.update(offlineOwnerId, createdOrder.id!, {
  clientName: orderData.clientName,
  bikeModel: orderData.bikeModel,
  openingDate: orderData.openingDate,
  expectedDate: orderData.expectedDate,
  items: [editedItem],
  merchandiseTotal: 100,
  servicesTotal: 0,
  discountTotal: 0,
  total: 100,
  status: 'Pendente',
  statusPagamento: 'Pendente',
  valorPago: 0,
  saldoDevedor: 100,
  updatedAt: new Date().toISOString(),
}, {
  ...orderData,
  id: createdOrder.id!,
} as import('../src/types.ts').CashRegisterLaunch);
assert.equal(savedPendingEdit.savedOffline, true, 'deve salvar uma edicao de O.S. pendente no cache');
orderSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'cash_launches', createdOrder.id!)
);
assert.equal(orderSnapshot.data()?.items?.[0]?.quantity, 2, 'edicao da quantidade deve aparecer no cache local');

const partialOrder = {
  ...orderSnapshot.data(),
  id: createdOrder.id!,
} as import('../src/types.ts').CashRegisterLaunch;
const editableOrderFields = {
  clientName: partialOrder.clientName,
  bikeModel: partialOrder.bikeModel,
  openingDate: partialOrder.openingDate,
  expectedDate: partialOrder.expectedDate,
  items: partialOrder.items,
  merchandiseTotal: partialOrder.merchandiseTotal,
  servicesTotal: partialOrder.servicesTotal,
  discountTotal: partialOrder.discountTotal,
  total: partialOrder.total,
};
const partialResult = await cashRegisterRepository.update(offlineOwnerId, createdOrder.id!, {
  ...editableOrderFields,
  status: 'Pendente',
  statusPagamento: 'Parcial',
  valorPago: 40,
  saldoDevedor: 60,
  updatedAt: new Date().toISOString(),
}, partialOrder);
assert.equal(partialResult.savedOffline, true, 'deve salvar edicao parcial localmente');
orderSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'cash_launches', createdOrder.id!)
);
assert.equal(orderSnapshot.data()?.statusPagamento, 'Parcial', 'pagamento parcial deve aparecer no cache local');

const finalizeData = {
  ...editableOrderFields,
  status: 'Finalizado' as const,
  statusPagamento: 'Pago' as const,
  valorPago: 100,
  saldoDevedor: 0,
  updatedAt: new Date().toISOString(),
};
const finalizeResult = await cashRegisterRepository.update(
  offlineOwnerId,
  createdOrder.id!,
  finalizeData,
  partialOrder
);
assert.equal(finalizeResult.savedOffline, true, 'deve faturar a O.S. no cache offline');
orderSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'cash_launches', createdOrder.id!)
);
assert.equal(orderSnapshot.data()?.status, 'Finalizado', 'O.S. faturada deve aparecer finalizada no cache');
assert.equal(orderSnapshot.data()?.stockDeducted, true, 'faturamento deve registrar a baixa local do estoque');
let productSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'products', offlineProductId)
);
assert.equal(productSnapshot.data()?.stockQuantity, 8, 'faturamento deve baixar duas unidades no cache');

// A segunda tentativa recebe intencionalmente o snapshot antigo da tela. A
// versao otimista no cache local deve prevalecer para evitar baixa duplicada.
await cashRegisterRepository.update(offlineOwnerId, createdOrder.id!, finalizeData, partialOrder);
productSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'products', offlineProductId)
);
assert.equal(productSnapshot.data()?.stockQuantity, 8, 'repetir faturamento com tela desatualizada nao pode baixar estoque duas vezes');

const untrackedOrderItem = {
  ...orderItem,
  id: 'offline-untracked-item',
  productId: offlineUntrackedProductId,
  sourceCode: 'SERVICO-01',
  description: 'Item sem controle de estoque',
  quantity: 1,
  unitPrice: 80,
  netUnitPrice: 80,
  total: 80,
};
const untrackedPending = await cashRegisterRepository.create(offlineOwnerId, {
  ...orderData,
  orderNumber: 'LC-OFFLINE-UNTRACKED',
  clientName: 'Cliente sem baixa de estoque',
  status: 'Pendente',
  items: [untrackedOrderItem],
  merchandiseTotal: 80,
  total: 80,
  statusPagamento: 'Pendente',
  valorPago: 0,
  saldoDevedor: 80,
});
const untrackedPendingSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'cash_launches', untrackedPending.id!)
);
const untrackedPendingLaunch = {
  ...untrackedPendingSnapshot.data(),
  id: untrackedPending.id!,
} as import('../src/types.ts').CashRegisterLaunch;
const untrackedFinalized = await cashRegisterRepository.update(offlineOwnerId, untrackedPending.id!, {
  clientName: untrackedPendingLaunch.clientName,
  bikeModel: untrackedPendingLaunch.bikeModel,
  openingDate: untrackedPendingLaunch.openingDate,
  expectedDate: untrackedPendingLaunch.expectedDate,
  items: untrackedPendingLaunch.items,
  merchandiseTotal: 80,
  servicesTotal: 0,
  discountTotal: 0,
  total: 80,
  status: 'Finalizado',
  statusPagamento: 'Pago',
  valorPago: 80,
  saldoDevedor: 0,
  updatedAt: new Date().toISOString(),
}, untrackedPendingLaunch);
assert.equal(untrackedFinalized.savedOffline, true, 'deve faturar offline itens configurados sem controle de estoque');
const untrackedProductSnapshot = await firestore.getDocFromCache(
  firestore.doc(firebase.db, 'users', offlineOwnerId, 'products', offlineUntrackedProductId)
);
assert.equal(untrackedProductSnapshot.data()?.stockQuantity, 0, 'faturar item sem controle nao deve alterar quantidade de estoque');
assert.equal((await import('../src/services/firestoreNetworkControl.ts')).isFirestoreNetworkEnabled(), false,
  'criar/excluir dados e faturar offline nao deve abrir a rede');

const { initializeApp } = await import('firebase/app');
const observerApp = initializeApp({
  apiKey: 'offline-test-api-key',
  projectId: 'motofix-offline-test',
  appId: '1:123456789:web:offline-observer',
}, 'offline-observer');
const observerDb = firestore.getFirestore(observerApp);
firestore.connectFirestoreEmulator(observerDb, '127.0.0.1', 8080);
const remoteClientRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'clients', clientId);
const remoteRecurringClientRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'clients', recurringClientId);
const remoteRecurringMaintenanceRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'maintenances', recurringWrite.maintenanceId);
const remoteAppointmentRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'appointments', appointmentId);
const remoteOrderRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'cash_launches', createdOrder.id!);
const remoteProductRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'products', offlineProductId);
const remoteUntrackedProductRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'products', offlineUntrackedProductId);
const remoteUntrackedOrderRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'cash_launches', untrackedPending.id!);
const remoteProductCrudRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'products', productCrudId);
const remoteProductMovementRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'stock_movements', productMovementId);
const remoteExpenseRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'expenses', expenseId);
const remoteWarrantyRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'warranties', warrantyId);
const remoteSettingsRef = firestore.doc(observerDb, 'users', offlineOwnerId, 'settings', 'config');
assert.equal((await firestore.getDocFromServer(remoteClientRef)).exists(), false,
  'reconectar o navegador sem iniciar sync nao deve enviar o cliente');
assert.equal((await firestore.getDocFromServer(remoteAppointmentRef)).exists(), false,
  'reconectar o navegador sem iniciar sync nao deve enviar o agendamento');
assert.equal((await firestore.getDocFromServer(remoteOrderRef)).exists(), false,
  'reconectar o navegador sem iniciar sync nao deve enviar a O.S.');
assert.equal((await firestore.getDocFromServer(remoteUntrackedOrderRef)).exists(), false,
  'reconectar o navegador sem iniciar sync nao deve enviar a segunda O.S.');

await networkControl.withFirestoreNetworkSession(offlineOwnerId, async () => {
  assert.equal((await firestore.getDocFromServer(remoteClientRef)).data()?.deletedAt != null, true,
    'sincronizacao manual deve enviar criacao e exclusao do cliente');
  assert.equal((await firestore.getDocFromServer(remoteAppointmentRef)).data()?.deletedAt != null, true,
    'sincronizacao manual deve enviar criacao e exclusao do agendamento');
  const syncedRecurringClient = await firestore.getDocFromServer(remoteRecurringClientRef);
  assert.equal(syncedRecurringClient.data()?.status, 'OK',
    'sincronizacao manual deve enviar a atualizacao do cliente recorrente');
  assert.equal(syncedRecurringClient.data()?.lastMaintenanceDate, '',
    'sincronizacao manual deve enviar a remocao do ultimo servico recorrente');
  const syncedRecurringMaintenance = await firestore.getDocFromServer(remoteRecurringMaintenanceRef);
  assert.equal(syncedRecurringMaintenance.data()?.serviceValue, 90,
    'sincronizacao manual deve enviar o lancamento de recorrencia');
  assert.ok(syncedRecurringMaintenance.data()?.deletedAt,
    'sincronizacao manual deve enviar a exclusao do lancamento recorrente');
  const syncedOrder = await firestore.getDocFromServer(remoteOrderRef);
  assert.equal(syncedOrder.data()?.status, 'Finalizado', 'sincronizacao manual deve enviar a O.S. faturada');
  assert.equal(syncedOrder.data()?.statusPagamento, 'Pago', 'sincronizacao manual deve enviar o pagamento final');
  assert.equal((await firestore.getDocFromServer(remoteProductRef)).data()?.stockQuantity, 8,
    'sincronizacao manual deve enviar a baixa de estoque da O.S.');
  const syncedUntrackedOrder = await firestore.getDocFromServer(remoteUntrackedOrderRef);
  assert.equal(syncedUntrackedOrder.data()?.status, 'Finalizado',
    'sincronizacao manual deve enviar a O.S. faturada com item sem controle de estoque');
  assert.equal((await firestore.getDocFromServer(remoteUntrackedProductRef)).data()?.stockQuantity, 0,
    'sincronizar faturamento sem estoque nao deve alterar o estoque');
  const syncedProductCrud = await firestore.getDocFromServer(remoteProductCrudRef);
  assert.equal(syncedProductCrud.data()?.description, 'Produto CRUD offline atualizado',
    'sincronizacao manual deve enviar a criacao e edicao da mercadoria');
  assert.equal(syncedProductCrud.data()?.salePrice, 110,
    'sincronizacao manual deve enviar o preco atualizado da mercadoria');
  assert.equal(syncedProductCrud.data()?.stockQuantity, 7,
    'sincronizacao manual deve enviar o ajuste de estoque da mercadoria');
  assert.equal(syncedProductCrud.data()?.deletedAt, null,
    'sincronizacao manual deve preservar a restauracao da mercadoria');
  assert.equal((await firestore.getDocFromServer(remoteProductMovementRef)).exists(), true,
    'sincronizacao manual deve enviar a movimentacao de estoque da mercadoria');
  const syncedExpense = await firestore.getDocFromServer(remoteExpenseRef);
  assert.equal(syncedExpense.data()?.amount, 75, 'sincronizacao manual deve enviar o gasto');
  assert.equal(syncedExpense.data()?.deletedAt, null,
    'sincronizacao manual deve preservar a restauracao do gasto');
  const syncedWarranty = await firestore.getDocFromServer(remoteWarrantyRef);
  assert.equal(syncedWarranty.data()?.status, 'Em analise',
    'sincronizacao manual deve enviar a garantia atualizada');
  assert.equal(syncedWarranty.data()?.deletedAt, null,
    'sincronizacao manual deve preservar a restauracao da garantia');
  assert.equal((await firestore.getDocFromServer(remoteSettingsRef)).data()?.offlineTestFlag, true,
    'sincronizacao manual deve enviar configuracoes locais');
});
assert.equal((await import('../src/services/firestoreNetworkControl.ts')).isFirestoreNetworkEnabled(), false,
  'ao terminar a sincronizacao manual o Firestore deve voltar ao modo offline');
assert.equal(queue.getPendingWriteOwners().userIds.includes(offlineOwnerId), false,
  'fila local deve confirmar as escritas do dono depois do ack do servidor');

const recoveryApp = initializeApp({
  apiKey: 'offline-test-api-key',
  projectId: 'motofix-offline-test',
  appId: '1:123456789:web-offline-recovery-device',
}, 'offline-recovery-device');
const recoveryDb = firestore.getFirestore(recoveryApp);
firestore.connectFirestoreEmulator(recoveryDb, '127.0.0.1', 8080);
const recoveryRefs = {
  client: firestore.doc(recoveryDb, 'users', offlineOwnerId, 'clients', recurringClientId),
  maintenance: firestore.doc(recoveryDb, 'users', offlineOwnerId, 'maintenances', recurringWrite.maintenanceId),
  appointment: firestore.doc(recoveryDb, 'users', offlineOwnerId, 'appointments', appointmentId),
  product: firestore.doc(recoveryDb, 'users', offlineOwnerId, 'products', productCrudId),
  order: firestore.doc(recoveryDb, 'users', offlineOwnerId, 'cash_launches', createdOrder.id!),
  expense: firestore.doc(recoveryDb, 'users', offlineOwnerId, 'expenses', expenseId),
  warranty: firestore.doc(recoveryDb, 'users', offlineOwnerId, 'warranties', warrantyId),
  settings: firestore.doc(recoveryDb, 'users', offlineOwnerId, 'settings', 'config'),
};
const restoredServerSnapshots = await Promise.all(
  Object.values(recoveryRefs).map((reference) => firestore.getDocFromServer(reference))
);
assert.ok(restoredServerSnapshots.every((snapshot) => snapshot.exists()),
  'um segundo dispositivo deve conseguir baixar os dados sincronizados do Firebase');
await firestore.disableNetwork(recoveryDb);
const restoredOfflineSnapshots = await Promise.all(
  Object.values(recoveryRefs).map((reference) => firestore.getDocFromCache(reference))
);
assert.ok(restoredOfflineSnapshots.every((snapshot) => snapshot.exists()),
  'depois da carga inicial, o segundo dispositivo deve consultar os dados sem rede');

const masterAdminTargetId = 'offline-master-admin-target';
const masterAdminTimestamp = firestore.Timestamp.fromDate(new Date('2026-10-01T12:00:00.000Z'));
await firestore.setDoc(firestore.doc(observerDb, 'access_requests', masterAdminTargetId), {
  uid: masterAdminTargetId,
  email: 'offline-target@example.test',
  displayName: 'Conta administrativa offline',
  status: 'approved',
  createdAt: masterAdminTimestamp,
});
await firestore.setDoc(firestore.doc(observerDb, 'users', masterAdminTargetId), {
  email: 'offline-target@example.test',
  displayName: 'Conta administrativa offline',
  role: 'user',
  isActive: true,
  manualAccess: { enabled: true, expiresAt: firestore.Timestamp.fromDate(new Date('2027-10-01T12:00:00.000Z')) },
  accessProjection: {
    allowed: true,
    source: 'manual',
    validUntil: firestore.Timestamp.fromDate(new Date('2027-10-01T12:00:00.000Z')),
    evaluatedAt: masterAdminTimestamp,
    reason: 'manual_entitlement',
    policyVersion: 'access-v1',
  },
  createdAt: masterAdminTimestamp,
});
await firestore.setDoc(firestore.doc(observerDb, 'access_decisions', 'offline-master-audit'), {
  actor: 'offline-master-admin-actor',
  targetUid: masterAdminTargetId,
  action: 'approved',
  details: { reason: 'Teste offline', plan: 'Teste', amount: 10, paymentMethod: 'manual', paymentConfirmed: true },
  createdAt: masterAdminTimestamp,
});
await networkControl.withFirestoreNetworkSession(offlineOwnerId, async () => {
  await Promise.all([
    firestore.getDocsFromServer(firestore.query(
      firestore.collection(firebase.db, 'access_requests'),
      firestore.where('status', 'in', ['pending', 'approved', 'blocked']),
    )),
    firestore.getDocFromServer(firestore.doc(firebase.db, 'users', masterAdminTargetId)),
    firestore.getDocsFromServer(firestore.query(
      firestore.collection(firebase.db, 'access_decisions'),
      firestore.where('targetUid', '==', masterAdminTargetId),
    )),
  ]);
});
sharedStorageValues.set('motofix:master-admin-directory-cache:v1', JSON.stringify({
  'offline-master-admin-actor': {
    requestCount: 1,
    cachedAt: '2026-10-20T12:00:00.000Z',
  },
}));
const authCurrentUserDescriptor = Object.getOwnPropertyDescriptor(firebase.auth, 'currentUser');
Object.defineProperty(firebase.auth, 'currentUser', {
  configurable: true,
  writable: true,
  value: {
    uid: 'offline-master-admin-actor',
    stsTokenManager: { accessToken: '' },
    getIdToken: async () => '',
  },
});
const masterAdminService = await import('../src/services/masterAdminService.ts');
const adminFilters = { search: '', status: 'all' as const, role: 'all' as const, pageSize: 50 };
installBrowserEnvironment(false);
const cachedAdminList = await masterAdminService.getMasterAdminUsers(adminFilters, null);
assert.equal(cachedAdminList.dataSource, 'cache', 'Master Admin deve abrir a lista salva localmente sem conexão');
assert.equal(cachedAdminList.users[0]?.uid, masterAdminTargetId, 'cache offline deve mostrar a conta previamente carregada');
const cachedAdminDetail = await masterAdminService.getMasterAdminAccount(masterAdminTargetId);
assert.equal(cachedAdminDetail.dataSource, 'cache', 'Master Admin deve abrir detalhes e histórico salvos localmente');
assert.equal(networkControl.isFirestoreNetworkEnabled(), false, 'leitura offline do Master Admin nao deve abrir a rede');
if (authCurrentUserDescriptor) {
  Object.defineProperty(firebase.auth, 'currentUser', authCurrentUserDescriptor);
}
installBrowserEnvironment(true);

installBrowserEnvironment(false);
let offlineWaitWasCalled = false;
const confirmedWhileOffline = await queue.confirmPendingWriteCheckpointRemotely(
  ['checkpoint-offline'],
  async () => { offlineWaitWasCalled = true; }
);
assert.equal(confirmedWhileOffline, false, 'nao deve sinalizar confirmacao remota sem conexao');
assert.equal(offlineWaitWasCalled, false, 'nao deve iniciar espera remota quando o navegador esta offline');

installBrowserEnvironment(true);
const beforeExternalWrite = JSON.parse(sharedStorageValues.get('motofix:firestore-offline-queue-state') || '{}');
beforeExternalWrite.writes = Array.isArray(beforeExternalWrite.writes) ? beforeExternalWrite.writes : [];
beforeExternalWrite.writes.push({
  id: 'external-tab-write',
  context: 'Escrita de outra aba',
  queuedAt: new Date().toISOString(),
  status: 'pending',
  lastUpdatedAt: new Date().toISOString(),
  retryCount: 0,
});
sharedStorageValues.set('motofix:firestore-offline-queue-state', JSON.stringify(beforeExternalWrite));
const storageEvent = new Event('storage');
Object.defineProperty(storageEvent, 'key', { value: 'motofix:firestore-offline-queue-state' });
queueListenerWindow.dispatchEvent(storageEvent);
assert.ok(
  queue.getPendingWriteCheckpoint().includes('external-tab-write'),
  'deve reaplicar a fila quando outra aba altera o localStorage'
);
queue.confirmPendingWriteCheckpoint(['external-tab-write']);

drafts.clearLocalDraft('test:cash');
drafts.clearLocalDraft('test:expense');
drafts.clearLocalDraft('test:warranty');
assert.equal(drafts.getLocalDraftCount(), 0, 'deve limpar drafts apos conclusao segura');

await firestore.terminate(observerDb);
await firestore.terminate(recoveryDb);
await firestore.terminate(firebase.db);
await (await import('firebase/app')).deleteApp(observerApp);
await (await import('firebase/app')).deleteApp(recoveryApp);

console.log('Offline resilience tests passed: queue recovery, offline CRUD/workflows, manual sync, and second-device restore to cache.');
