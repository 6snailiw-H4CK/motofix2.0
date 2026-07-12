import fs from 'fs';
import path from 'path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
const PROJECT_ID = process.env.GCLOUD_PROJECT || firebaseConfig.projectId || 'motofix-stock-test';
const rulesPath = path.resolve('./firestore.rules');

const USER_ID = 'stock-owner-001';
const OTHER_USER_ID = 'stock-other-001';
const PRODUCT_ID = 'produto-teste-estoque';
const LAUNCH_ID = 'cash-launch-stock-001';
const LOW_STOCK_LAUNCH_ID = 'cash-launch-stock-low';

const now = () => new Date().toISOString();

const fail = (message) => {
  throw new Error(message);
};

const productPath = (db) => doc(db, 'users', USER_ID, 'products', PRODUCT_ID);
const launchPath = (db, launchId = LAUNCH_ID) => doc(db, 'users', USER_ID, 'cash_launches', launchId);
const stockMovementsPath = (db) => collection(db, 'users', USER_ID, 'stock_movements');

const makeItem = (quantity) => ({
  id: `item-${quantity}`,
  productId: PRODUCT_ID,
  sourceCode: 'EST-TESTE',
  description: 'Produto teste estoque',
  variation: '',
  ncm: '00000000',
  quantity,
  unitPrice: 25,
  discountValue: 0,
  discountPercent: 0,
  netUnitPrice: 25,
  total: quantity * 25,
  date: '2026-07-12',
  note: '',
});

const userData = (uid) => ({
  uid,
  email: `${uid}@example.com`,
  role: 'user',
  isActive: true,
  createdAt: now(),
  updatedAt: now(),
});

const baseProduct = () => ({
  id: PRODUCT_ID,
  userId: USER_ID,
  sourceCode: 'EST-TESTE',
  description: 'Produto teste estoque',
  variation: '',
  variations: [],
  ncm: '00000000',
  salePrice: 25,
  stockQuantity: 10,
  minStockQuantity: 2,
  trackStock: true,
  importedAt: now(),
  createdAt: now(),
  updatedAt: now(),
});

const baseLaunch = (launchId, quantity) => ({
  userId: USER_ID,
  orderNumber: `LC-STOCK-${launchId}`,
  clientName: 'Cliente estoque',
  status: 'Em Lancamento',
  openingDate: '2026-07-12',
  expectedDate: '2026-07-12',
  items: [makeItem(quantity)],
  merchandiseTotal: quantity * 25,
  servicesTotal: 0,
  discountTotal: 0,
  total: quantity * 25,
  stockDeducted: false,
  stockDeductedAt: null,
  stockMovementBatchId: null,
  createdAt: now(),
  updatedAt: now(),
  deletedAt: null,
  deletedBy: null,
  deletedReason: null,
});

async function setupTestData(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', USER_ID), userData(USER_ID));
    await setDoc(doc(db, 'users', OTHER_USER_ID), userData(OTHER_USER_ID));
    await setDoc(productPath(db), baseProduct());
    await setDoc(launchPath(db), baseLaunch(LAUNCH_ID, 2));
    await setDoc(launchPath(db, LOW_STOCK_LAUNCH_ID), baseLaunch(LOW_STOCK_LAUNCH_ID, 2));
  });
}

async function finalizeLaunch(db, launchId, batchId) {
  await runTransaction(db, async (transaction) => {
    const productRef = productPath(db);
    const launchRef = launchPath(db, launchId);
    const productSnapshot = await transaction.get(productRef);
    const launchSnapshot = await transaction.get(launchRef);

    if (!productSnapshot.exists()) fail('Produto nao encontrado.');
    if (!launchSnapshot.exists()) fail('O.S. nao encontrada.');

    const product = productSnapshot.data();
    const launch = launchSnapshot.data();
    if (launch.stockDeducted === true) return;

    const quantity = launch.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const previousQuantity = Number(product.stockQuantity || 0);
    const nextQuantity = previousQuantity - quantity;
    if (nextQuantity < 0) {
      throw new Error(`Estoque insuficiente: disponivel ${previousQuantity}, solicitado ${quantity}.`);
    }

    const timestamp = now();
    transaction.update(productRef, {
      stockQuantity: nextQuantity,
      updatedAt: timestamp,
    });
    transaction.update(launchRef, {
      status: 'Finalizado',
      stockDeducted: true,
      stockDeductedAt: timestamp,
      stockMovementBatchId: batchId,
      updatedAt: timestamp,
    });
    transaction.set(doc(stockMovementsPath(db), `${batchId}-saida`), {
      userId: USER_ID,
      productId: PRODUCT_ID,
      productDescription: product.description,
      sourceCode: product.sourceCode,
      type: 'saida_os',
      quantity,
      previousQuantity,
      nextQuantity,
      cashLaunchId: launchId,
      cashLaunchOrderNumber: launch.orderNumber,
      itemIds: launch.items.map((item) => item.id),
      batchId,
      note: 'Teste automatizado de baixa de estoque',
      createdAt: timestamp,
    });
  });
}

