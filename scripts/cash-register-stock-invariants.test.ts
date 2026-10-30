import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Exercise the production repository against the Firestore/Auth emulators.
// Environment values must be set before importing the application's Firebase singleton.
Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: 'stock-invariants-test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'stock-invariants-test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'motofix-stock-invariants-test',
  VITE_FIREBASE_APP_ID: '1:123456789:web:stock-invariants-test',
  VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  VITE_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
});

const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
const firestore = await import('firebase/firestore');
const firebaseAuth = await import('firebase/auth');
const firebase = await import('../src/firebase.ts');
const network = await import('../src/services/firestoreNetworkControl.ts');
const { cashRegisterRepository } = await import('../src/services/cashRegisterRepository.ts');
const { productRepository } = await import('../src/services/productRepository.ts');
const { isCashLaunchFinancial } = await import('../src/lib/cashPayments.ts');

const testEnv = await initializeTestEnvironment({
  projectId: 'motofix-stock-invariants-test',
  // Keep this suite focused on production repository transactions. The current
  // production rules are exercised separately by the rules emulator suites.
  firestore: { rules: `rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /users/{userId}/{document=**} { allow read, write: if request.auth != null && request.auth.uid == userId; } } }` },
});

const now = () => new Date().toISOString();
const userId = (await firebaseAuth.signInAnonymously(firebase.auth)).user.uid;
const docPath = (collectionName: string, id: string) => firestore.doc(
  firebase.db,
  'users',
  userId,
  collectionName,
  id,
);

const makeItem = (productId: string, quantity: number, id = `item-${productId}`) => ({
  id,
  productId,
  sourceCode: productId,
  description: `Produto ${productId}`,
  variation: '',
  variationId: '',
  ncm: '00000000',
  quantity,
  unitPrice: 25,
  discountValue: 0,
  discountPercent: 0,
  netUnitPrice: 25,
  total: quantity * 25,
  date: '2026-10-21',
  note: '',
});

const makeLaunch = (id: string, items: ReturnType<typeof makeItem>[], status: 'Em Lancamento' | 'Finalizado' = 'Em Lancamento') => ({
  userId,
  orderNumber: `TEST-${id}`,
  clientName: 'Cliente de teste',
  status,
  openingDate: '2026-10-21',
  expectedDate: '2026-10-21',
  items,
  merchandiseTotal: items.reduce((sum, item) => sum + item.total, 0),
  servicesTotal: 0,
  discountTotal: 0,
  total: items.reduce((sum, item) => sum + item.total, 0),
  stockDeducted: false,
  stockDeductedAt: null,
  stockMovementBatchId: null,
  stockMovementId: null,
  stockShortageItems: [],
  createdAt: now(),
  updatedAt: now(),
});

const makeProduct = (id: string, stockQuantity: number, trackStock = true) => ({
  id,
  userId,
  sourceCode: id,
  description: `Produto ${id}`,
  variation: '',
  variations: [],
  ncm: '00000000',
  salePrice: 25,
  stockQuantity,
  minStockQuantity: 0,
  trackStock,
  importedAt: now(),
  createdAt: now(),
  updatedAt: now(),
});

const seed = async (products: ReturnType<typeof makeProduct>[], launches: Array<{ id: string; data: ReturnType<typeof makeLaunch> }> = []) => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    const expiresAt = firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await firestore.setDoc(firestore.doc(adminDb, 'users', userId), {
      uid: userId,
      email: `${userId}@example.test`,
      role: 'user',
      isActive: true,
      manualAccess: { enabled: true, expiresAt },
      accessProjection: { allowed: true, source: 'manual', validUntil: expiresAt },
    });
    for (const product of products) {
      await firestore.setDoc(firestore.doc(adminDb, 'users', userId, 'products', product.id), product);
    }
    for (const launch of launches) {
      await firestore.setDoc(firestore.doc(adminDb, 'users', userId, 'cash_launches', launch.id), launch.data);
    }
  });
};

const session = <T,>(operation: () => Promise<T>) => network.withFirestoreNetworkSession(userId, operation);

const readProduct = async (id: string) => session(async () => (await firestore.getDoc(docPath('products', id))).data());
const readLaunch = async (id: string) => session(async () => (await firestore.getDoc(docPath('cash_launches', id))).data());
type TestMovement = { id: string; type?: string; batchId?: string; cashLaunchId?: string };
const readMovements = async (): Promise<TestMovement[]> => session(async () => (await firestore.getDocs(firestore.collection(firebase.db, 'users', userId, 'stock_movements'))).docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() } as TestMovement)));

