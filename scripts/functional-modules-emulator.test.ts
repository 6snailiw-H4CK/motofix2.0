import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Module-level functional checks use the real repositories and firestore.rules,
// but only against a dedicated Auth/Firestore Emulator project.
const projectId = 'motofix-functional-modules-test';
Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: 'functional-modules-test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_APP_ID: '1:123456789:web:functional-modules-test',
  VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  VITE_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
});

const { assertFails, initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
const firestore = await import('firebase/firestore');
const firebaseAuth = await import('firebase/auth');
const firebase = await import('../src/firebase.ts');
const network = await import('../src/services/firestoreNetworkControl.ts');

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
});

const now = () => new Date().toISOString();
const dateOnly = () => new Date().toISOString().slice(0, 10);
const tomorrowDate = () => {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
};
const uid = (await firebaseAuth.signInAnonymously(firebase.auth)).user.uid;

// The production queue deliberately fails closed when browser storage cannot be
// read. Supply a tiny in-memory browser storage implementation for this Node
// emulator suite; it is installed only after Firebase Auth has initialized so
// Firebase SDK environment detection continues to use its Node implementation.
const localStorageValues = new Map<string, string>();
const queueDatabaseStores = new Map<string, Map<IDBValidKey, unknown>>();
let queueDatabaseExists = false;
const makeQueueDatabase = () => ({
  objectStoreNames: { contains: (name: string) => queueDatabaseStores.has(name) },
  createObjectStore: (name: string) => {
    if (queueDatabaseStores.has(name)) throw new Error(`Object store already exists: ${name}`);
    queueDatabaseStores.set(name, new Map());
    return {};
  },
  transaction: (storeName: string) => {
    const transaction: {
      oncomplete: ((event?: Event) => void) | null;
      onerror: ((event?: Event) => void) | null;
      onabort: ((event?: Event) => void) | null;
      error: Error | null;
      objectStore: (name: string) => {
        get: (key: IDBValidKey) => { result?: unknown; error?: Error; onsuccess?: (event?: Event) => void; onerror?: (event?: Event) => void };
        put: (value: unknown, key: IDBValidKey) => { result?: IDBValidKey; error?: Error; onsuccess?: (event?: Event) => void; onerror?: (event?: Event) => void };
      };
    } = {
      oncomplete: null,
      onerror: null,
      onabort: null,
      error: null,
      objectStore(name) {
        if (name !== storeName) throw new Error(`Unknown object store: ${name}`);
        const values = queueDatabaseStores.get(name);
        if (!values) throw new Error(`Object store does not exist: ${name}`);
        return {
          get(key) {
            const request: { result?: unknown; error?: Error; onsuccess?: (event?: Event) => void; onerror?: (event?: Event) => void } = {};
            queueMicrotask(() => {
              request.result = values.get(key);
              request.onsuccess?.();
              queueMicrotask(() => transaction.oncomplete?.());
            });
            return request;
          },
          put(value, key) {
            const request: { result?: IDBValidKey; error?: Error; onsuccess?: (event?: Event) => void; onerror?: (event?: Event) => void } = {};
            queueMicrotask(() => {
              values.set(key, value);
              request.result = key;
              request.onsuccess?.();
              queueMicrotask(() => transaction.oncomplete?.());
            });
            return request;
          },
        };
      },
    };
    return transaction;
  },
  close: () => undefined,
});
const queueIndexedDb = {
  databases: async () => queueDatabaseExists ? [{ name: 'motofix-offline-queue' }] : [],
  open: (name: string) => {
    const request: {
      result?: ReturnType<typeof makeQueueDatabase>;
      error?: Error;
      onupgradeneeded?: (event?: IDBVersionChangeEvent) => void;
      onsuccess?: (event?: Event) => void;
      onerror?: (event?: Event) => void;
      onblocked?: (event?: Event) => void;
      transaction?: { abort: () => void };
    } = {};
    queueMicrotask(() => {
      const creating = !queueDatabaseExists;
      queueDatabaseExists = true;
      request.result = makeQueueDatabase();
      if (creating) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  },
} as unknown as IDBFactory;
const testWindow = {
  indexedDB: queueIndexedDb,
  localStorage: {
    getItem: (key: string) => localStorageValues.get(key) ?? null,
    setItem: (key: string, value: string) => { localStorageValues.set(key, String(value)); },
    removeItem: (key: string) => { localStorageValues.delete(key); },
    clear: () => { localStorageValues.clear(); },
    key: (index: number) => Array.from(localStorageValues.keys())[index] ?? null,
    get length() { return localStorageValues.size; },
  },
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: testWindow });

const { cashRegisterRepository } = await import('../src/services/cashRegisterRepository.ts');
const { clientRepository } = await import('../src/services/clientRepository.ts');
const { saveClientWithMaintenance } = await import('../src/services/clientSaveService.ts');
const { appointmentRepository } = await import('../src/services/appointmentRepository.ts');
const { expenseRepository } = await import('../src/services/expenseRepository.ts');
const { maintenanceRepository } = await import('../src/services/maintenanceRepository.ts');
const { productRepository } = await import('../src/services/productRepository.ts');
const { settingsRepository } = await import('../src/services/settingsRepository.ts');
const { warrantyRepository } = await import('../src/services/warrantyRepository.ts');
const { createPaymentEntries } = await import('../src/lib/financialLedger.ts');
const {
  getCashPaidAmount,
  getCashReceivableAmount,
  getMaintenanceReceivableAmount,
  isCashLaunchFinancial,
} = await import('../src/lib/cashPayments.ts');
const { getOpenPayableAmount, sumExpenseSettlements } = await import('../src/lib/financialLedger.ts');
const unique = (prefix: string) => `${prefix}-${randomUUID()}`;
const ref = (name: string, id: string) => firestore.doc(firebase.db, 'users', uid, name, id);
const session = <T,>(operation: () => Promise<T>) => network.withFirestoreNetworkSession(uid, operation);
type TestDocument = {
  id: string;
  type?: string;
  cashLaunchId?: string;
  deletedAt?: string | null;
  status?: string;
  amount?: number;
  [key: string]: unknown;
};
const readDoc = async (name: string, id: string) => session(async () => {
  const snapshot = await firestore.getDoc(ref(name, id));
  return snapshot.exists() ? snapshot.data() : undefined;
});
const readCollection = async (name: string): Promise<TestDocument[]> => session(async () => (
  await firestore.getDocs(firestore.collection(firebase.db, 'users', uid, name))
).docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }) as TestDocument));

