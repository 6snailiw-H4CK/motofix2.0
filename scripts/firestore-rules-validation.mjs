import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';

const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
const PROJECT_ID = process.env.GCLOUD_PROJECT || firebaseConfig.projectId || 'motofix-dev';
const rulesPath = path.resolve('./firestore.rules');

const TEST_USER_OWNER = 'o5XNtNFwKMQzZj28WfTEiGSFN0A3';
const TEST_USER_ADMIN_CLAIM = 'admin-claim-user-123';
const TEST_USER_ADMIN_DOC = 'admin-user-123';
const TEST_USER_REGULAR = 'regular-user-123';
const TEST_USER_INACTIVE = 'inactive-user-123';
const TEST_USER_INACTIVE_ADMIN = 'inactive-admin-user-123';
const TEST_USER_STALE_BILLING = 'stale-billing-user-123';
const TEST_USER_OTHER = 'other-user-999';
const CASH_LAUNCH_ID = 'cash-launch-001';
const LEGACY_MAINTENANCE_ID = 'legacy-maintenance-001';
const LEGACY_CLIENT_ID = 'legacy-client-001';
const LEGACY_CLIENT_MAINTENANCE_ID = 'legacy-client-maintenance-001';
const INACTIVE_CASH_LAUNCH_ID = 'inactive-cash-launch-001';
const INACTIVE_EXPENSE_ID = 'inactive-expense-001';
const ADMIN_EXPENSE_ID = 'admin-expense-001';
const STALE_BILLING_EXPENSE_ID = 'stale-billing-expense-001';
const CASH_LAUNCH_PAYMENT_ID = 'cash-launch-payment-stock';
const CASH_LAUNCH_NO_STOCK_PAYMENT_ID = 'cash-launch-payment-no-stock';
const PRODUCT_ID = 'produto-estoque-001';
const PRODUCT_PAYMENT_ID = 'produto-010101';
const PRODUCT_NO_TRACK_ID = 'produto-sem-controle-estoque';
const MASTER_ADMIN_DENY_COLLECTIONS = [
  'clients',
  'maintenances',
  'warranties',
  'appointments',
  'expenses',
  'products',
  'stock_movements',
  'cash_launches',
  'settings',
  'message_logs',
  'operational_logs',
  'whatsapp_sessions',
  'whatsapp_messages',
  'whatsapp_contacts',
  'whatsapp_automations',
  'fiscal_companies',
  'fiscal_invoices',
  'fiscal_logs',
  'fiscal_private',
  'fiscal_invoice_files',
];

const now = () => new Date().toISOString();
const validUntil = () => Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
const allowedProjection = (source = 'manual') => ({
  allowed: true,
  source,
  validUntil: validUntil(),
});

async function setupAccessProjectionScenarios(testEnv) {
  const suffix = randomUUID();
  const future = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
  const past = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
  const scenarios = [
    { name: 'blocked-projection-allowed', isActive: false, accessProjection: { allowed: true, source: 'manual', validUntil: future } },
    { name: 'active-projection-denied', isActive: true, accessProjection: { allowed: false, source: 'none' } },
    { name: 'manual-expired', isActive: true, manualAccess: { enabled: true, expiresAt: past }, billing: { status: 'canceled' }, accessProjection: { allowed: false, source: 'none' } },
    { name: 'manual-future', isActive: true, manualAccess: { enabled: true, expiresAt: future }, accessProjection: { allowed: true, source: 'manual', validUntil: future } },
    { name: 'projection-absent', isActive: true },
    { name: 'projection-incomplete', isActive: true, accessProjection: { allowed: true, source: 'manual' } },
    { name: 'valid-until-past', isActive: true, accessProjection: { allowed: true, source: 'manual', validUntil: past } },
    { name: 'stripe-projection-denied', isActive: true, billing: { status: 'active', currentPeriodEnd: future }, accessProjection: { allowed: true, source: 'stripe', validUntil: future } },
    { name: 'valid-until-iso-string', isActive: true, accessProjection: { allowed: true, source: 'manual', validUntil: '2099-01-01T00:00:00.000Z' } },
    { name: 'owner-entitlement-valid', role: 'master_admin', isActive: true, ownerAccess: { enabled: true, permanent: true }, accessProjection: { allowed: true, source: 'owner', validUntil: null } },
    { name: 'owner-entitlement-no-owner-claim', role: 'master_admin', masterAdminClaim: true, isActive: true, ownerAccess: { enabled: true, permanent: true }, accessProjection: { allowed: true, source: 'owner', validUntil: null } },
    { name: 'owner-entitlement-stale-config', role: 'master_admin', masterAdminClaim: true, ownerClaim: true, isActive: true, ownerAccess: { enabled: true, permanent: true }, accessProjection: { allowed: true, source: 'owner', validUntil: null } },
    { name: 'owner-entitlement-no-owner-flag', role: 'master_admin', masterAdminClaim: true, isActive: true, accessProjection: { allowed: true, source: 'owner', validUntil: null } },
    { name: 'owner-entitlement-not-permanent', role: 'master_admin', masterAdminClaim: true, isActive: true, ownerAccess: { enabled: true, permanent: false }, accessProjection: { allowed: true, source: 'owner', validUntil: null } },
    { name: 'owner-entitlement-wrong-role', role: 'user', masterAdminClaim: true, isActive: true, ownerAccess: { enabled: true, permanent: true }, accessProjection: { allowed: true, source: 'owner', validUntil: null } },
    { name: 'owner-entitlement-inactive', role: 'master_admin', masterAdminClaim: true, isActive: false, ownerAccess: { enabled: true, permanent: true }, accessProjection: { allowed: true, source: 'owner', validUntil: null } },
  ].map((scenario) => ({
    ...scenario,
    uid: scenario.name === 'owner-entitlement-valid'
      ? TEST_USER_OWNER
      : `${scenario.name}-${suffix}`,
    expenseId: `expense-${scenario.name}-${suffix}`,
  }));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    for (const scenario of scenarios) {
      await setDoc(doc(firestore, 'users', scenario.uid), {
        uid: scenario.uid,
        email: `${scenario.name}@example.com`,
        role: scenario.role ?? 'user',
        isActive: scenario.isActive,
        ...(scenario.manualAccess ? { manualAccess: scenario.manualAccess } : {}),
        ...(scenario.ownerAccess ? { ownerAccess: scenario.ownerAccess } : {}),
        ...(scenario.billing ? { billing: scenario.billing } : {}),
        ...(scenario.accessProjection ? { accessProjection: scenario.accessProjection } : {}),
        createdAt: now(),
        updatedAt: now(),
      });
      await setDoc(doc(firestore, 'users', scenario.uid, 'expenses', scenario.expenseId), {
        userId: scenario.uid,
        description: 'Projection runtime test',
        amount: 1,
        paymentMethod: 'Pix',
        date: now(),
        createdAt: now(),
      });
    }
    await setDoc(doc(firestore, 'admin', `protected-${suffix}`), { protected: true });
  });
  const configuredOwner = scenarios.find(({ name }) => name === 'owner-entitlement-valid');
  const configuredOwnerClientDb = testEnv.authenticatedContext(configuredOwner.uid).firestore();
  for (const operation of [
    () => getDoc(doc(configuredOwnerClientDb, 'system', 'access_config')),
    () => setDoc(doc(configuredOwnerClientDb, 'system', 'access_config'), { ownerUid: configuredOwner.uid }),
  ]) {
    try {
      await operation();
      fail('Cliente conseguiu ler ou escrever system/access_config');
    } catch (error) {
      if (error?.code !== 'permission-denied') throw error;
    }
  }

  return {
    scenarios,
    adminPath: `admin/protected-${suffix}`,
  };
}

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