const failures: string[] = [];
const run = async (name: string, operation: () => Promise<void>) => {
  try {
    await operation();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`FAIL ${name}:`, error);
  }
};

try {
  await run('ajuste de mercadoria abre uma sessão online e lê o saldo atual do servidor', async () => {
    const productId = `product-save-${randomUUID()}`;
    await seed([makeProduct(productId, 3)]);
    const savedId = await productRepository.save(userId, {
      sourceCode: productId,
      description: `Produto ${productId}`,
      variation: '',
      variations: [],
      ncm: '00000000',
      salePrice: 25,
      stockQuantity: 5,
      minStockQuantity: 0,
      trackStock: true,
    }, productId);
    assert.equal(savedId, productId);
    const [product, movements] = await Promise.all([readProduct(productId), readMovements()]);
    assert.equal(product?.stockQuantity, 5);
    assert.equal(movements.length, 1);
    assert.equal(movements[0].type, 'ajuste_manual');
    const movement = movements[0] as TestMovement & { changes?: Record<string, { previousQuantity: number; nextQuantity: number }> };
    assert.equal(movement.changes?.[productId]?.previousQuantity, 3);
    assert.equal(movement.changes?.[productId]?.nextQuantity, 5);
  });

  await run('baixa completa atualiza O.S., produto e movimento uma vez', async () => {
    const productId = `complete-${randomUUID()}`;
    const requestedLaunchId = `complete-${randomUUID()}`;
    await seed([makeProduct(productId, 5)]);
    const saved = await session(() => cashRegisterRepository.create(userId, makeLaunch(requestedLaunchId, [makeItem(productId, 2)], 'Finalizado')));
    const launchId = saved.id!;

    const [product, launch, movements] = await Promise.all([readProduct(productId), readLaunch(launchId), readMovements()]);
    assert.equal(product?.stockQuantity, 3);
    assert.equal(launch?.stockDeducted, true);
    assert.equal(typeof launch?.stockMovementId, 'string');
    assert.equal(movements.length, 1);
    assert.equal(movements[0].id, launch?.stockMovementId);
    assert.equal(movements[0].batchId, launch?.stockMovementBatchId);
    assert.equal(movements[0].cashLaunchId, launchId);
  });

  await run('O.S. sem itens controlados finaliza sem movimento artificial', async () => {
    const productId = `untracked-${randomUUID()}`;
    const requestedLaunchId = `untracked-${randomUUID()}`;
    await seed([makeProduct(productId, 0, false)]);
    const saved = await session(() => cashRegisterRepository.create(userId, makeLaunch(requestedLaunchId, [makeItem(productId, 1)], 'Finalizado')));
    const launchId = saved.id!;

    const [product, launch, movements] = await Promise.all([readProduct(productId), readLaunch(launchId), readMovements()]);
    assert.equal(product?.stockQuantity, 0);
    assert.equal(launch?.stockDeducted, false);
    assert.equal(launch?.stockMovementId, null);
    assert.equal(launch?.stockMovementBatchId, null);
    assert.equal(movements.length, 0);
  });

  await run('baixa parcial persiste a insuficiência e estorna somente o que foi baixado', async () => {
    const availableId = `partial-ok-${randomUUID()}`;
    const shortId = `partial-short-${randomUUID()}`;
    const requestedLaunchId = `partial-${randomUUID()}`;
    await seed([makeProduct(availableId, 5), makeProduct(shortId, 1)]);
    const items = [makeItem(availableId, 2), makeItem(shortId, 3)];
    const saved = await session(() => cashRegisterRepository.create(userId, makeLaunch(requestedLaunchId, items, 'Finalizado')));
    const launchId = saved.id!;

    let [available, short, launch, movements] = await Promise.all([readProduct(availableId), readProduct(shortId), readLaunch(launchId), readMovements()]);
    assert.equal(available?.stockQuantity, 3);
    assert.equal(short?.stockQuantity, 1);
    assert.equal(launch?.stockDeducted, true);
    assert.equal(launch?.stockShortageItems?.length, 1);
    assert.equal(launch?.stockShortageItems?.[0]?.productId, shortId);
    assert.equal(movements.length, 1);

    await session(() => cashRegisterRepository.update(userId, launchId, { ...launch, status: 'Cancelado', updatedAt: now() } as never));
    [available, short, launch, movements] = await Promise.all([readProduct(availableId), readProduct(shortId), readLaunch(launchId), readMovements()]);
    assert.equal(available?.stockQuantity, 5, 'estorno deve devolver apenas duas unidades efetivamente baixadas');
    assert.equal(short?.stockQuantity, 1, 'estorno nao pode devolver as tres unidades que nunca sairam');
    assert.equal(launch?.stockDeducted, false);
    assert.equal(movements.length, 2);
    const reversal = movements.find((movement) => movement.type === 'estorno_os');
    assert.ok(reversal, 'deve existir um movimento de estorno');
    assert.equal(launch?.stockMovementId, reversal.id);

    await session(() => cashRegisterRepository.update(userId, launchId, { status: 'Cancelado', updatedAt: now() }));
    assert.equal((await readProduct(availableId))?.stockQuantity, 5, 'repetir cancelamento nao pode devolver estoque novamente');
    assert.equal((await readMovements()).length, 2, 'repetir cancelamento nao pode criar outro estorno');
  });

  await run('reabrir O.S. parcial devolve somente a baixa, sai dos totais e permite finalizar apos reposicao', async () => {
    const availableId = `reopen-available-${randomUUID()}`;
    const shortId = `reopen-short-${randomUUID()}`;
    const requestedLaunchId = `reopen-partial-${randomUUID()}`;
    await seed([makeProduct(availableId, 5), makeProduct(shortId, 1)]);
    const saved = await session(() => cashRegisterRepository.create(
      userId,
      makeLaunch(requestedLaunchId, [makeItem(availableId, 2), makeItem(shortId, 3)], 'Finalizado'),
    ));
    const launchId = saved.id!;

    let [availableProduct, shortProduct, launch] = await Promise.all([
      readProduct(availableId),
      readProduct(shortId),
      readLaunch(launchId),
    ]);
    assert.equal(availableProduct?.stockQuantity, 3, 'o item com saldo suficiente deve ser baixado');
    assert.equal(shortProduct?.stockQuantity, 1, 'o item que excede o saldo deve permanecer sem baixa');
    assert.equal(launch?.status, 'Finalizado');
    assert.equal(launch?.stockDeducted, true);
    assert.equal(launch?.stockShortageItems?.length, 1);
    assert.equal(isCashLaunchFinancial({ status: 'Finalizado' }), true);

    await session(() => cashRegisterRepository.update(
      userId,
      launchId,
      { ...launch!, status: 'Pendente', updatedAt: now() } as never,
    ));
    [availableProduct, shortProduct, launch] = await Promise.all([
      readProduct(availableId),
      readProduct(shortId),
      readLaunch(launchId),
    ]);
    assert.equal(availableProduct?.stockQuantity, 5, 'reabrir deve devolver o item que realmente saiu');
    assert.equal(shortProduct?.stockQuantity, 1, 'reabrir nao pode devolver o item que nunca saiu');
    assert.equal(launch?.status, 'Pendente', 'a O.S. deve permanecer pendente apos salvar');
    assert.equal(launch?.stockDeducted, false);
    assert.equal(isCashLaunchFinancial({ status: launch!.status }), false, 'O.S. pendente nao deve compor receita financeira');

    await session(() => firestore.updateDoc(docPath('products', shortId), { stockQuantity: 3, updatedAt: now() }));
    await session(() => cashRegisterRepository.update(
      userId,
      launchId,
      { ...launch!, status: 'Finalizado', updatedAt: now() } as never,
    ));
    [availableProduct, shortProduct, launch] = await Promise.all([
      readProduct(availableId),
      readProduct(shortId),
      readLaunch(launchId),
    ]);
    assert.equal(availableProduct?.stockQuantity, 3, 'apos reabrir, a finalizacao deve baixar novamente o item disponivel');
    assert.equal(shortProduct?.stockQuantity, 0, 'apos reposicao, a finalizacao deve baixar o item antes insuficiente');
    assert.equal(launch?.status, 'Finalizado');
    assert.equal(launch?.stockDeducted, true);
    assert.deepEqual(launch?.stockShortageItems, [], 'a insuficiencia deve ser limpa quando a baixa completar');
    assert.equal(isCashLaunchFinancial({ status: launch!.status }), true);

    await session(() => cashRegisterRepository.update(
      userId,
      launchId,
      { ...launch!, status: 'Cancelado', updatedAt: now() } as never,
    ));
    availableProduct = await readProduct(availableId);
    shortProduct = await readProduct(shortId);
    launch = await readLaunch(launchId);
    assert.equal(availableProduct?.stockQuantity, 5, 'cancelar deve devolver o item atendido');
    assert.equal(shortProduct?.stockQuantity, 3, 'cancelar deve devolver o item baixado apos reposicao');
    assert.equal(launch?.status, 'Cancelado');
    assert.equal(launch?.stockDeducted, false);
    assert.equal(isCashLaunchFinancial({ status: 'Cancelado' }), false);
    assert.equal((await readMovements()).length, 4, 'baixa, estorno da reabertura, nova baixa e cancelamento devem ser rastreados');
  });

  await run('produto controlado inexistente bloqueia a finalizacao', async () => {
    const missingId = `missing-${randomUUID()}`;
    const requestedLaunchId = `missing-${randomUUID()}`;
    await seed([]);
    await assert.rejects(
      session(() => cashRegisterRepository.create(userId, makeLaunch(requestedLaunchId, [makeItem(missingId, 1)], 'Finalizado'))),
      /nao encontrado|não encontrado|referencia|referência/i,
    );
    assert.equal((await readMovements()).length, 0);
  });

  await run('item sem referencia de mercadoria bloqueia a finalizacao', async () => {
    const requestedLaunchId = `unlinked-item-${randomUUID()}`;
    await seed([]);
    const unlinkedItem = { ...makeItem('', 1), productId: undefined, description: 'Item sem vinculo' };
    await assert.rejects(
      session(() => cashRegisterRepository.create(userId, makeLaunch(requestedLaunchId, [unlinkedItem], 'Finalizado'))),
      /nao possui uma mercadoria vinculada|não possui uma mercadoria vinculada/i,
    );
    assert.equal((await readMovements()).length, 0);
  });

  await run('finalizacoes concorrentes de uma O.S. pendente nao duplicam a baixa', async () => {
    const productId = `concurrent-${randomUUID()}`;
    const requestedLaunchId = `concurrent-${randomUUID()}`;
    await seed([makeProduct(productId, 5)]);
    const draft = makeLaunch(requestedLaunchId, [makeItem(productId, 2)]);
    const saved = await session(() => cashRegisterRepository.create(userId, draft));
    const launchId = saved.id!;
    const previous = await readLaunch(launchId);
    await session(async () => {
      const finalize = () => cashRegisterRepository.update(userId, launchId, {
        ...draft,
        status: 'Finalizado',
        updatedAt: now(),
      } as never, previous as never);
      const results = await Promise.allSettled([finalize(), finalize()]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    });
    assert.equal((await readProduct(productId))?.stockQuantity, 3);
    assert.equal((await readMovements()).length, 1);
  });

  await run('exclusoes concorrentes de uma O.S. baixada nao duplicam o estorno', async () => {
    const productId = `delete-race-${randomUUID()}`;
    const requestedLaunchId = `delete-race-${randomUUID()}`;
    await seed([makeProduct(productId, 5)]);
    const saved = await session(() => cashRegisterRepository.create(userId, makeLaunch(requestedLaunchId, [makeItem(productId, 2)], 'Finalizado')));
    const launchId = saved.id!;
    const staleLaunch = await readLaunch(launchId);
    await session(async () => {
      const remove = () => cashRegisterRepository.delete(userId, launchId, undefined, { id: launchId, ...staleLaunch } as never);
      const results = await Promise.allSettled([remove(), remove()]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    });
    assert.equal((await readProduct(productId))?.stockQuantity, 5);
    assert.equal((await readMovements()).filter((movement) => movement.type === 'estorno_os').length, 1);
    assert.equal((await readLaunch(launchId))?.stockDeducted, false);
  });

  if (failures.length) throw new Error(`Falharam ${failures.length} invariantes: ${failures.join('; ')}`);
} finally {
  await firebaseAuth.signOut(firebase.auth).catch(() => undefined);
  await testEnv.cleanup();
}