const failures: string[] = [];
const run = async (label: string, operation: () => Promise<void>) => {
  try {
    await operation();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures.push(label);
    console.error(`FAIL ${label}:`, error);
  }
};

const testExpiry = firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);
const rulesProfile: Record<string, unknown> = {
  uid,
  email: 'functional-test@example.test',
  displayName: 'MotoFix Functional Test',
  role: 'user',
  isActive: true,
  manualAccess: {
    enabled: true,
    expiresAt: testExpiry,
  },
};
rulesProfile.accessProjection = {
  allowed: true,
  source: 'manual',
  validUntil: testExpiry,
};

const productInput = (sourceCode: string, stockQuantity: number, price = 18.5) => ({
  sourceCode,
  description: `Produto de teste ${sourceCode}`,
  variation: '',
  variations: [],
  ncm: '00000000',
  salePrice: price,
  stockQuantity,
  minStockQuantity: 0,
  trackStock: true,
});

const makeItem = (productId: string, quantity: number, unitPrice: number) => ({
  id: unique('item'),
  productId,
  sourceCode: 'SKU-TESTE',
  description: 'Produto de teste funcional',
  variation: '',
  variationId: '',
  ncm: '00000000',
  quantity,
  unitPrice,
  discountValue: 0,
  discountPercent: 0,
  netUnitPrice: unitPrice,
  total: quantity * unitPrice,
  date: dateOnly(),
  note: '',
});

