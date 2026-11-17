import test from 'node:test';
import assert from 'node:assert/strict';
import { withCompleteBackupStateLock, withLocalStateMutation } from '../src/services/backupLocalStateLock';
import { saveLocalDraft, clearLocalDraft } from '../src/services/localDrafts';
import { upsertLocalCashLaunch, upsertLocalProduct, getLocalCashLaunches, getLocalProducts } from '../src/services/localCashLaunchRepository';

class SerializedLockManager {
  private tail: Promise<void> = Promise.resolve();

  async request<T>(_name: string, _options: unknown, callback: () => T | Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await callback(); } finally { release(); }
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('Web Lock serializa backup con escrituras locais de rascunho, caixa e produtos', async () => {
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key(index: number) { return Array.from(values.keys())[index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  const locks = new SerializedLockManager();
  let appProbeResponded = false;
  const controller = {
    postMessage: (_message: unknown, ports: MessagePort[]) => {
      ports[0].postMessage({ ok: true, protocolVersion: 1 });
      appProbeResponded = true;
    },
  };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { locks, serviceWorker: { controller } },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage, dispatchEvent: () => true },
  });

  try {
    let releaseBackup!: () => void;
    let backupStarted!: () => void;
    const backupReady = new Promise<void>((resolve) => { backupStarted = resolve; });
    const holdBackup = new Promise<void>((resolve) => { releaseBackup = resolve; });
    const backup = withCompleteBackupStateLock(async () => {
      backupStarted();
      await holdBackup;
      return 'encrypted';
    });
    await backupReady;
    assert.equal(appProbeResponded, true, 'Backup exige confirmação do Service Worker antes da leitura.');

    const draftWrite = saveLocalDraft('fixture:form', 'Rascunho de teste', 'clients', { name: 'TESTE' });
    const cashWrite = upsertLocalCashLaunch({ id: 'cash-test', userId: 'fixture' } as never);
    const productWrite = upsertLocalProduct({ id: 'product-test', userId: 'fixture' } as never);
    const clearWrite = clearLocalDraft('other-form');
    await delay(10);
    assert.equal(storage.getItem('motofix:draft:fixture:form'), null);
    assert.equal(getLocalCashLaunches().some((record) => record.id === 'cash-test'), false);
    assert.equal(getLocalProducts().some((record) => record.id === 'product-test'), false);

    releaseBackup();
    assert.equal(await backup, 'encrypted');
    await Promise.all([draftWrite, cashWrite, productWrite, clearWrite]);
    assert.ok(storage.getItem('motofix:draft:fixture:form'));
    assert.equal(getLocalCashLaunches().some((record) => record.id === 'cash-test'), true);
    assert.equal(getLocalProducts().some((record) => record.id === 'product-test'), true);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('backup completo falha de forma fechada sem Web Locks ou sem confirmação do Service Worker', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    await assert.rejects(withCompleteBackupStateLock(async () => true), /não oferece Web Locks/i);
    assert.equal(await withLocalStateMutation(() => 'ordinary-write'), 'ordinary-write');

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        locks: new SerializedLockManager(),
        serviceWorker: { controller: { postMessage: (_message: unknown, ports: MessagePort[]) => ports[0].postMessage({ ok: false }) } },
      },
    });
    await assert.rejects(withCompleteBackupStateLock(async () => true), /não confirmou|atualize as abas/i);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
