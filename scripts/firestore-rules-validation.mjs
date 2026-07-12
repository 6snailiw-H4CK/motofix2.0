import fs from 'fs';
import path from 'path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc } from 'firebase/firestore';

const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
const PROJECT_ID = process.env.GCLOUD_PROJECT || firebaseConfig.projectId || 'motofix-dev';
const rulesPath = path.resolve('./firestore.rules');

const TEST_USER_OWNER = 'owner-user-123';
const TEST_USER_ADMIN_CLAIM = 'admin-claim-user-123';
const TEST_USER_ADMIN_DOC = 'admin-user-123';
const TEST_USER_REGULAR = 'regular-user-123';
const TEST_USER_OTHER = 'other-user-999';
const CASH_LAUNCH_ID = 'cash-launch-001';
const CASH_LAUNCH_PAYMENT_ID = 'cash-launch-payment-stock';
const PRODUCT_ID = 'produto-estoque-001';
const PRODUCT_PAYMENT_ID = 'produto-010101';

const now = () => new Date().toISOString();

const ownerCashLaunchData = {
  userId: TEST_USER_OWNER,
  orderNumber: 'LC-20260623-0001',
  clientName: 'Cliente Teste Owner',
  status: 'Em Lancamento',
  openingDate: '2026-06-23',
  expectedDate: '2026-06-30',
  items: [],
  merchandiseTotal: 0,
  servicesTotal: 0,
  discountTotal: 0,
  total: 0,
  createdAt: now(),
  updatedAt: now(),
  deletedAt: null,
  deletedBy: null,
  deletedReason: null,
};

const adminUserData = {
  uid: TEST_USER_ADMIN_DOC,
  email: 'admin@example.com',
  role: 'admin',
  isActive: true,
  createdAt: now(),
  updatedAt: now(),
};

const ownerUserData = {
  uid: TEST_USER_OWNER,
  email: 'owner@example.com',
  role: 'user',
  isActive: true,
  createdAt: now(),
  updatedAt: now(),
};

const regularUserData = {
  uid: TEST_USER_REGULAR,
  email: 'regular@example.com',
  role: 'user',
  isActive: true,
  createdAt: now(),
  updatedAt: now(),
};

const operationLogData = {
  userId: TEST_USER_OWNER,
  timestamp: now(),
  usuario: 'Owner Tester',
  oficina: 'Oficina Local',
  acao: 'os_criada',
  resultado: 'sucesso',
  targetId: 'target-abc',
  details: { note: 'Teste operacional' },
};

const ownerProductData = {
  id: PRODUCT_ID,
  userId: TEST_USER_OWNER,
  sourceCode: 'EST-001',
  description: 'Produto com estoque',
  variation: '',
  variations: [],
  ncm: '00000000',
  salePrice: 25,
  stockQuantity: 5,
  minStockQuantity: 2,
  trackStock: true,
  importedAt: now(),
  createdAt: now(),
  updatedAt: now(),
};

const stockMovementData = {
  userId: TEST_USER_OWNER,
  productId: PRODUCT_ID,
  productDescription: 'Produto com estoque',
  sourceCode: 'EST-001',
  type: 'saida_os',
  quantity: 1,
  previousQuantity: 5,
  nextQuantity: 4,
  cashLaunchId: CASH_LAUNCH_ID,
  cashLaunchOrderNumber: 'LC-20260623-0001',
  itemIds: ['item-001'],
  batchId: 'stock-batch-001',
  note: 'Teste de movimento de estoque',
  createdAt: now(),
};

const ownerPaymentProductData = {
  userId: TEST_USER_OWNER,
  sourceCode: '010101',
  description: '(mercadoria teste)',
  variation: '',
  variations: [],
  ncm: '00000000',
  salePrice: 100,
  stockQuantity: 5,
  minStockQuantity: 1,
  trackStock: true,
  importedAt: now(),
  createdAt: now(),
  updatedAt: now(),
};

const ownerPaymentCashLaunchData = {
  userId: TEST_USER_OWNER,
  orderNumber: 'LC-20260712-135719',
  clientId: 'cliente-pagamento-001',
  clientName: 'WILIANS BARBOSA',
  bikeModel: 'Xj6',
  status: 'Em Lancamento',
  openingDate: '2026-07-12',
  expectedDate: '2026-07-12',
  request: '',
  servicesExecuted: '',
  observation: '',
  items: [{
    id: 'item-pagamento-001',
    productId: PRODUCT_PAYMENT_ID,
    variationId: '',
    sourceCode: '010101',
    description: '(mercadoria teste)',
    variation: '',
    ncm: '00000000',
    quantity: 1,
    unitPrice: 100,
    discountValue: 0,
    discountPercent: 0,
    netUnitPrice: 100,
    total: 100,
    date: '2026-07-12',
    note: '',
  }],
  merchandiseTotal: 100,
  servicesTotal: 0,
  discountTotal: 0,
  orderDiscountValue: 0,
  orderDiscountPercent: 0,
  total: 100,
  invoiced: false,
  paymentMethod: '',
  stockDeducted: false,
  stockDeductedAt: null,
  stockMovementBatchId: null,
  createdAt: now(),
  updatedAt: now(),
  deletedAt: null,
  deletedBy: null,
  deletedReason: null,
};