const makeLaunch = (status: 'Em Lancamento' | 'Pendente', clientId: string, item: ReturnType<typeof makeItem> | null) => {
  const items = item ? [item] : [];
  const merchandiseTotal = items.reduce((sum, row) => sum + row.total, 0);
  return {
    userId: uid,
    orderNumber: unique('OS-TESTE'),
    clientId,
    clientName: 'Cliente fictício MotoFix',
    bikeModel: 'Moto teste 150',
    status,
    openingDate: dateOnly(),
    expectedDate: dateOnly(),
    request: 'Teste funcional isolado',
    servicesExecuted: '',
    observation: 'Dado fictício de teste',
    items,
    merchandiseTotal,
    servicesTotal: 0,
    discountTotal: 0,
    orderDiscountValue: 0,
    orderDiscountPercent: 0,
    total: merchandiseTotal,
    statusPagamento: 'Pendente' as const,
    valorPago: 0,
    saldoDevedor: merchandiseTotal,
    paidAt: null,
    invoiced: false,
    createdAt: now(),
    updatedAt: now(),
  };
};

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await firestore.setDoc(firestore.doc(context.firestore(), 'users', uid), rulesProfile);
  });

  let clientId = '';
  let maintenanceId = '';
  let appointmentId = '';
  let productId = '';
  let draftLaunchId = '';
  let pendingLaunchId = '';
  let warrantyId = '';
  let osTotal = 0;
  let osPaymentHistory: unknown;
  const expenseIds: string[] = [];

  await run('Configurações: grava e relê dados da oficina pelas regras reais', async () => {
    await session(() => settingsRepository.saveConfig(uid, {
      userId: uid,
      businessName: 'Oficina Fictícia - Teste MotoFix',
      businessPhone: '11999990000',
      businessEmail: 'teste@example.test',
      businessWhatsapp: '11999990000',
      businessInstagram: '@moto_teste',
      businessAddress: 'Endereço fictício de teste, 100',
      isProfileComplete: true,
      whatsappTemplate: 'Olá {client}, lembrete de teste para {bike} em {date}.',
      oilTypes: ['Óleo teste 10W30'],
      serviceTypes: ['Revisão de teste'],
      disabledDefaultServiceTypes: ['Troca de óleo'],
      warrantyCategories: ['Garantia de teste'],
      expenses: [{ description: 'Custo de teste', value: 25 }],
      financialGoals: {
        desiredMonthlyProfit: 5000,
        estimatedMonthlyCosts: 2500,
        targetMotosPerMonth: 10,
      },
    }));
    const settings = await readDoc('settings', 'config');
    assert.equal(settings?.businessName, 'Oficina Fictícia - Teste MotoFix');
    assert.equal(settings?.businessPhone, '11999990000');
    assert.equal(settings?.businessEmail, 'teste@example.test');
    assert.equal(settings?.businessWhatsapp, '11999990000');
    assert.equal(settings?.businessInstagram, '@moto_teste');
    assert.deepEqual(settings?.serviceTypes, ['Revisão de teste']);
    assert.deepEqual(settings?.oilTypes, ['Óleo teste 10W30']);
    assert.deepEqual(settings?.disabledDefaultServiceTypes, ['Troca de óleo']);
    assert.deepEqual(settings?.warrantyCategories, ['Garantia de teste']);
    assert.equal(settings?.whatsappTemplate, 'Olá {client}, lembrete de teste para {bike} em {date}.');
    assert.equal(settings?.isProfileComplete, true);
    assert.deepEqual(settings?.financialGoals, {
      desiredMonthlyProfit: 5000,
      estimatedMonthlyCosts: 2500,
      targetMotosPerMonth: 10,
    });
    await session(() => settingsRepository.saveConfig(uid, {
      financialGoals: {
        desiredMonthlyProfit: 5500,
        estimatedMonthlyCosts: 2800,
        targetMotosPerMonth: 12,
      },
      businessAddress: 'Endereço fictício de teste, 101',
    }));
    const updatedSettings = await readDoc('settings', 'config');
    assert.equal(updatedSettings?.businessAddress, 'Endereço fictício de teste, 101');
    assert.deepEqual(updatedSettings?.financialGoals, {
      desiredMonthlyProfit: 5500,
      estimatedMonthlyCosts: 2800,
      targetMotosPerMonth: 12,
    });
    const rulesDb = testEnv.authenticatedContext(uid).firestore();
    await assertFails(
      firestore.updateDoc(firestore.doc(rulesDb, 'users', uid, 'settings', 'config'), {
        financialGoals: {
          desiredMonthlyProfit: 5500,
          estimatedMonthlyCosts: 2800,
          targetMotosPerMonth: 12,
          admin: true,
        },
      }),
    );
  });

  await run('Clientes e Recorrência: cria cliente com manutenção vinculada, edita, arquiva e restaura ambos', async () => {
    const created = await session(() => saveClientWithMaintenance({
      userId: uid,
      clientData: {
        name: 'Cliente fictício MotoFix',
        bikeModel: 'Moto teste 150',
        oilType: 'Óleo teste 10W30',
        oilPrice: 30,
        contact: '11999990000',
        email: 'cliente-teste@example.test',
        vehiclePlate: 'TESTE01',
        mileageKm: 12345,
        recurrenceDays: 30,
        isRecurringRevenue: true,
        serviceType: 'Revisão teste',
        serviceValue: 120,
        statusPagamento: 'Parcial',
        valorPago: 20,
        notes: 'Recorrência fictícia para validar o fluxo',
      },
      editingClient: null,
      clients: [],
      maintenances: [],
      getStatus: () => 'WARNING',
    }));
    clientId = created.clientId;
    const maintenanceSnapshot = (await readCollection('maintenances')).find(row => row.clientId === clientId);
    assert.ok(maintenanceSnapshot);
    maintenanceId = maintenanceSnapshot.id;
    assert.equal((await readDoc('clients', clientId))?.vehiclePlate, 'TESTE01');
    assert.equal((await readDoc('clients', clientId))?.mileageKm, 12345);
    assert.equal(maintenanceSnapshot?.isRecurringRevenue, true);

    const currentClientData = await readDoc('clients', clientId);
    assert.ok(currentClientData);
    const currentClient = { id: clientId, ...currentClientData } as never;
    const currentMaintenance = { id: maintenanceId, ...maintenanceSnapshot } as never;
    await session(() => saveClientWithMaintenance({
      userId: uid,
      clientData: {
        name: 'Cliente fictício MotoFix editado',
        bikeModel: String(currentClientData.bikeModel),
        oilType: String(currentClientData.oilType),
        oilPrice: Number(currentClientData.oilPrice),
        contact: '11999990001',
        email: String(currentClientData.email),
        vehiclePlate: String(currentClientData.vehiclePlate),
        mileageKm: Number(currentClientData.mileageKm),
        recurrenceDays: Number(currentClientData.recurrenceDays),
        lastMaintenanceDate: String(currentClientData.lastMaintenanceDate),
        isRecurringRevenue: true,
        serviceType: 'Revisão teste',
        serviceValue: 140,
        statusPagamento: 'Parcial',
        valorPago: 40,
        notes: 'Recorrência fictícia para validar o fluxo',
      },
      editingClient: currentClient,
      clients: [currentClient],
      maintenances: [currentMaintenance],
      getStatus: () => 'WARNING',
    }));
    assert.equal((await readDoc('clients', clientId))?.name, 'Cliente fictício MotoFix editado');
    assert.equal((await readDoc('maintenances', maintenanceId))?.serviceValue, 140);
    assert.equal(getMaintenanceReceivableAmount({
      serviceValue: 140,
      statusPagamento: 'Parcial',
      valorPago: 40,
      saldoDevedor: 100,
    }), 100);

    await session(() => clientRepository.update(uid, clientId, {
      email: 'cliente-editado@example.test',
      vehiclePlate: 'TESTE02',
      mileageKm: 12346,
    }));
    await session(() => clientRepository.update(uid, clientId, {
      oilType: 'Óleo teste 20W50',
      oilPrice: 35,
      recurrenceDays: 45,
    }));
    assert.equal((await readDoc('clients', clientId))?.email, 'cliente-editado@example.test');
    assert.equal((await readDoc('clients', clientId))?.vehiclePlate, 'TESTE02');
    assert.equal((await readDoc('clients', clientId))?.mileageKm, 12346);
    assert.equal((await readDoc('clients', clientId))?.oilType, 'Óleo teste 20W50');
    assert.equal((await readDoc('clients', clientId))?.oilPrice, 35);
    assert.equal((await readDoc('clients', clientId))?.recurrenceDays, 45);

    assert.equal(await session(() => clientRepository.removeWithMaintenances(uid, clientId, 'Teste funcional')), 1);
    assert.ok((await readDoc('clients', clientId))?.deletedAt);
    assert.ok((await readDoc('maintenances', maintenanceId))?.deletedAt);
    assert.equal(await session(() => clientRepository.restoreWithMaintenances(uid, clientId)), 1);
    assert.equal((await readDoc('clients', clientId))?.deletedAt, null);
    assert.equal((await readDoc('maintenances', maintenanceId))?.deletedAt, null);
  });

  await run('Agenda: agenda para amanhã, edita, conclui, arquiva e restaura agendamento fictício', async () => {
    appointmentId = await session(() => appointmentRepository.create(uid, {
      userId: uid,
      clientName: 'Cliente fictício MotoFix',
      bikeModel: 'Moto teste 150',
      scheduledDate: `${tomorrowDate()}T14:00:00.000Z`,
      address: 'Endereço fictício de teste, 200',
      serviceRequested: 'Revisão de teste',
      value: 75,
      completed: false,
      createdAt: now(),
    }));
    await session(() => appointmentRepository.update(uid, appointmentId, {
      serviceRequested: 'Revisão de teste editada',
      completed: true,
    }));
    assert.equal((await readDoc('appointments', appointmentId))?.completed, true);
    assert.equal((await readDoc('appointments', appointmentId))?.serviceRequested, 'Revisão de teste editada');
    assert.equal((await readDoc('appointments', appointmentId))?.scheduledDate, `${tomorrowDate()}T14:00:00.000Z`);
    assert.equal((await readDoc('appointments', appointmentId))?.address, 'Endereço fictício de teste, 200');
    await session(() => appointmentRepository.remove(uid, appointmentId, 'Teste funcional'));
    assert.ok((await readDoc('appointments', appointmentId))?.deletedAt);
    await session(() => appointmentRepository.restore(uid, appointmentId));
    assert.equal((await readDoc('appointments', appointmentId))?.deletedAt, null);
  });

  await run('Gastos: registra Pix, débito e crédito, baixa uma obrigação e arquiva/restaura', async () => {
    const settledAt = now();
    const inputs = [
      { method: 'Pix', entries: [{ id: unique('settlement'), amount: 1, method: 'Pix', settledAt }] },
      { method: 'Debito', entries: [{ id: unique('settlement'), amount: 1, method: 'Debito', settledAt }] },
      { method: 'Credito', entries: [] as Array<{ id: string; amount: number; method: string; settledAt: string }> },
    ];
    for (const [index, input] of inputs.entries()) {
      const id = await session(() => expenseRepository.create(uid, {
        userId: uid,
        description: `Despesa fictícia teste ${input.method}`,
        supplier: 'Fornecedor fictício MotoFix',
        note: 'Lançamento fictício para testar meios de pagamento',
        amount: 1,
        paymentMethod: input.method,
        accountingVersion: 1,
        dueDate: input.method === 'Credito' ? dateOnly() : null,
        settlementEntries: input.entries,
        date: dateOnly(),
        createdAt: now(),
      }));
      expenseIds.push(id);
      const persisted = await readDoc('expenses', id);
      assert.equal(persisted?.paymentMethod, input.method);
      assert.equal(persisted?.amount, 1);
      if (index === 2) {
        assert.equal(getOpenPayableAmount(1, persisted?.settlementEntries as Array<{ amount: number }>), 1);
        await session(() => expenseRepository.recordSettlement(uid, id, [
          { id: unique('settlement'), amount: 1, method: 'Pix', settledAt: now() },
        ]));
        const settled = await readDoc('expenses', id);
        assert.equal(sumExpenseSettlements(settled?.settlementEntries as Array<{ amount: number }>), 1);
        assert.equal(getOpenPayableAmount(1, settled?.settlementEntries as Array<{ amount: number }>), 0);
      }
    }
    const target = expenseIds[0];
    await session(() => expenseRepository.remove(uid, target, 'Teste funcional'));
    assert.ok((await readDoc('expenses', target))?.deletedAt);
    await session(() => expenseRepository.restore(uid, target));
    assert.equal((await readDoc('expenses', target))?.deletedAt, null);
  });

  await run('Garantias: cria, edita, arquiva e restaura uma garantia fictícia', async () => {
    const created = await session(() => warrantyRepository.create(uid, {
      userId: uid,
      clientName: 'Cliente fictício MotoFix',
      serviceType: 'Garantia teste',
      serviceDescription: 'Peça fictícia usada somente no teste',
      serviceValue: 50,
      serviceDate: dateOnly(),
      durationMonths: 3,
      expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      clientPhone: '11999990000',
      warrantyNumber: 900001,
      createdAt: now(),
    }));
    warrantyId = created.id;
    await session(() => warrantyRepository.update(uid, warrantyId, {
      serviceDescription: 'Garantia fictícia editada para teste',
      serviceValue: 55,
    }));
    assert.equal((await readDoc('warranties', warrantyId))?.serviceValue, 55);
    await session(() => warrantyRepository.remove(uid, warrantyId, 'Teste funcional'));
    assert.ok((await readDoc('warranties', warrantyId))?.deletedAt);
    await session(() => warrantyRepository.restore(uid, warrantyId));
    assert.equal((await readDoc('warranties', warrantyId))?.deletedAt, null);
  });

  await run('Mercadorias: cria produto fictício com saldo inicial e registra entrada', async () => {
    const sku = unique('SKU');
    productId = `produto-${sku.toLowerCase()}`;
    assert.equal(await session(() => productRepository.save(uid, productInput(sku, 8, 18.5), productId)), productId);
    assert.equal((await readDoc('products', productId))?.stockQuantity, 8);
  });

  await run('Mercadorias: edita preço e saldo por movimento atômico', async () => {
    assert.ok(productId, 'o produto do passo anterior precisa existir');
    const sku = productId.slice('produto-'.length).replace(/^sku-/, 'SKU-');
    await session(() => productRepository.save(uid, {
      ...productInput(sku, 7, 21.75),
      description: 'Produto de teste editado para revisão funcional',
      sourceCode: `COD-${sku.slice(-8)}`,
      ncm: '12345678',
      minStockQuantity: 2,
    }, productId));
    const product = await readDoc('products', productId);
    assert.equal(product?.description, 'Produto de teste editado para revisão funcional');
    assert.equal(product?.sourceCode, `COD-${sku.slice(-8)}`);
    assert.equal(product?.ncm, '12345678');
    assert.equal(product?.salePrice, 21.75);
    assert.equal(product?.stockQuantity, 7);
    assert.equal(product?.minStockQuantity, 2);
    assert.equal(typeof product?.stockMovementId, 'string');
    const movements = await readCollection('stock_movements');
    assert.ok(movements.some((movement) => movement.id === product?.stockMovementId && movement.type === 'ajuste_manual'));

  });

  await run('Mercadorias: cria e atualiza variações com saldo consolidado', async () => {
    const sku = unique('SKU-VAR');
    const variationProductId = `produto-${sku.toLowerCase()}`;
    await session(() => productRepository.save(uid, {
      sourceCode: sku,
      description: `Produto com variações ${sku}`,
      variation: '',
      variations: [
        { id: 'azul', name: 'Azul', salePrice: 12, stockQuantity: 2 },
      ],
      ncm: '87654321',
      salePrice: 12,
      stockQuantity: 2,
      minStockQuantity: 1,
      trackStock: true,
    }, variationProductId));
    let product = await readDoc('products', variationProductId);
    assert.equal(product?.stockQuantity, 2);
    assert.deepEqual((product?.variations as Array<{ id: string; stockQuantity: number }>).map(row => row.stockQuantity), [2]);

    await session(() => productRepository.save(uid, {
      sourceCode: sku,
      description: `Produto com variações ${sku}`,
      variation: '',
      variations: [
        { id: 'azul', name: 'Azul', salePrice: 13, stockQuantity: 4 },
      ],
      ncm: '87654321',
      salePrice: 13,
      stockQuantity: 4,
      minStockQuantity: 1,
      trackStock: true,
    }, variationProductId));
    product = await readDoc('products', variationProductId);
    assert.equal(product?.stockQuantity, 4);
    assert.deepEqual((product?.variations as Array<{ id: string; salePrice: number; stockQuantity: number }>).map(row => [row.salePrice, row.stockQuantity]), [[13, 4]]);
    assert.equal(typeof product?.stockMovementId, 'string');
  });

  let untrackedProductId = '';
  await run('Mercadorias: cria e edita item sem controle de estoque', async () => {
    const sku = unique('SKU-SEM-ESTOQUE');
    untrackedProductId = `produto-${sku.toLowerCase()}`;
    await session(() => productRepository.save(uid, {
      sourceCode: sku,
      description: `Produto sem estoque controlado ${sku}`,
      variation: '',
      variations: [],
      ncm: '00000000',
      salePrice: 9.5,
      stockQuantity: 0,
      minStockQuantity: 0,
      trackStock: false,
    }, untrackedProductId));
    await session(() => productRepository.save(uid, {
      sourceCode: sku,
      description: `Produto sem controle editado ${sku}`,
      variation: '',
      variations: [],
      ncm: '00000000',
      salePrice: 10.5,
      stockQuantity: 0,
      minStockQuantity: 0,
      trackStock: false,
    }, untrackedProductId));
    const product = await readDoc('products', untrackedProductId);
    assert.equal(product?.trackStock, false);
    assert.equal(product?.stockQuantity, 0);
    assert.equal(product?.salePrice, 10.5);
  });

  await run('Mercadorias: arquiva e restaura sem apagar o histórico de estoque', async () => {
    assert.ok(productId, 'o produto do passo anterior precisa existir');
    await session(() => productRepository.delete(uid, productId, 'Teste funcional'));
    assert.ok((await readDoc('products', productId))?.deletedAt);
    await session(() => productRepository.restore(uid, productId));
    assert.equal((await readDoc('products', productId))?.deletedAt, null);
  });

  await run('Ordem de Serviço: abre rascunho fictício', async () => {
    const initial = makeLaunch('Em Lancamento', clientId, null);
    const created = await session(() => cashRegisterRepository.create(uid, initial));
    draftLaunchId = created.id!;
    assert.ok(draftLaunchId);
    assert.equal((await readDoc('cash_launches', draftLaunchId))?.status, 'Em Lancamento');
  });

  await run('Ordem de Serviço: adiciona item, salva pendente e edita o preço', async () => {
    const firstItem = makeItem(productId, 2, 19.5);
    osTotal = firstItem.total;
    await session(() => cashRegisterRepository.update(uid, draftLaunchId, {
      status: 'Pendente',
      items: [firstItem],
      merchandiseTotal: osTotal,
      servicesTotal: 0,
      discountTotal: 0,
      total: osTotal,
      statusPagamento: 'Pendente',
      valorPago: 0,
      saldoDevedor: osTotal,
      updatedAt: now(),
    }));
    assert.equal((await readDoc('cash_launches', draftLaunchId))?.status, 'Pendente');

    const editedItem = { ...firstItem, unitPrice: 21.75, netUnitPrice: 21.75, total: 43.5 };
    osTotal = editedItem.total;
    await session(() => cashRegisterRepository.update(uid, draftLaunchId, {
      items: [editedItem],
      merchandiseTotal: osTotal,
      total: osTotal,
      saldoDevedor: osTotal,
      updatedAt: now(),
    }));
    const beforeBilling = await readDoc('cash_launches', draftLaunchId);
    assert.equal((beforeBilling?.items as Array<{ unitPrice: number }>)[0]?.unitPrice, 21.75);
    assert.equal(beforeBilling?.total, 43.5);
  });

  await run('Ordem de Serviço: fatura em Pix e débito, baixa o estoque uma vez', async () => {
    osTotal = 43.5;
    const receivedAt = now();
    const entries = createPaymentEntries(osTotal, [
      { method: 'Pix', amount: 20 },
      { method: 'Debito', amount: osTotal - 20 },
    ], receivedAt, () => unique('receipt'));
    assert.equal(entries.length, 2);
    const current = await readDoc('cash_launches', draftLaunchId);
    assert.ok(current);
    await session(() => cashRegisterRepository.update(uid, draftLaunchId, {
      ...current,
      status: 'Finalizado',
      statusPagamento: 'Pago',
      valorPago: osTotal,
      saldoDevedor: 0,
      paidAt: receivedAt,
      invoiced: true,
      paymentMethod: 'Pix',
      accountingVersion: 1,
      paymentEntries: entries,
      updatedAt: now(),
    }));

    let launch = await readDoc('cash_launches', draftLaunchId);
    assert.equal(launch?.status, 'Finalizado');
    assert.equal(launch?.statusPagamento, 'Pago');
    assert.equal(launch?.invoiced, true);
    assert.equal((launch?.paymentEntries as unknown[]).length, 2);
    const paymentEntries = launch?.paymentEntries as Array<{ method: string; amount: number }>;
    assert.deepEqual(paymentEntries.map(entry => [entry.method, entry.amount]), [['Pix', 20], ['Debito', 23.5]]);
    assert.equal(getCashPaidAmount(launch as never), 43.5);
    assert.equal(getCashReceivableAmount(launch as never), 0);
    assert.equal(isCashLaunchFinancial(launch as never), true);
    assert.equal((await readDoc('products', productId))?.stockQuantity, 5);
    osPaymentHistory = launch?.paymentEntries;
  });

  await run('Ordem de Serviço: cancela faturada, estorna estoque e preserva recebimentos históricos', async () => {
    const current = await readDoc('cash_launches', draftLaunchId);
    assert.ok(current);
    await session(() => cashRegisterRepository.update(uid, draftLaunchId, {
      ...current,
      status: 'Cancelado',
      statusPagamento: 'Pendente',
      valorPago: 0,
      saldoDevedor: osTotal,
      paidAt: null,
      invoiced: false,
      updatedAt: now(),
    }));
    const launch = await readDoc('cash_launches', draftLaunchId);
    assert.equal(launch?.status, 'Cancelado');
    assert.equal(launch?.statusPagamento, 'Pendente');
    assert.equal(launch?.invoiced, false);
    assert.deepEqual(launch?.paymentEntries, osPaymentHistory, 'o histórico do recebimento deve ser preservado');
    assert.equal(isCashLaunchFinancial(launch as never), false);
    assert.equal(getCashReceivableAmount(launch as never), 0);
    assert.equal((await readDoc('products', productId))?.stockQuantity, 7, 'o estorno deve repor a baixa da O.S.');

    const movements = await readCollection('stock_movements');
    assert.equal(movements.filter(movement => movement.cashLaunchId === draftLaunchId && movement.type === 'saida_os').length, 1);
    assert.equal(movements.filter(movement => movement.cashLaunchId === draftLaunchId && movement.type === 'estorno_os').length, 1);

    await session(() => cashRegisterRepository.update(uid, draftLaunchId, {
      ...launch,
      updatedAt: now(),
    }));
    assert.equal((await readDoc('products', productId))?.stockQuantity, 7, 'repetir cancelamento não pode duplicar o estorno');
    const afterRepeatedCancel = await readCollection('stock_movements');
    assert.equal(afterRepeatedCancel.filter(movement => movement.cashLaunchId === draftLaunchId && movement.type === 'estorno_os').length, 1);
  });

  await run('Ordem de Serviço: arquiva a O.S. cancelada sem excluir o documento', async () => {
    await session(() => cashRegisterRepository.delete(uid, draftLaunchId, 'Teste funcional'));
    assert.ok((await readDoc('cash_launches', draftLaunchId))?.deletedAt);
    await session(() => cashRegisterRepository.restore(uid, draftLaunchId));
    assert.equal((await readDoc('cash_launches', draftLaunchId))?.deletedAt, null);
  });

  await run('Ordem de Serviço: finaliza item sem controle de estoque sem gerar baixa artificial', async () => {
    assert.ok(untrackedProductId);
    const noStockLaunch = await session(() => cashRegisterRepository.create(uid, makeLaunch(
      'Em Lancamento',
      clientId,
      makeItem(untrackedProductId, 1, 10.5),
    )));
    const launchId = noStockLaunch.id!;
    const current = await readDoc('cash_launches', launchId);
    assert.ok(current);
    const receivedAt = now();
    const paymentEntries = createPaymentEntries(10.5, [{ method: 'Pix', amount: 10.5 }], receivedAt, () => unique('receipt'));
    await session(() => cashRegisterRepository.update(uid, launchId, {
      ...current,
      status: 'Finalizado',
      statusPagamento: 'Pago',
      valorPago: 10.5,
      saldoDevedor: 0,
      paidAt: receivedAt,
      invoiced: true,
      paymentMethod: 'Pix',
      paymentEntries,
      accountingVersion: 1,
      updatedAt: now(),
    }));
    const launch = await readDoc('cash_launches', launchId);
    assert.equal(launch?.status, 'Finalizado');
    assert.equal(launch?.stockDeducted, false);
    const movements = await readCollection('stock_movements');
    assert.equal(movements.some(row => row.cashLaunchId === launchId), false);
    await session(() => cashRegisterRepository.update(uid, launchId, {
      ...launch,
      status: 'Cancelado',
      statusPagamento: 'Pendente',
      valorPago: 0,
      saldoDevedor: 10.5,
      paidAt: null,
      invoiced: false,
      updatedAt: now(),
    }));
    assert.equal((await readDoc('cash_launches', launchId))?.status, 'Cancelado');
    assert.equal((await readCollection('stock_movements')).some(row => row.cashLaunchId === launchId), false);
  });

  await run('Pendências e Relatórios: lê os dados persistidos e confere indicadores financeiros/status', async () => {
    const pendingItem = makeItem(productId, 1, 30);
    const pending = makeLaunch('Pendente', clientId, pendingItem);
    const created = await session(() => cashRegisterRepository.create(uid, pending));
    pendingLaunchId = created.id!;
    const maintenance = await readDoc('maintenances', maintenanceId);
    const expenses = await readCollection('expenses');
    const launches = await readCollection('cash_launches');
    const activeLaunches = launches.filter((launch) => !launch.deletedAt);
    assert.equal(activeLaunches.some((launch) => launch.id === pendingLaunchId && launch.status === 'Pendente'), true);
    assert.equal(isCashLaunchFinancial(activeLaunches.find((launch) => launch.id === pendingLaunchId) as never), false);
    assert.equal(getMaintenanceReceivableAmount(maintenance as never), 100);
    assert.equal(expenses.filter((expense) => !expense.deletedAt).length, 3);
    assert.equal(expenses.filter((expense) => !expense.deletedAt).reduce((sum, expense) => sum + Number(expense.amount), 0), 3);

    // Check the same report/receivable primitives used by the report view against
    // the emulator snapshot; canceled and pending orders are not financial sales.
    const reportLaunches = activeLaunches.filter((launch) => isCashLaunchFinancial(launch as never));
    assert.equal(reportLaunches.some((launch) => launch.status === 'Cancelado'), false);
    assert.equal(reportLaunches.some((launch) => launch.status === 'Pendente'), false);
    assert.equal(reportLaunches.length, 0, 'a O.S. cancelada deve sair do relatório e a pendente não deve faturar');
    const pendingCustomers = new Set([maintenance].filter(row => getMaintenanceReceivableAmount(row as never) > 0).map(row => row?.clientId));
    assert.equal(pendingCustomers.size, 1);
    assert.equal(getCashReceivableAmount({
      status: 'Finalizado', total: 100, statusPagamento: 'Parcial', valorPago: 40, saldoDevedor: 60,
    } as never), 60);
  });

  if (failures.length) throw new Error(`Falharam ${failures.length} verificações funcionais: ${failures.join('; ')}`);
} finally {
  await firebaseAuth.signOut(firebase.auth).catch(() => undefined);
  await testEnv.cleanup();
}