async function reopenLaunch(db, launchId, batchId, nextStatus = 'Em Lancamento') {
  await runTransaction(db, async (transaction) => {
    const productRef = productPath(db);
    const launchRef = launchPath(db, launchId);
    const productSnapshot = await transaction.get(productRef);
    const launchSnapshot = await transaction.get(launchRef);

    if (!productSnapshot.exists()) fail('Produto nao encontrado para estorno.');
    if (!launchSnapshot.exists()) fail('O.S. nao encontrada para estorno.');

    const product = productSnapshot.data();
    const launch = launchSnapshot.data();
    if (launch.stockDeducted !== true) return;

    const quantity = launch.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const previousQuantity = Number(product.stockQuantity || 0);
    const nextQuantity = previousQuantity + quantity;
    const timestamp = now();

    transaction.update(productRef, {
      stockQuantity: nextQuantity,
      updatedAt: timestamp,
    });
    transaction.update(launchRef, {
      status: nextStatus,
      stockDeducted: false,
      stockDeductedAt: null,
      stockMovementBatchId: null,
      updatedAt: timestamp,
    });
    transaction.set(doc(stockMovementsPath(db), `${batchId}-estorno`), {
      userId: USER_ID,
      productId: PRODUCT_ID,
      productDescription: product.description,
      sourceCode: product.sourceCode,
      type: 'estorno_os',
      quantity,
      previousQuantity,
      nextQuantity,
      cashLaunchId: launchId,
      cashLaunchOrderNumber: launch.orderNumber,
      itemIds: launch.items.map((item) => item.id),
      batchId,
      note: 'Teste automatizado de estorno de estoque',
      createdAt: timestamp,
    });
  });
}

async function assertProductStock(db, expectedStock, label) {
  const snapshot = await getDoc(productPath(db));
  if (!snapshot.exists()) fail(`${label}: produto nao existe.`);
  const stockQuantity = snapshot.data().stockQuantity;
  if (stockQuantity !== expectedStock) {
    fail(`${label}: estoque esperado ${expectedStock}, encontrado ${stockQuantity}.`);
  }
}

async function assertLaunchDeducted(db, launchId, expected, label) {
  const snapshot = await getDoc(launchPath(db, launchId));
  if (!snapshot.exists()) fail(`${label}: O.S. nao existe.`);
  if (snapshot.data().stockDeducted !== expected) {
    fail(`${label}: stockDeducted esperado ${expected}, encontrado ${snapshot.data().stockDeducted}.`);
  }
}

async function assertLaunchStatus(db, launchId, expected, label) {
  const snapshot = await getDoc(launchPath(db, launchId));
  if (!snapshot.exists()) fail(`${label}: O.S. nao existe.`);
  if (snapshot.data().status !== expected) {
    fail(`${label}: status esperado ${expected}, encontrado ${snapshot.data().status}.`);
  }
}

async function countMovements(db) {
  const snapshot = await getDocs(query(stockMovementsPath(db)));
  return snapshot.size;
}

async function runTests() {
  console.log('Iniciando teste automatizado do fluxo de estoque...');
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(rulesPath, 'utf8'),
    },
  });

  try {
    await setupTestData(testEnv);
    const db = testEnv.authenticatedContext(USER_ID).firestore();

    console.log('1) Finalizar O.S. baixa estoque e registra movimento');
    await finalizeLaunch(db, LAUNCH_ID, 'stock-batch-finalizar');
    await assertProductStock(db, 8, 'Finalizacao');
    await assertLaunchDeducted(db, LAUNCH_ID, true, 'Finalizacao');
    if (await countMovements(db) !== 1) fail('Finalizacao: movimento de saida nao foi registrado.');
    console.log('   OK estoque 10 -> 8, O.S. marcada e movimento criado');

    console.log('2) Repetir finalizacao nao baixa estoque duplicado');
    await finalizeLaunch(db, LAUNCH_ID, 'stock-batch-duplicado');
    await assertProductStock(db, 8, 'Finalizacao repetida');
    if (await countMovements(db) !== 1) fail('Finalizacao repetida criou movimento duplicado.');
    console.log('   OK segunda tentativa manteve estoque em 8');

    console.log('3) Reabrir O.S. estorna estoque e registra estorno');
    await reopenLaunch(db, LAUNCH_ID, 'stock-batch-reabrir');
    await assertProductStock(db, 10, 'Reabertura');
    await assertLaunchDeducted(db, LAUNCH_ID, false, 'Reabertura');
    if (await countMovements(db) !== 2) fail('Reabertura: movimento de estorno nao foi registrado.');
    console.log('   OK estoque 8 -> 10 e O.S. sem baixa pendente');

    console.log('4) Cancelar O.S. finalizada estorna estoque e registra estorno');
    await finalizeLaunch(db, LAUNCH_ID, 'stock-batch-finalizar-cancelamento');
    await reopenLaunch(db, LAUNCH_ID, 'stock-batch-cancelar', 'Cancelado');
    await assertProductStock(db, 10, 'Cancelamento');
    await assertLaunchDeducted(db, LAUNCH_ID, false, 'Cancelamento');
    await assertLaunchStatus(db, LAUNCH_ID, 'Cancelado', 'Cancelamento');
    if (await countMovements(db) !== 4) fail('Cancelamento: movimento de estorno nao foi registrado.');
    console.log('   OK cancelamento devolveu estoque e marcou O.S. como Cancelado');

    console.log('5) Estoque insuficiente bloqueia finalizacao e preserva dados');
    await updateDoc(productPath(db), { stockQuantity: 1, updatedAt: now() });
    let blocked = false;
    try {
      await finalizeLaunch(db, LOW_STOCK_LAUNCH_ID, 'stock-batch-insuficiente');
    } catch (error) {
      blocked = /Estoque insuficiente/.test(String(error?.message || error));
    }
    if (!blocked) fail('Finalizacao com estoque insuficiente nao foi bloqueada.');
    await assertProductStock(db, 1, 'Estoque insuficiente');
    await assertLaunchDeducted(db, LOW_STOCK_LAUNCH_ID, false, 'Estoque insuficiente');
    console.log('   OK estoque insuficiente foi bloqueado sem alterar O.S.');

    console.log('\nFluxo de estoque validado com sucesso.\n');
  } finally {
    await testEnv.cleanup();
  }
}

runTests().catch((error) => {
  console.error('Erro no teste de estoque:', error);
  process.exit(1);
});