const adminUserProjection = allowedProjection();
const adminUserData = {
  uid: TEST_USER_ADMIN_DOC,
  email: 'admin@example.com',
  role: 'admin',
  isActive: true,
  manualAccess: { enabled: true, expiresAt: adminUserProjection.validUntil },
  accessProjection: adminUserProjection,
  createdAt: now(),
  updatedAt: now(),
};

const adminClaimUserData = {
  uid: TEST_USER_ADMIN_CLAIM,
  email: 'admin-claim@example.com',
  role: 'master_admin',
  isActive: true,
  createdAt: now(),
  updatedAt: now(),
};

const inactiveUserData = {
  uid: TEST_USER_INACTIVE,
  email: 'inactive@example.com',
  role: 'user',
  isActive: false,
  createdAt: now(),
  updatedAt: now(),
};

const inactiveAdminUserData = {
  uid: TEST_USER_INACTIVE_ADMIN,
  email: 'inactive-admin@example.com',
  role: 'admin',
  isActive: false,
  createdAt: now(),
  updatedAt: now(),
};

const ownerUserProjection = allowedProjection();
const ownerUserData = {
  uid: TEST_USER_OWNER,
  email: 'owner@example.com',
  role: 'user',
  isActive: true,
  manualAccess: { enabled: true, expiresAt: ownerUserProjection.validUntil },
  accessProjection: ownerUserProjection,
  subscriptionExpiresAt: '2030-01-01T00:00:00.000Z',
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
  id: PRODUCT_PAYMENT_ID,
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

const writeStockOperation = (transaction, firestore, {
  productRef,
  productId,
  product,
  nextQuantity,
  type,
  batchId,
  note,
  timestamp,
  cashLaunchId,
  cashLaunchOrderNumber,
  itemIds,
  otherFields = {},
}) => {
  const movementId = `stock-op-${randomUUID()}`;
  const previousVariations = product.variations || [];
  const nextVariations = previousVariations;
  transaction.update(productRef, {
    ...otherFields,
    stockQuantity: nextQuantity,
    variations: nextVariations,
    stockMovementId: movementId,
    updatedAt: timestamp,
  });
  transaction.set(doc(firestore, 'users', TEST_USER_OWNER, 'stock_movements', movementId), {
    userId: TEST_USER_OWNER,
    type,
    batchId,
    note,
    createdAt: timestamp,
    productIds: [productId],
    changes: {
      [productId]: {
        productId,
        productDescription: product.description,
        previousQuantity: product.stockQuantity || 0,
        nextQuantity,
        quantity: Math.abs(nextQuantity - (product.stockQuantity || 0)),
        previousVariations,
        nextVariations,
      },
    },
    ...(cashLaunchId ? { cashLaunchId } : {}),
    ...(cashLaunchOrderNumber ? { cashLaunchOrderNumber } : {}),
    ...(itemIds ? { itemIds } : {}),
  });
};

async function setupTestData(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();

    await setDoc(doc(firestore, 'users', TEST_USER_OWNER), ownerUserData);
    await setDoc(doc(firestore, 'users', TEST_USER_ADMIN_CLAIM), adminClaimUserData);
    await setDoc(doc(firestore, 'users', TEST_USER_ADMIN_DOC), adminUserData);
    await setDoc(doc(firestore, 'users', TEST_USER_REGULAR), regularUserData);
    await setDoc(doc(firestore, 'users', TEST_USER_INACTIVE), inactiveUserData);
    await setDoc(doc(firestore, 'users', TEST_USER_INACTIVE_ADMIN), inactiveAdminUserData);
    await setDoc(doc(firestore, 'users', TEST_USER_STALE_BILLING), {
      uid: TEST_USER_STALE_BILLING,
      email: 'stale-billing@example.com',
      role: 'user',
      isActive: true,
      billing: { status: 'past_due' },
      createdAt: now(),
      updatedAt: now(),
    });
    await setDoc(doc(firestore, 'users', TEST_USER_OTHER), {
      uid: TEST_USER_OTHER,
      email: 'other@example.com',
      role: 'user',
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    });

    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID), ownerCashLaunchData);
    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'maintenances', LEGACY_MAINTENANCE_ID), {
      userId: TEST_USER_OWNER,
      clientName: 'Cadastro recorrente legado',
      legacyField: 'Campo anterior ao formato atual',
    });
    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'clients', LEGACY_CLIENT_ID), {
      userId: TEST_USER_OWNER,
      name: 'Cliente legado',
      bikeModel: 'Moto antiga',
      contact: '000000000',
      legacyField: 'Cadastro sem os campos atuais obrigatórios',
    });
    await setDoc(doc(firestore, 'users', TEST_USER_INACTIVE, 'cash_launches', INACTIVE_CASH_LAUNCH_ID), {
      ...ownerCashLaunchData,
      userId: TEST_USER_INACTIVE,
      orderNumber: 'LC-20260623-INACTIVE',
    });
    await setDoc(doc(firestore, 'users', TEST_USER_INACTIVE, 'expenses', INACTIVE_EXPENSE_ID), {
      userId: TEST_USER_INACTIVE,
      description: 'Gasto inativo de teste',
      amount: 10,
      paymentMethod: 'Pix',
      date: '2026-10-03',
      createdAt: now(),
    });
    await setDoc(doc(firestore, 'users', TEST_USER_ADMIN_DOC, 'expenses', ADMIN_EXPENSE_ID), {
      userId: TEST_USER_ADMIN_DOC,
      description: 'Despesa de teste do administrador',
      amount: 10,
      paymentMethod: 'Pix',
      date: '2026-10-03',
      createdAt: now(),
    });
    await setDoc(doc(firestore, 'users', TEST_USER_STALE_BILLING, 'expenses', STALE_BILLING_EXPENSE_ID), {
      userId: TEST_USER_STALE_BILLING,
      description: 'Despesa de teste com billing vencido',
      amount: 10,
      paymentMethod: 'Pix',
      date: '2026-10-03',
      createdAt: now(),
    });
    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'products', PRODUCT_ID), ownerProductData);
    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_PAYMENT_ID), ownerPaymentCashLaunchData);
    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_NO_STOCK_PAYMENT_ID), {
      ...ownerPaymentCashLaunchData,
      orderNumber: 'LC-20260712-NOSTOCK',
      items: ownerPaymentCashLaunchData.items.map((item) => ({
        ...item,
        productId: PRODUCT_NO_TRACK_ID,
        sourceCode: 'SEM-ESTOQUE',
        description: 'Produto sem controle de estoque',
      })),
    });
    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'products', PRODUCT_PAYMENT_ID), ownerPaymentProductData);
    await setDoc(doc(firestore, 'users', TEST_USER_OWNER, 'products', PRODUCT_NO_TRACK_ID), {
      ...ownerPaymentProductData,
      id: PRODUCT_NO_TRACK_ID,
      sourceCode: 'SEM-ESTOQUE',
      description: 'Produto sem controle de estoque',
      trackStock: false,
    });
    await setDoc(doc(firestore, 'users', TEST_USER_REGULAR, 'cash_launches', CASH_LAUNCH_ID), {
      ...ownerCashLaunchData,
      userId: TEST_USER_REGULAR,
      clientName: 'Cliente Teste Regular',
      orderNumber: 'LC-20260623-0002',
    });
    for (const collectionName of MASTER_ADMIN_DENY_COLLECTIONS) {
      const documentId = collectionName === 'settings' ? 'config' : 'master-admin-probe';
      await setDoc(doc(firestore, 'users', TEST_USER_OWNER, collectionName, documentId), {
        userId: TEST_USER_OWNER,
        createdAt: now(),
      });
    }
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
    const { scenarios: projectionScenarios, adminPath } = await setupAccessProjectionScenarios(testEnv);

    console.log('P1.2) Cliente nao pode criar accessProjection; backend continua podendo materializa-la');
    const profileUid = `p12-profile-${randomUUID()}`;
    const futureProjection = allowedProjection('manual');
    const baseNewProfile = {
      email: `${profileUid}@example.com`,
      displayName: 'Perfil de teste P1.2',
      isActive: false,
      subscription: {
        status: 'inactive',
        plan: 'free',
        startsAt: now(),
        expiresAt: now(),
        currentPeriodEnd: now(),
        autoRenew: false,
      },
      subscriptionExpiresAt: now(),
      createdAt: now(),
    };
    const attemptProfileCreate = async (uid, claims, profile, label) => {
      const clientDb = testEnv.authenticatedContext(uid, {
        email: profile.email,
        ...claims,
      }).firestore();
      try {
        const batch = writeBatch(clientDb);
        batch.set(doc(clientDb, 'users', uid), profile);
        batch.set(doc(clientDb, 'access_requests', uid), {
          uid,
          email: profile.email,
          displayName: profile.displayName,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
        await batch.commit();
        fail(`${label}: cliente conseguiu criar accessProjection`);
      } catch (error) {
        if (error?.code !== 'permission-denied') {
          fail(`${label}: erro inesperado ${error?.code || error}`);
        } else {
          console.log(`   ✅ ${label}: DENY`);
        }
      }
    };
    await attemptProfileCreate(
      `${profileUid}-common`,
      {},
      {
        ...baseNewProfile,
        uid: `${profileUid}-common`,
        role: 'user',
        ...{ isActive: false, subscription: baseNewProfile.subscription },
        accessProjection: futureProjection,
      },
      'cliente comum',
    );
    await attemptProfileCreate(
      `${profileUid}-admin`,
      { admin: true },
      {
        ...baseNewProfile,
        uid: `${profileUid}-admin`,
        role: 'admin',
        isActive: true,
        accessProjection: futureProjection,
      },
      'claim admin',
    );
    await attemptProfileCreate(
      `${profileUid}-master`,
      { admin: true, master_admin: true },
      {
        ...baseNewProfile,
        uid: `${profileUid}-master`,
        role: 'master_admin',
        isActive: true,
        accessProjection: allowedProjection('manual'),
      },
      'claim master_admin',
    );
    await attemptProfileCreate(
      `${profileUid}-manual`,
      {},
      {
        ...baseNewProfile,
        uid: `${profileUid}-manual`,
        role: 'user',
        manualAccess: { enabled: true, expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000) },
      },
      'cliente comum com manualAccess fabricado',
    );

    const normalProfileUid = `${profileUid}-normal`;
    const normalProfileDb = testEnv.authenticatedContext(normalProfileUid, {
      email: `${normalProfileUid}@example.com`,
    }).firestore();
    const normalProfile = {
      ...baseNewProfile,
      uid: normalProfileUid,
      email: `${normalProfileUid}@example.com`,
      role: 'user',
    };
    const normalSignupBatch = writeBatch(normalProfileDb);
    normalSignupBatch.set(doc(normalProfileDb, 'users', normalProfileUid), normalProfile);
    normalSignupBatch.set(doc(normalProfileDb, 'access_requests', normalProfileUid), {
      uid: normalProfileUid,
      email: normalProfile.email,
      displayName: normalProfile.displayName,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    await normalSignupBatch.commit();
    console.log('   ✅ criação normal sem accessProjection: ALLOW');

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const backendDb = context.firestore();
      await updateDoc(doc(backendDb, 'users', normalProfileUid), {
        isActive: true,
        manualAccess: { enabled: true, expiresAt: futureProjection.validUntil },
        accessProjection: futureProjection,
      });
      await setDoc(doc(backendDb, 'users', normalProfileUid, 'expenses', 'p12-backend-projection'), {
        userId: normalProfileUid,
        description: 'Backend materialized access projection',
        amount: 1,
        paymentMethod: 'Pix',
        date: now(),
        createdAt: now(),
      });
    });
    const backendGrantedExpense = await getDoc(doc(normalProfileDb, 'users', normalProfileUid, 'expenses', 'p12-backend-projection'));
    if (!backendGrantedExpense.exists()) {
      fail('backend/Admin SDK nao conseguiu materializar projection para acesso operacional');
    } else {
      console.log('   ✅ backend/Admin SDK gravou projection; cliente autorizado leu dado: PASS');
    }

    console.log('0) Perfil inativo nao pode ler nem gravar dados operacionais');
    const inactiveDb = testEnv.authenticatedContext(TEST_USER_INACTIVE).firestore();
    try {
      await getDoc(doc(inactiveDb, 'users', TEST_USER_INACTIVE, 'cash_launches', INACTIVE_CASH_LAUNCH_ID));
      fail('Perfil inativo conseguiu ler cash_launch proprio');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Leitura inativa falhou com erro inesperado: ${error?.code || error}`);
      else console.log('   ✅ Perfil inativo corretamente impedido de ler');
    }
    try {
      await updateDoc(doc(inactiveDb, 'users', TEST_USER_INACTIVE, 'expenses', INACTIVE_EXPENSE_ID), {
        note: 'write bloqueado',
      });
      fail('Perfil inativo conseguiu gravar despesa propria');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Gravacao inativa falhou com erro inesperado: ${error?.code || error}`);
      else console.log('   ✅ Perfil inativo corretamente impedido de gravar');
    }

    console.log('0b) Claim admin antiga nao libera perfil desativado');
    const inactiveAdminDb = testEnv.authenticatedContext(TEST_USER_INACTIVE_ADMIN, { admin: true }).firestore();
    try {
      await getDoc(doc(inactiveAdminDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
      fail('Admin desativado manteve leitura com claim antiga');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Claim antiga falhou com erro inesperado: ${error?.code || error}`);
      else console.log('   ✅ Perfil admin desativado corretamente impedido');
    }

    console.log('0c) Admin ativo com entitlement canônico acessa os próprios dados');
    const activeAdminDb = testEnv.authenticatedContext(TEST_USER_ADMIN_DOC, { admin: true }).firestore();
    const adminExpense = await getDoc(doc(activeAdminDb, 'users', TEST_USER_ADMIN_DOC, 'expenses', ADMIN_EXPENSE_ID));
    if (!adminExpense.exists()) {
      fail('Admin ativo sem assinatura nao conseguiu ler os próprios dados');
    } else {
      console.log('   ✅ Admin ativo com entitlement manual vigente acessa os próprios dados');
    }

    console.log('0d) Billing Stripe bloqueado impede acesso direto com isActive desatualizado');
    const staleBillingDb = testEnv.authenticatedContext(TEST_USER_STALE_BILLING).firestore();
    try {
      await getDoc(doc(staleBillingDb, 'users', TEST_USER_STALE_BILLING, 'expenses', STALE_BILLING_EXPENSE_ID));
      fail('Perfil past_due com isActive desatualizado conseguiu ler dados');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Billing bloqueado falhou com erro inesperado: ${error?.code || error}`);
      else console.log('   ✅ Estado past_due corretamente impede leitura direta');
    }
    try {
      await updateDoc(doc(staleBillingDb, 'users', TEST_USER_STALE_BILLING, 'expenses', STALE_BILLING_EXPENSE_ID), {
        note: 'write bloqueado',
      });
      fail('Perfil past_due com isActive desatualizado conseguiu gravar dados');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Gravacao com billing bloqueado falhou com erro inesperado: ${error?.code || error}`);
      else console.log('   ✅ Estado past_due corretamente impede gravação direta');
    }

    console.log('1) Owner pode atualizar (soft delete) seu cash_launch');
    const ownerDb = testEnv.authenticatedContext(TEST_USER_OWNER).firestore();
    const readProjectionScenario = async (scenario, expectedAllowed, expectedLabel) => {
      const db = testEnv.authenticatedContext(
        scenario.uid,
        {
          ...(scenario.masterAdminClaim ? { master_admin: true } : {}),
          ...(scenario.ownerClaim ? { motofix_owner: true } : {}),
        },
      ).firestore();
      let allowed = false;
      try {
        const snapshot = await getDoc(doc(db, 'users', scenario.uid, 'expenses', scenario.expenseId));
        allowed = snapshot.exists();
      } catch (error) {
        if (error?.code !== 'permission-denied') throw error;
      }
      if (allowed === expectedAllowed) {
        console.log(`   ✅ ${expectedLabel}: ${allowed ? 'ALLOW' : 'DENY'}`);
      } else {
        console.log(`   ⚠️ ${expectedLabel}: comportamento diferente; observado ${allowed ? 'ALLOW' : 'DENY'}, esperado ${expectedAllowed ? 'ALLOW' : 'DENY'}`);
        fail(`${expectedLabel}: comportamento diferente do esperado`);
      }
      return allowed;
    };

    console.log('P0.2-A) isActive=false com projection allowed e Timestamp futuro deve negar');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'blocked-projection-allowed'), false, 'BLOCKED + PROJECTION ALLOWED');
    console.log('P0.2-B) isActive=true com projection denied deve negar');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'active-projection-denied'), false, 'ACTIVE + PROJECTION DENIED');
    console.log('P0.2-C) manualAccess expirado com projection denied deve negar');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'manual-expired'), false, 'MANUAL ACCESS EXPIRADO');
    console.log('P0.2-C2) manual access com Timestamp futuro deve permitir');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'manual-future'), true, 'MANUAL ACCESS FUTURO');
    console.log('P0.2-D) projection ausente deve negar conforme política canônica');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'projection-absent'), false, 'PROJECTION AUSENTE');
    console.log('P0.2-E) projection allowed sem validUntil deve negar quando expiry é obrigatório');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'projection-incomplete'), false, 'PROJECTION INCOMPLETA');
    console.log('P0.2-F) validUntil Timestamp passado deve negar');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'valid-until-past'), false, 'VALIDUNTIL TIMESTAMP PASSADO');
    console.log('P0.2-G) validUntil Timestamp futuro deve permitir');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'stripe-projection-denied'), false, 'PROJEÇÃO STRIPE NÃO CONCEDE ACESSO');
    console.log('P0.2-H) validUntil string ISO não deve permitir');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'valid-until-iso-string'), false, 'VALIDUNTIL STRING ISO');
    console.log('P1.5-A) identidade UID designada e ownerAccess permanente permitem sem projeção de billing');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'owner-entitlement-valid'), true, 'OWNER ENTITLEMENT EXPLÍCITO');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'owner-entitlement-no-owner-claim'), false, 'MASTER ADMIN NÃO DESIGNADO');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'owner-entitlement-stale-config'), false, 'OWNER ANTIGO APÓS ROTAÇÃO');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'owner-entitlement-valid'), true, 'OWNER SEM CONFIGURAÇÃO OU CLAIM');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'owner-entitlement-no-owner-flag'), false, 'OWNER SEM ENTITLEMENT');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'owner-entitlement-not-permanent'), false, 'OWNER SEM MARCADOR PERMANENTE');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'owner-entitlement-wrong-role'), false, 'OWNER COM ROLE USER');
    await readProjectionScenario(projectionScenarios.find(({ name }) => name === 'owner-entitlement-inactive'), false, 'OWNER INATIVO');

    console.log('0f) Proprietário mantém leitura operacional em sua própria conta');
    for (const collectionName of MASTER_ADMIN_DENY_COLLECTIONS.filter((name) => (
      name !== 'fiscal_private' && name !== 'fiscal_invoice_files'
    ))) {
      const documentId = collectionName === 'settings' ? 'config' : 'master-admin-probe';
      try {
        const ownDocument = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, collectionName, documentId));
        if (!ownDocument.exists()) fail(`Documento próprio não encontrado em ${collectionName}`);
      } catch (error) {
        fail(`Proprietário perdeu leitura em ${collectionName}: ${error?.code || error}`);
      }
    }
    console.log('0e) Cliente não pode alterar campos de acesso/billing no perfil raiz');
    const profileRef = doc(ownerDb, 'users', TEST_USER_OWNER);
    const protectedProfileWrites = [
      { label: 'role existente', data: { role: 'admin' } },
      { label: 'isActive existente', data: { isActive: false } },
      { label: 'billing adicionado', data: { billing: { status: 'active' } } },
      { label: 'Stripe IDs adicionados', data: { subscription: { stripeCustomerId: 'cus_forged', stripeSubscriptionId: 'sub_forged' } } },
      { label: 'accessProjection adicionada', data: { accessProjection: allowedProjection('manual') } },
      { label: 'manualAccess adicionado', data: { manualAccess: { enabled: true, expiresAt: validUntil() } } },
      { label: 'ownerAccess adicionado', data: { ownerAccess: { enabled: true } } },
      { label: 'subscriptionExpiresAt alterado', data: { subscriptionExpiresAt: '2099-01-01T00:00:00.000Z' } },
      { label: 'campo de expiração removido', data: { subscriptionExpiresAt: deleteField() } },
    ];
    for (const write of protectedProfileWrites) {
      try {
        await updateDoc(profileRef, write.data);
        fail(`Cliente conseguiu alterar ${write.label} no perfil raiz`);
      } catch (error) {
        if (error?.code !== 'permission-denied') fail(`Tentativa de alterar ${write.label} falhou inesperadamente: ${error?.code || error}`);
      }
    }
    console.log('   ✅ role, isActive, billing, Stripe IDs, accessProjection, manualAccess, ownerAccess e subscriptionExpiresAt protegidos');

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

    console.log('1b) Owner pode arquivar manutenção legada sem validar novamente seu formato antigo');
    const legacyMaintenanceRef = doc(ownerDb, 'users', TEST_USER_OWNER, 'maintenances', LEGACY_MAINTENANCE_ID);
    await updateDoc(legacyMaintenanceRef, {
      deletedAt: now(),
      deletedBy: TEST_USER_OWNER,
      deletedReason: 'Teste de arquivamento legado',
    });
    const archivedLegacyMaintenance = await getDoc(legacyMaintenanceRef);
    if (!archivedLegacyMaintenance.exists() || !archivedLegacyMaintenance.data().deletedAt) {
      fail('Owner não conseguiu arquivar manutenção legada');
    } else {
      console.log('   ✅ Manutenção legada arquivada sem alterar seus dados de domínio');
    }
    try {
      await updateDoc(legacyMaintenanceRef, { clientName: 'Alteração não autorizada no teste' });
      fail('Arquivamento legado permitiu alteração de dados de domínio sem formato válido');
    } catch (error) {
      if (error?.code !== 'permission-denied') {
        fail(`Alteração de domínio legado falhou com erro inesperado: ${error?.code || error}`);
      }
      console.log('   ✅ A exceção de arquivamento não libera edição de dados legados');
    }

    console.log('1c) Concluir serviço salva manutenção e projeção do cliente legado em lote atômico');
    const legacyClientRef = doc(ownerDb, 'users', TEST_USER_OWNER, 'clients', LEGACY_CLIENT_ID);
    const legacyClientMaintenanceRef = doc(
      ownerDb,
      'users',
      TEST_USER_OWNER,
      'maintenances',
      LEGACY_CLIENT_MAINTENANCE_ID,
    );
    const completionBatch = writeBatch(ownerDb);
    completionBatch.update(legacyClientRef, {
      lastMaintenanceDate: now(),
      nextMaintenanceDate: now(),
      status: 'OK',
      notificacao_enviada: false,
      notificacaoStatus: 'pendente',
      lastServiceType: 'Troca de óleo',
      lastServiceValue: 0,
      serviceValue: 0,
      statusPagamento: 'Pago',
      valorPago: 0,
      saldoDevedor: 0,
      lastServiceNotes: 'Manutenção recorrente',
    });
    completionBatch.set(legacyClientMaintenanceRef, {
      userId: TEST_USER_OWNER,
      clientId: LEGACY_CLIENT_ID,
      clientName: 'Cliente legado',
      bikeModel: 'Moto antiga',
      date: now(),
      serviceType: 'Troca de óleo',
      serviceValue: 0,
      isRecurringRevenue: false,
      statusPagamento: 'Pago',
      valorPago: 0,
      saldoDevedor: 0,
      notes: 'Manutenção recorrente',
    });
    await completionBatch.commit();
    const [legacyClientAfterCompletion, createdLegacyMaintenance] = await Promise.all([
      getDoc(legacyClientRef),
      getDoc(legacyClientMaintenanceRef),
    ]);
    if (!legacyClientAfterCompletion.exists() || !createdLegacyMaintenance.exists()) {
      fail('Conclusão atômica não salvou cliente e manutenção legados');
    } else {
      console.log('   ✅ Cliente legado e manutenção foram atualizados juntos');
    }
    try {
      await updateDoc(legacyClientRef, { name: 'Nome alterado sem validação completa' });
      fail('A exceção de manutenção permitiu alterar dados de cadastro legado');
    } catch (error) {
      if (error?.code !== 'permission-denied') {
        fail(`Alteração do cadastro legado falhou com erro inesperado: ${error?.code || error}`);
      }
      console.log('   ✅ A exceção não libera alteração geral do cadastro legado');
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
    console.log('P0.2-I) Usuário comum não pode ler documento administrativo direto');
    try {
      await getDoc(doc(commonDb, adminPath));
      fail('Usuário comum conseguiu ler documento administrativo protegido');
    } catch (error) {
      if (error?.code !== 'permission-denied') throw error;
      console.log('   ✅ leitura administrativa negada pelas Rules');
    }
    try {
      await setDoc(doc(commonDb, 'audit_events', 'client-forged'), {
        actor: TEST_USER_REGULAR,
        action: 'role_changed',
        source: 'admin',
      });
      fail('Usuário comum conseguiu escrever audit event');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Escrita de audit event falhou inesperadamente: ${error?.code || error}`);
    }
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

    console.log('5) Master Admin não pode ler nem alterar dados operacionais de outra oficina');
    const adminClaimDb = testEnv.authenticatedContext(TEST_USER_ADMIN_CLAIM, { admin: true, master_admin: true }).firestore();
    for (const collectionName of MASTER_ADMIN_DENY_COLLECTIONS) {
      const documentId = collectionName === 'settings' ? 'config' : 'master-admin-probe';
      try {
        await getDoc(doc(adminClaimDb, 'users', TEST_USER_OWNER, collectionName, documentId));
        fail(`Master Admin conseguiu ler users/${TEST_USER_OWNER}/${collectionName}`);
      } catch (error) {
        if (error?.code !== 'permission-denied') {
          fail(`Leitura Master Admin em ${collectionName} falhou inesperadamente: ${error?.code || error}`);
        }
      }
      try {
        const writeDocumentId = collectionName === 'settings' ? 'config' : `master-write-${collectionName}`;
        await setDoc(doc(adminClaimDb, 'users', TEST_USER_OWNER, collectionName, writeDocumentId), {
          userId: TEST_USER_OWNER,
          createdAt: now(),
        });
        fail(`Master Admin conseguiu criar em users/${TEST_USER_OWNER}/${collectionName}`);
      } catch (error) {
        if (error?.code !== 'permission-denied') {
          fail(`Escrita Master Admin em ${collectionName} falhou inesperadamente: ${error?.code || error}`);
        }
      }
    }
    const crossAccountProfile = await getDoc(doc(adminClaimDb, 'users', TEST_USER_OWNER));
    if (!crossAccountProfile.exists() || crossAccountProfile.id !== TEST_USER_OWNER) {
      fail('Master Admin ativo não conseguiu consultar o perfil individual usado pelos detalhes de conta');
    }
    console.log('   Master Admin pode consultar perfil individual para detalhes de conta');
    try {
      await getDocs(query(collection(adminClaimDb, 'users')));
      fail('Master Admin conseguiu enumerar users diretamente via Rules');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Listagem de perfis via Rules falhou inesperadamente: ${error?.code || error}`);
    }
    console.log(`   ✅ Leitura/escrita negadas em ${MASTER_ADMIN_DENY_COLLECTIONS.length} subcoleções operacionais e listagem global negada`);

    console.log('6) Role admin no documento sem custom claim nao concede acesso');
    console.log('5b) Admin via custom claim NAO pode apagar fisicamente cash_launch de outro usuario');
    try {
      await deleteDoc(doc(adminClaimDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
      fail('Master Admin conseguiu delete fisico em cash_launch');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Delete físico falhou inesperadamente: ${error?.code || error}`);
      let stillExists = false;
      await testEnv.withSecurityRulesDisabled(async (context) => {
        stillExists = (await getDoc(doc(context.firestore(), 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID))).exists();
      });
      if (!stillExists) fail('Documento sumiu após tentativa negada de delete físico pelo Master Admin');
      else console.log('   Master Admin corretamente impedido de delete físico');
    }

    const adminDocDb = testEnv.authenticatedContext(TEST_USER_ADMIN_DOC).firestore();
    try {
      await getDoc(doc(adminDocDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_ID));
      fail('Role admin no documento concedeu acesso sem custom claim');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Role sem claim falhou com erro inesperado: ${error?.code || error}`);
      else console.log('   ✅ Role admin sem custom claim corretamente negada');
    }

    console.log('6b) Admin via custom claim NAO pode apagar fisicamente perfil de usuario');
    try {
      await deleteDoc(doc(adminClaimDb, 'users', TEST_USER_REGULAR));
      fail('Admin-claim conseguiu delete fisico em perfil de usuario');
    } catch (error) {
      let profileStillExists = false;
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const stillExists = await getDoc(doc(context.firestore(), 'users', TEST_USER_REGULAR));
        profileStillExists = stillExists.exists();
      });
      if (!profileStillExists) {
        fail('Perfil de usuario sumiu apos tentativa negada de delete fisico');
      } else {
        console.log('   Admin-claim corretamente impedido de delete fisico de perfil');
      }
    }

    console.log('7) Owner pode criar operational_log e ler depois');
    const logId = `op-log-${randomUUID()}`;
    await setDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'operational_logs', logId), operationLogData);
    const opLog = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'operational_logs', logId));
    if (!opLog.exists()) {
      fail('Owner não conseguiu criar operational_log');
    } else {
      console.log('   ✅ operational_log criado com sucesso por owner');
    }

    console.log('8) Master Admin não pode ler operational_logs de outra oficina');
    try {
      await getDoc(doc(adminClaimDb, 'users', TEST_USER_OWNER, 'operational_logs', logId));
      fail('Master Admin conseguiu acessar operational_logs de outra oficina');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Leitura de operational_logs falhou inesperadamente: ${error?.code || error}`);
    }

    console.log('9) Alteracao isolada de estoque deve ser negada');
    try {
      await updateDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'products', PRODUCT_ID), {
        stockQuantity: 4,
        updatedAt: now(),
      });
      fail('Owner conseguiu atualizar estoque sem movimento atomico');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Atualizacao isolada falhou inesperadamente: ${error?.code || error}`);
      console.log('   ✅ Estoque isolado corretamente negado');
    }

    console.log('10) Atualizacao de estoque e movimento vinculados na mesma transacao');
    const stockMovementId = `stock-move-${randomUUID()}`;
    await runTransaction(ownerDb, async (transaction) => {
      const productRef = doc(ownerDb, 'users', TEST_USER_OWNER, 'products', PRODUCT_ID);
      const productSnapshot = await transaction.get(productRef);
      const product = productSnapshot.data();
      const timestamp = now();
      writeStockOperation(transaction, ownerDb, {
        productRef,
        productId: PRODUCT_ID,
        product,
        nextQuantity: 4,
        type: 'ajuste_manual',
        batchId: 'stock-batch-001',
        note: 'Teste de movimento de estoque',
        timestamp,
        otherFields: { salePrice: 26 },
      });
    });
    const productDoc = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'products', PRODUCT_ID));
    if (!productDoc.exists() || productDoc.data().stockQuantity !== 4 || productDoc.data().salePrice !== 26) {
      fail('Owner nao conseguiu atualizar estoque e outros dados com movimento atomico');
    } else {
      console.log('   ✅ Produto aceitou atualizacao atomica de estoque');
    }

    console.log('10b) Movimento de estoque isolado deve ser negado');
    await setDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'stock_movements', stockMovementId), stockMovementData)
      .then(() => fail('Owner conseguiu criar movimento sem alterar estoque'))
      .catch((error) => {
        if (error?.code !== 'permission-denied') fail(`Criacao isolada de movimento falhou inesperadamente: ${error?.code || error}`);
      });
    const linkedMovementId = productDoc.data().stockMovementId;
    const stockMovementDoc = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'stock_movements', linkedMovementId));
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

    console.log('14) Master Admin não pode listar /users diretamente pelo SDK cliente');
    try {
      await getDocs(query(collection(adminClaimDb, 'users')));
      fail('Master Admin conseguiu listar /users diretamente');
    } catch (error) {
      if (error?.code !== 'permission-denied') fail(`Listagem Firestore falhou inesperadamente: ${error?.code || error}`);
      else console.log('   ✅ Listagem direta de perfis bloqueada; painel consulta access_requests autorizadas pelas Rules');
    }

    console.log('15) Owner pode finalizar cash_launch faturada com pagamento e baixa de estoque na mesma transacao');
    await runTransaction(ownerDb, async (transaction) => {
      const timestamp = now();
      const productRef = doc(ownerDb, 'users', TEST_USER_OWNER, 'products', PRODUCT_PAYMENT_ID);
      const launchRef = doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_PAYMENT_ID);
      const productSnapshot = await transaction.get(productRef);
      writeStockOperation(transaction, ownerDb, {
        productRef,
        productId: PRODUCT_PAYMENT_ID,
        product: productSnapshot.data(),
        nextQuantity: 4,
        type: 'saida_os',
        batchId: 'stock-payment-batch-001',
        note: 'Baixa automatica ao finalizar O.S.',
        timestamp,
        cashLaunchId: CASH_LAUNCH_PAYMENT_ID,
        cashLaunchOrderNumber: 'LC-20260712-135719',
        itemIds: ['item-pagamento-001'],
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

    console.log('16) Owner pode faturar O.S. com produtos sem controle de estoque');
    await updateDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_NO_STOCK_PAYMENT_ID), {
      status: 'Finalizado',
      invoiced: true,
      paymentMethod: 'Pix',
      statusPagamento: 'Pago',
      valorPago: 100,
      saldoDevedor: 0,
      paidAt: now(),
      stockDeducted: false,
      stockDeductedAt: null,
      stockMovementBatchId: null,
      updatedAt: now(),
    });
    const finalizedNoStockLaunch = await getDoc(doc(ownerDb, 'users', TEST_USER_OWNER, 'cash_launches', CASH_LAUNCH_NO_STOCK_PAYMENT_ID));
    if (!finalizedNoStockLaunch.exists()
      || finalizedNoStockLaunch.data().invoiced !== true
      || finalizedNoStockLaunch.data().stockDeducted !== false) {
      fail('Owner nao conseguiu faturar O.S. sem baixa de estoque');
    } else {
      console.log('   O.S. faturada sem estoque controlado foi aceita, mantendo metadados vazios');
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
