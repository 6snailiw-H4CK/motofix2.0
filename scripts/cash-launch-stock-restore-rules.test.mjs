import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'motofix-stock-rules-test';
const USER_ID = 'stock-restore-owner';
const PRODUCT_ID = 'product-paid-os';
const LAUNCH_ID = 'launch-paid-os';
const SALE_MOVEMENT_ID = 'stock-op-paid-sale';
const SALE_BATCH_ID = 'stock-batch-paid-sale';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const now = () => new Date().toISOString();

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { host: '127.0.0.1', port: 8080, rules },
});

const makeSeed = async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const expiry = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
    await setDoc(doc(db, 'users', USER_ID), {
      uid: USER_ID,
      role: 'user',
      isActive: true,
      manualAccess: { enabled: true, expiresAt: expiry },
      accessProjection: { allowed: true, source: 'manual', validUntil: expiry },
    });
    await setDoc(doc(db, 'users', USER_ID, 'products', PRODUCT_ID), {
      id: PRODUCT_ID,
      userId: USER_ID,
      sourceCode: 'TESTE',
      description: 'Produto de teste',
      variation: '',
      variations: [],
      ncm: '00000000',
      salePrice: 25,
      trackStock: true,
      minStockQuantity: 0,
      stockQuantity: 2,
      stockMovementId: SALE_MOVEMENT_ID,
      createdAt: now(),
      updatedAt: now(),
    });
    await setDoc(doc(db, 'users', USER_ID, 'stock_movements', SALE_MOVEMENT_ID), {
      userId: USER_ID,
      type: 'saida_os',
      batchId: SALE_BATCH_ID,
      note: 'Baixa inicial de teste',
      createdAt: now(),
      productIds: [PRODUCT_ID],
      cashLaunchId: LAUNCH_ID,
      cashLaunchOrderNumber: 'LC-TEST-PAID',
      itemIds: ['item-1'],
      changes: {
        [PRODUCT_ID]: {
          productId: PRODUCT_ID,
          productDescription: 'Produto de teste',
          previousQuantity: 4,
          nextQuantity: 2,
          quantity: 2,
          previousVariations: [],
          nextVariations: [],
        },
      },
    });
    await setDoc(doc(db, 'users', USER_ID, 'cash_launches', LAUNCH_ID), {
      userId: USER_ID,
      orderNumber: 'LC-TEST-PAID',
      clientName: 'Cliente fictício',
      status: 'Finalizado',
      openingDate: '2026-10-31',
      expectedDate: '2026-10-31',
      items: [{ id: 'item-1', productId: PRODUCT_ID, quantity: 2, total: 50 }],
      merchandiseTotal: 50,
      servicesTotal: 0,
      discountTotal: 0,
      total: 50,
      statusPagamento: 'Pago',
      valorPago: 50,
      saldoDevedor: 0,
      paidAt: now(),
      invoiced: true,
      paymentMethod: 'Pix',
      accountingVersion: 1,
      paymentEntries: [{ id: 'receipt-1', amount: 50, method: 'Pix', receivedAt: now() }],
      stockDeducted: true,
      stockDeductedAt: now(),
      stockMovementBatchId: SALE_BATCH_ID,
      stockMovementId: SALE_MOVEMENT_ID,
      stockShortageItems: [],
      createdAt: now(),
      updatedAt: now(),
    });
  });
};

const firestore = testEnv.authenticatedContext(USER_ID).firestore();
const productRef = doc(firestore, 'users', USER_ID, 'products', PRODUCT_ID);
const launchRef = doc(firestore, 'users', USER_ID, 'cash_launches', LAUNCH_ID);

const assertPermissionDenied = async (operation, description) => {
  try {
    await operation();
  } catch (error) {
    if (error?.code === 'permission-denied') return;
    throw error;
  }
  assert.fail(description);
};

