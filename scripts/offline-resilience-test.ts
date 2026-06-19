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
const installBrowserEnvironment = (online: boolean) => {
  const fakeWindow = new FakeWindow(new MemoryStorage(sharedStorageValues));
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: online } });
  return fakeWindow;
};

installBrowserEnvironment(false);

const drafts = await import('../src/services/localDrafts.ts');
const queue = await import('../src/services/firestoreOfflineQueue.ts');

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

drafts.clearLocalDraft('test:cash');
drafts.clearLocalDraft('test:expense');
drafts.clearLocalDraft('test:warranty');
assert.equal(drafts.getLocalDraftCount(), 0, 'deve limpar drafts apos conclusao segura');

console.log('Offline resilience tests passed: 7 scenarios.');