const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
};

async function setupTestData(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();

    await setDoc(doc(firestore, 'users', TEST_USER_OWNER), ownerUserData);
    await setDoc(doc(firestore, 'users', TEST_USER_ADMIN_DOC), adminUserData);
    await setDoc(doc(firestore, 'users', TEST_USER_REGULAR), regularUserData);
    await setDoc(doc(firestore, 'users', TEST_USER_OTHER), {
      uid: TEST_USER_OTHER,
      email: 'other@example.com',
      role: 'user',
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    });

    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID), ownerCashLaunchData);
    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'products', PRODUCT_ID), ownerProductData);
    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_PAYMENT_ID), ownerPaymentCashLaunchData);
    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'products', PRODUCT_PAYMENT_ID), ownerPaymentProductData);
    await setDoc(doc(firestore, 'users', TEST_USER_REGULAR, 'cash_launches', CASH_LAUNCH_ID), {
      ...ownerCashLaunchData,
      userId: TEST_USER_REGULAR,
      clientName: 'Cliente Teste Regular',
      orderNumber: 'LC-20260623-0002',
    });
  });
}

async function runTests() {
  console.log('🚀 Iniciando validação completa de regras Firestore...');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: rulesContent
    },
  });

  try {
    await setupTestData(testEnv);

    console.log('1) Owner pode atualizar (soft delete) seu cash_launch');
    const ownerDb = testEnv.authenticatedContext(TEST_USER_OWNER).firestore();
    await updateDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID), {
      deletedAt: now(),
      deletedBy: TEST_USER_OWNER,
      deletedReason: 'Teste de exclusão suave',
      updatedAt: now(),
    });
    const deletedDoc = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
    if (!deletedDoc.exists()) {
      fail('Owner update soft delete falhou: documento não existe após update');
    } else {
      const data = deletedDoc.data();
      if (!data.deletedAt || data.deletedBy !== TEST_USER_OWNER) {
        fail('Owner soft delete não colocou deletedAt/deletedBy corretamente');
      } else {
        console.log('   ✅ Owner soft delete funciona e metadata foi aplicada');
      }
    }

    console.log('2) Owner pode restaurar seu cash_launch');
    await updateDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID), {
      deletedAt: null,
      deletedBy: null,
      deletedReason: null,
      updatedAt: now(),
    });
    const restoredDoc = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
    const restoredData = restoredDoc.data();
    if (restoredData.deletedAt !== null || restoredData.deletedBy !== null) {
      fail('Owner restore não limpou deletedAt/deletedBy');
    } else {
      console.log('   ✅ Owner restore funciona e dados foram reativados');
    }

    console.log('3) Usuário comum NÃO pode deletar cash_launch de outro usuário');
    console.log('2b) Owner pode cancelar cash_launch sem mercadoria');
    await updateDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID), {
      status: 'Cancelado',
      updatedAt: now(),
    });
    const canceledDoc = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
    if (!canceledDoc.exists() || canceledDoc.data().status !== 'Cancelado') {
      fail('Owner nao conseguiu cancelar cash_launch sem mercadoria');
    } else {
      console.log('   cash_launch vazio aceitou status Cancelado');
    }
    await updateDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID), {
      status: 'Em Lancamento',
      updatedAt: now(),
    });

    console.log('3b) Owner NAO pode apagar fisicamente seu cash_launch');
    try {
      await deleteDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
      fail('Owner conseguiu delete fisico em cash_launch proprio');
    } catch (error) {
      const stillExists = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
      if (!stillExists.exists()) {
        fail('Documento sumiu apos tentativa negada de delete fisico pelo owner');
      } else {
        console.log('   Owner corretamente impedido de delete fisico');
      }
    }

    const commonDb = testEnv.authenticatedContext(TEST_USER_REGULAR).firestore();
    try {
      await updateDoc(doc(commonDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID), {
        deletedAt: now(),
      });
      fail('Usuário comum conseguiu soft delete em documento de outro usuário');
    } catch (error) {
      console.log('   ✅ Usuário comum corretamente impedido de deletar outro usuário');
    }

    console.log('4) Usuário comum NÃO pode restaurar cash_launch de outro usuário');
    try {
      await updateDoc(doc(commonDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID), {
        deletedAt: null,
      });
      fail('Usuário comum conseguiu restaurar documento de outro usuário');
    } catch (error) {
      console.log('   ✅ Usuário comum corretamente impedido de restaurar outro usuário');
    }

    console.log('5) Admin via custom claim pode ler cash_launches de outro usuario');
    const adminClaimDb = testEnv.authenticatedContext(TEST_USER_ADMIN_CLAIM, { admin: true }).firestore();
    const adminClaimRead = await getDoc(doc(adminClaimDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
    if (!adminClaimRead.exists()) {
      fail('Admin-claim nao conseguiu ler cash_launches de outro usuario');
    } else {
      console.log('   Admin-claim conseguiu ler cash_launch de outro usuario');
    }

    console.log('6) Admin via documento pode ler cash_launches de outro usuário');
    console.log('5b) Admin via custom claim NAO pode apagar fisicamente cash_launch de outro usuario');
    try {
      await deleteDoc(doc(adminClaimDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
      fail('Admin-claim conseguiu delete fisico em cash_launch');
    } catch (error) {
      const stillExists = await getDoc(doc(adminClaimDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
      if (!stillExists.exists()) {
        fail('Documento sumiu apos tentativa negada de delete fisico pelo admin-claim');
      } else {
        console.log('   Admin-claim corretamente impedido de delete fisico');
      }
    }

    const adminDocDb = testEnv.authenticatedContext(TEST_USER_ADMIN_DOC).firestore();
    const adminRead = await getDoc(doc(adminDocDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
    if (!adminRead.exists()) {
      fail('Admin-document não conseguiu ler cash_launches de outro usuário');
    } else {
      console.log('   ✅ Admin-document conseguiu ler cash_launch de outro usuário');
    }

    console.log('7) Owner pode criar operational_log e ler depois');
    console.log('6b) Admin via documento NAO pode apagar fisicamente perfil de usuario');
    try {
      await deleteDoc(doc(adminDocDb, 'users', TEST_USER_REGULAR));
      fail('Admin-document conseguiu delete fisico em perfil de usuario');
    } catch (error) {
      const stillExists = await getDoc(doc(adminDocDb, 'users', TEST_USER_REGULAR));
      if (!stillExists.exists()) {
        fail('Perfil de usuario sumiu apos tentativa negada de delete fisico');
      } else {
        console.log('   Admin-document corretamente impedido de delete fisico de perfil');
      }
    }

    const logId = 'op-log-001';
    await setDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'operational_logs', logId), {
      ...operationLogData,
      createdAt: now(),
    });
    const opLog = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'operational_logs', logId));
    if (!opLog.exists()) {
      fail('Owner não conseguiu criar operational_log');
    } else {
      console.log('   ✅ operational_log criado com sucesso por owner');
    }

    console.log('8) Admin-document também pode ler operational_logs de outro usuário');
    const adminOpLog = await getDoc(doc(adminDocDb, 'users', TEST_USER_OWNER, 'operational_logs', logId));
    if (!adminOpLog.exists()) {
      fail('Admin-document não conseguiu acessar operational_logs de outro usuário');
    } else {
      console.log('   ✅ operational_logs acessível por admin');
    }

    console.log('9) Owner pode atualizar estoque de produto');
    await updateDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'products', PRODUCT_ID), {
      stockQuantity: 4,
      updatedAt: now(),
    });
    const productDoc = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'products', PRODUCT_ID));
    if (!productDoc.exists() || productDoc.data().stockQuantity !== 4) {
      fail('Owner nao conseguiu atualizar stockQuantity do produto');
    } else {
      console.log('   ✅ Produto aceitou atualizacao de estoque');
    }

    console.log('10) Owner pode criar stock_movement');
    await setDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'stock_movements', 'stock-move-001'), stockMovementData);
    const stockMovementDoc = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'stock_movements', 'stock-move-001'));
    if (!stockMovementDoc.exists()) {
      fail('Owner nao conseguiu criar stock_movement');
    } else {
      console.log('   ✅ stock_movement criado com sucesso por owner');
    }

    console.log('11) Usuario comum NAO pode criar stock_movement de outro usuario');
    try {
      await setDoc(doc(commonDb, 'users', TEST_USER_OWNER, 'stock_movements', 'stock-move-blocked'), {
        ...stockMovementData,
        batchId: 'stock-batch-blocked',
      });
      fail('Usuario comum conseguiu criar stock_movement para outro usuario');
    } catch (error) {
      console.log('   ✅ Usuario comum corretamente impedido de criar stock_movement de outro usuario');
    }

    console.log('12) Owner pode finalizar cash_launch com metadata de estoque');
    await updateDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID), {
      status: 'Finalizado',
      items: [{
        id: 'item-001',
        productId: PRODUCT_ID,
        sourceCode: 'EST-001',
        description: 'Produto com estoque',
        variation: '',
        ncm: '00000000',
        quantity: 1,
        unitPrice: 25,
        discountValue: 0,
        discountPercent: 0,
        netUnitPrice: 25,
        total: 25,
        date: '2026-06-23',
        note: '',
      }],
      merchandiseTotal: 25,
      total: 25,
      stockDeducted: true,
      stockDeductedAt: now(),
      stockMovementBatchId: 'stock-batch-001',
      updatedAt: now(),
    });
    const finalizedLaunchDoc = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
    if (!finalizedLaunchDoc.exists() || finalizedLaunchDoc.data().stockDeducted !== true) {
      fail('Owner nao conseguiu finalizar cash_launch com metadata de estoque');
    } else {
      console.log('   ✅ cash_launch aceitou metadata de estoque na finalizacao');
    }

    console.log('13) Usuário comum não pode ler /users de outro usuário diretamente');
    try {
      const otherUserDoc = await getDoc(doc(commonDb, 'users', TEST_USER_OWNER));
      if (otherUserDoc.exists()) {
        fail('Usuário comum conseguiu ler documento /users de outro usuário');
      } else {
        fail('Usuário comum leu /users de outro usuário sem exception?');
      }
    } catch (error) {
      console.log('   ✅ Usuário comum corretamente impedido de ler /users de outro usuário');
    }

    console.log('14) Admin-document pode listar /users');
    try {
      const allUsersSnapshot = await getDocs(query(collection(adminDocDb, 'users')));
      if (allUsersSnapshot.size >= 2) {
        console.log(`   ✅ Admin-document listou /users (${allUsersSnapshot.size} docs)`);
      } else {
        fail('Admin-document não conseguiu listar /users ou encontrou poucos documentos');
      }
    } catch (error) {
      fail('Admin-document não conseguiu listar /users');
    }

    console.log('15) Owner pode finalizar cash_launch faturada com pagamento e baixa de estoque na mesma transacao');
    await runTransaction(ownerDb, async (transaction) => {
      const timestamp = now();
      const productRef = doc(ownerDb, 'users', TEST_USER_OWNER, 'products', PRODUCT_PAYMENT_ID);
      const launchRef = doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_PAYMENT_ID);
      const movementRef = doc(ownerDb, 'users', TEST_USER_OWNER, 'stock_movements', 'stock-move-payment-001');
      transaction.update(productRef, {
        stockQuantity: 4,
        updatedAt: timestamp,
      });
      transaction.set(movementRef, {
        userId: TEST_USER_OWNER,
        productId: PRODUCT_PAYMENT_ID,
        productDescription: '(mercadoria teste)',
        type: 'saida_os',
        quantity: 1,
        previousQuantity: 5,
        nextQuantity: 4,
        cashLaunchId: CASH_LAUNCH_PAYMENT_ID,
        cashLaunchOrderNumber: 'LC-20260712-135719',
        itemIds: ['item-pagamento-001'],
        batchId: 'stock-payment-batch-001',
        note: 'Baixa automatica ao finalizar O.S.',
        createdAt: timestamp,
        sourceCode: '010101',
      });
      transaction.update(launchRef, {
        status: 'Finalizado',
        invoiced: true,
        paymentMethod: 'Pix',
        stockDeducted: true,
        stockDeductedAt: timestamp,
        stockMovementBatchId: 'stock-payment-batch-001',
        updatedAt: timestamp,
      });
    });
    const finalizedPaymentLaunchDoc = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_PAYMENT_ID));
    if (!finalizedPaymentLaunchDoc.exists() || finalizedPaymentLaunchDoc.data().paymentMethod !== 'Pix') {
      fail('Owner nao conseguiu finalizar cash_launch faturada com pagamento e baixa de estoque');
    } else {
      console.log('   cash_launch faturada aceitou pagamento e baixa de estoque na mesma transacao');
    }

    console.log('\n🎯 Validação completa finalizada com sucesso.\n');

  } finally {
    await testEnv.cleanup();
  }
}

runTests().catch((error) => {
  console.error('Erro na validação completa:', error);
  process.exit(1);
});