const writeReversal = async ({ softDelete = false } = {}) => {
  const movementId = `stock-op-paid-reversal-${softDelete ? 'delete' : 'cancel'}`;
  const batchId = `stock-batch-paid-reversal-${softDelete ? 'delete' : 'cancel'}`;
  const timestamp = now();
  const movementRef = doc(firestore, 'users', USER_ID, 'stock_movements', movementId);
  await runTransaction(firestore, async (transaction) => {
    const [productSnapshot, launchSnapshot, saleSnapshot] = await Promise.all([
      transaction.get(productRef),
      transaction.get(launchRef),
      transaction.get(doc(firestore, 'users', USER_ID, 'stock_movements', SALE_MOVEMENT_ID)),
    ]);
    assert.ok(productSnapshot.exists());
    assert.ok(launchSnapshot.exists());
    assert.ok(saleSnapshot.exists());
    const product = productSnapshot.data();
    const launch = launchSnapshot.data();
    assert.equal(launch.stockDeducted, true);
    assert.equal(launch.stockMovementId, SALE_MOVEMENT_ID);
    const nextQuantity = product.stockQuantity + 2;

    transaction.update(productRef, {
      stockQuantity: nextQuantity,
      variations: [],
      stockMovementId: movementId,
      updatedAt: timestamp,
    });
    transaction.set(movementRef, {
      userId: USER_ID,
      type: 'estorno_os',
      batchId,
      note: 'Estorno automático da O.S. de teste',
      createdAt: timestamp,
      productIds: [PRODUCT_ID],
      cashLaunchId: LAUNCH_ID,
      cashLaunchOrderNumber: launch.orderNumber,
      itemIds: ['item-1'],
      changes: {
        [PRODUCT_ID]: {
          productId: PRODUCT_ID,
          productDescription: product.description,
          previousQuantity: product.stockQuantity,
          nextQuantity,
          quantity: 2,
          previousVariations: [],
          nextVariations: [],
        },
      },
    });
    transaction.update(launchRef, {
      ...(softDelete ? {
        deletedAt: timestamp,
        deletedBy: USER_ID,
        deletedReason: 'Teste de exclusão lógica com estorno',
      } : {
        status: 'Cancelado',
        invoiced: false,
        statusPagamento: 'Pendente',
        valorPago: 0,
        saldoDevedor: launch.total,
        paidAt: null,
      }),
      stockDeducted: false,
      stockDeductedAt: null,
      stockMovementBatchId: batchId,
      stockMovementId: movementId,
      updatedAt: timestamp,
    });
  });
};

const failures = [];
const run = async (name, operation) => {
  try {
    await operation();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`FAIL ${name}:`, error);
  }
};

try {
  await makeSeed();
  await run('Rules bloqueiam limpar stockDeducted sem movimento de estorno vinculado', async () => {
    await assertPermissionDenied(
      () => updateDoc(launchRef, {
        status: 'Cancelado',
        invoiced: false,
        statusPagamento: 'Pendente',
        valorPago: 0,
        saldoDevedor: 50,
        paidAt: null,
        stockDeducted: false,
        stockDeductedAt: null,
        stockMovementBatchId: null,
        stockMovementId: null,
        updatedAt: now(),
      }),
      'Rules permitiram cancelar e limpar stockDeducted sem devolver estoque.',
    );
    assert.equal((await getDoc(launchRef)).data().stockDeducted, true);
    assert.equal((await getDoc(productRef)).data().stockQuantity, 2);
  });

  await makeSeed();
  await run('Rules bloqueiam alteração direta de saldo sem movimento atômico', async () => {
    await assertPermissionDenied(
      () => updateDoc(productRef, { stockQuantity: 4, updatedAt: now() }),
      'Rules permitiram alterar o saldo de estoque sem registrar movimento.',
    );
    await assertPermissionDenied(
      () => updateDoc(productRef, { stockQuantity: -1, updatedAt: now() }),
      'Rules permitiram saldo negativo em gravação direta.',
    );
    assert.equal((await getDoc(productRef)).data().stockQuantity, 2);
  });

  await makeSeed();
  await run('Rules aceitam cancelamento pago somente com estorno exato e preservam o histórico', async () => {
    await writeReversal();
    const [product, launch, movement] = await Promise.all([
      getDoc(productRef),
      getDoc(launchRef),
      getDoc(doc(firestore, 'users', USER_ID, 'stock_movements', 'stock-op-paid-reversal-cancel')),
    ]);
    assert.equal(product.data().stockQuantity, 4);
    assert.equal(launch.data().status, 'Cancelado');
    assert.equal(launch.data().stockDeducted, false);
    assert.equal(launch.data().invoiced, false);
    assert.equal(launch.data().statusPagamento, 'Pendente');
    assert.equal(launch.data().valorPago, 0);
    assert.equal(launch.data().saldoDevedor, 50);
    assert.equal(launch.data().paidAt, null);
    assert.equal(launch.data().paymentEntries.length, 1);
    assert.equal(movement.data().type, 'estorno_os');
    assert.equal(movement.data().changes[PRODUCT_ID].quantity, 2);
  });

  await makeSeed();
  await run('Rules aceitam exclusão lógica com estorno sem reescrever o pagamento histórico', async () => {
    await writeReversal({ softDelete: true });
    const [product, launch] = await Promise.all([getDoc(productRef), getDoc(launchRef)]);
    assert.equal(product.data().stockQuantity, 4);
    assert.equal(launch.data().status, 'Finalizado');
    assert.equal(launch.data().stockDeducted, false);
    assert.equal(typeof launch.data().deletedAt, 'string');
    assert.equal(launch.data().invoiced, true);
    assert.equal(launch.data().valorPago, 50);
    assert.equal(launch.data().paymentEntries.length, 1);
  });

  await makeSeed();
  await run('Rules recusam estorno com quantidade diferente da baixa original', async () => {
    const movementId = 'stock-op-paid-reversal-wrong-quantity';
    const batchId = 'stock-batch-paid-reversal-wrong-quantity';
    const timestamp = now();
    const movementRef = doc(firestore, 'users', USER_ID, 'stock_movements', movementId);
    await assertPermissionDenied(
      () => runTransaction(firestore, async (transaction) => {
        const [productSnapshot, launchSnapshot] = await Promise.all([
          transaction.get(productRef),
          transaction.get(launchRef),
        ]);
        const product = productSnapshot.data();
        const launch = launchSnapshot.data();
        transaction.update(productRef, {
          stockQuantity: product.stockQuantity + 1,
          stockMovementId: movementId,
          updatedAt: timestamp,
        });
        transaction.set(movementRef, {
          userId: USER_ID,
          type: 'estorno_os',
          batchId,
          note: 'Estorno incorreto de teste',
          createdAt: timestamp,
          productIds: [PRODUCT_ID],
          cashLaunchId: LAUNCH_ID,
          cashLaunchOrderNumber: launch.orderNumber,
          itemIds: ['item-1'],
          changes: {
            [PRODUCT_ID]: {
              productId: PRODUCT_ID,
              productDescription: product.description,
              previousQuantity: product.stockQuantity,
              nextQuantity: product.stockQuantity + 1,
              quantity: 1,
              previousVariations: [],
              nextVariations: [],
            },
          },
        });
        transaction.update(launchRef, {
          status: 'Cancelado',
          invoiced: false,
          statusPagamento: 'Pendente',
          valorPago: 0,
          saldoDevedor: launch.total,
          paidAt: null,
          stockDeducted: false,
          stockDeductedAt: null,
          stockMovementBatchId: batchId,
          stockMovementId: movementId,
          updatedAt: timestamp,
        });
      }),
      'Rules aceitaram estorno de uma quantidade diferente da baixada.',
    );
    assert.equal((await getDoc(productRef)).data().stockQuantity, 2);
    assert.equal((await getDoc(launchRef)).data().stockDeducted, true);
  });

  if (failures.length) throw new Error(`Falharam ${failures.length} cenários: ${failures.join('; ')}`);
} finally {
  await testEnv.cleanup();
}
