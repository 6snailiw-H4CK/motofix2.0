import type { FirestoreReplayMutation } from './firestoreOfflineQueue';

export type ReplayFieldDiagnostic = {
  name: string;
  type: string;
  note?: string;
};

export type ReplayMutationDiagnostic = {
  operation: 'set' | 'update';
  path: string;
  recordContext: Array<{ label: string; value: string }>;
  fields: ReplayFieldDiagnostic[];
  violations: string[];
  limitations: string[];
};

type FieldRule = {
  type: 'string' | 'number' | 'boolean' | 'map';
  maxLength?: number;
  min?: number;
  max?: number;
  values?: readonly string[];
  nullable?: boolean;
};

type CollectionRule = {
  allowed: readonly string[];
  required: readonly string[];
  fields: Record<string, FieldRule>;
};

const textLength = (value: string) => Array.from(value).length;

const clientFields: Record<string, FieldRule> = {
  userId: { type: 'string' },
  name: { type: 'string', maxLength: 120 },
  fullName: { type: 'string', maxLength: 160 },
  document: { type: 'string', maxLength: 32 },
  bikeModel: { type: 'string', maxLength: 120 },
  oilType: { type: 'string', maxLength: 80 },
  oilPrice: { type: 'number', min: 0, max: 10_000_000 },
  contact: { type: 'string', maxLength: 60 },
  email: { type: 'string', maxLength: 160 },
  vehiclePlate: { type: 'string', maxLength: 20 },
  mileageKm: { type: 'number', min: 0, max: 2_000_000 },
  lastMaintenanceDate: { type: 'string', maxLength: 40 },
  nextMaintenanceDate: { type: 'string', maxLength: 40 },
  recurrenceDays: { type: 'number', min: 0, max: 3650 },
  status: { type: 'string', values: ['OK', 'WARNING', 'OVERDUE'] },
  isRecurringRevenue: { type: 'boolean' },
  returnArchived: { type: 'boolean' },
  notificacao_enviada: { type: 'boolean' },
  notificacaoStatus: { type: 'string', maxLength: 40 },
  lastServiceType: { type: 'string', maxLength: 120 },
  lastServiceValue: { type: 'number', min: 0, max: 10_000_000 },
  lastServiceNotes: { type: 'string', maxLength: 5000 },
  createdAt: { type: 'string', maxLength: 40 },
  updatedAt: { type: 'string', maxLength: 40 },
  lastAlertDate: { type: 'string', maxLength: 40 },
  serviceValue: { type: 'number', min: 0, max: 10_000_000 },
  statusPagamento: { type: 'string', values: ['Pago', 'Pendente', 'Parcial'] },
  valorPago: { type: 'number', min: 0, max: 10_000_000 },
  saldoDevedor: { type: 'number', min: 0, max: 10_000_000 },
  automation: { type: 'map' },
  deletedAt: { type: 'string', maxLength: 40, nullable: true },
  deletedBy: { type: 'string', maxLength: 160, nullable: true },
  deletedReason: { type: 'string', maxLength: 500, nullable: true },
  resetAt: { type: 'string', maxLength: 40, nullable: true },
  resetId: { type: 'string', maxLength: 160, nullable: true },
};

const maintenanceFields: Record<string, FieldRule> = {
  clientId: { type: 'string', maxLength: 160 },
  clientName: { type: 'string', maxLength: 120 },
  bikeModel: { type: 'string', maxLength: 120 },
  date: { type: 'string', maxLength: 40 },
  oilType: { type: 'string', maxLength: 80 },
  oilPrice: { type: 'number', min: 0, max: 10_000_000 },
  serviceType: { type: 'string', maxLength: 120 },
  serviceValue: { type: 'number', min: 0, max: 10_000_000 },
  isRecurringRevenue: { type: 'boolean' },
  notes: { type: 'string', maxLength: 5000 },
  userId: { type: 'string' },
  statusPagamento: { type: 'string', values: ['Pago', 'Pendente', 'Parcial'] },
  valorPago: { type: 'number', min: 0, max: 10_000_000 },
  saldoDevedor: { type: 'number', min: 0, max: 10_000_000 },
  updatedAt: { type: 'string', maxLength: 40 },
  deletedAt: { type: 'string', maxLength: 40, nullable: true },
  deletedBy: { type: 'string', maxLength: 160, nullable: true },
  deletedReason: { type: 'string', maxLength: 500, nullable: true },
  resetAt: { type: 'string', maxLength: 40, nullable: true },
  resetId: { type: 'string', maxLength: 160, nullable: true },
};

const collectionRules: Record<string, CollectionRule> = {
  clients: {
    allowed: Object.keys(clientFields),
    required: ['userId', 'name', 'bikeModel', 'contact', 'lastMaintenanceDate', 'nextMaintenanceDate', 'recurrenceDays', 'status', 'createdAt'],
    fields: clientFields,
  },
  maintenances: {
    allowed: Object.keys(maintenanceFields),
    required: ['userId', 'clientId', 'clientName', 'bikeModel', 'date', 'serviceType', 'serviceValue', 'isRecurringRevenue', 'notes'],
    fields: maintenanceFields,
  },
};

const valueType = (value: unknown) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'lista';
  if (typeof value === 'object') return 'mapa';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'número não finito';
  if (typeof value === 'string') return `texto (${textLength(value)} caracteres)`;
  if (typeof value === 'number') return 'número';
  if (typeof value === 'boolean') return 'booleano';
  return typeof value;
};

const expectedType = (rule: FieldRule) => {
  if (rule.type === 'string') {
    const length = rule.maxLength ? ` de até ${rule.maxLength} caracteres` : '';
    const values = rule.values ? `; opções: ${rule.values.join(', ')}` : '';
    return `texto${length}${values}`;
  }
  if (rule.type === 'number') {
    return `número entre ${rule.min ?? '-∞'} e ${rule.max ?? '∞'}`;
  }
  if (rule.type === 'boolean') return 'booleano';
  return 'objeto';
};

const displayText = (value: unknown, maxLength = 120): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
};

const displayValue = (value: unknown): string | null => {
  if (typeof value === 'string') return displayText(value);
  if (typeof value === 'number' && Number.isFinite(value)) return new Intl.NumberFormat('pt-BR').format(value);
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return null;
};

const formatCurrency = (value: unknown): string | null => (
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
    : null
);

const collectionLabel = (collection: string): string => {
  const labels: Record<string, string> = {
    clients: 'Cliente',
    maintenances: 'Manutenção',
    cash_launches: 'Ordem de serviço',
    products: 'Mercadoria',
    stock_movements: 'Movimentação de estoque',
    appointments: 'Agendamento',
    expenses: 'Despesa',
    warranties: 'Garantia',
    message_logs: 'Aviso',
    operational_logs: 'Registro operacional',
    settings: 'Configurações',
  };
  return labels[collection] || 'Registro';
};

const getMutationData = (mutation: FirestoreReplayMutation | undefined): Record<string, unknown> => (
  mutation?.data || {}
);

const findRelatedMutation = (
  mutations: FirestoreReplayMutation[],
  collection: string,
  documentId?: string,
): FirestoreReplayMutation | undefined => mutations.find((candidate) => (
  candidate.path[2] === collection && (!documentId || candidate.path[3] === documentId)
));

const relatedStockMovement = (
  mutations: FirestoreReplayMutation[],
  productId: string,
): FirestoreReplayMutation | undefined => mutations.find((candidate) => (
  candidate.path[2] === 'stock_movements'
    && Array.isArray(candidate.data.productIds)
    && candidate.data.productIds.includes(productId)
));

const movementProductSummary = (data: Record<string, unknown>): string[] => {
  const changes = data.changes && typeof data.changes === 'object' && !Array.isArray(data.changes)
    ? data.changes as Record<string, unknown>
    : {};
  const ids = Array.isArray(data.productIds)
    ? data.productIds.filter((id): id is string => typeof id === 'string')
    : Object.keys(changes);

  return ids.slice(0, 5).map((productId) => {
    const change = changes[productId] && typeof changes[productId] === 'object'
      ? changes[productId] as Record<string, unknown>
      : {};
    const name = displayText(change.productDescription) || productId;
    const previous = displayValue(change.previousQuantity);
    const next = displayValue(change.nextQuantity);
    const quantity = displayValue(change.quantity);
    const stock = previous !== null && next !== null ? `; estoque ${previous} → ${next}` : '';
    const moved = quantity !== null ? `; quantidade movimentada ${quantity}` : '';
    return `${name} (${productId})${stock}${moved}`;
  });
};

/** Builds an identifying summary from the failed payload without showing contact data or free text. */
const describeRecordContext = (
  mutation: FirestoreReplayMutation,
  relatedMutations: FirestoreReplayMutation[],
): Array<{ label: string; value: string }> => {
  const collection = mutation.path[2] || '';
  const documentId = mutation.path[3] || 'ID indisponível';
  const data = mutation.data;
  const lines: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: unknown) => {
    const safe = displayText(value);
    if (safe && !lines.some((line) => line.label === label && line.value === safe)) lines.push({ label, value: safe });
  };

  add('Tipo de registro', collectionLabel(collection));
  add('ID do documento', documentId);

  if (collection === 'cash_launches') {
    add('Nº da O.S.', data.orderNumber);
    add('Cliente', data.clientName);
    add('Moto/modelo', data.bikeModel);
    add('Status da O.S.', data.status);
    const payment = [displayText(data.statusPagamento), displayText(data.paymentMethod)].filter(Boolean).join(' · ');
    add('Pagamento', payment);
    if (Array.isArray(data.items)) {
      const items = data.items.slice(0, 5).map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const name = displayText(record.description) || displayText(record.productDescription);
        if (!name) return null;
        const quantity = displayValue(record.quantity);
        return quantity ? `${name} (qtd. ${quantity})` : name;
      }).filter((item): item is string => Boolean(item));
      if (items.length > 0) add('Itens da O.S.', `${items.join('; ')}${data.items.length > items.length ? '; …' : ''}`);
    }
    add('Total da O.S.', formatCurrency(data.total));
  } else if (collection === 'clients') {
    add('Cliente', data.fullName || data.name);
    add('Moto/modelo', data.bikeModel);
  } else if (collection === 'maintenances') {
    add('Cliente', data.clientName);
    add('Moto/modelo', data.bikeModel);
    add('Serviço', data.serviceType);
    add('Data', data.date);
  } else if (collection === 'products') {
    const movement = relatedStockMovement(relatedMutations, documentId);
    const changeMap = getMutationData(movement).changes;
    const change = changeMap && typeof changeMap === 'object'
      ? (changeMap as Record<string, unknown>)[documentId]
      : undefined;
    const changeRecord = change && typeof change === 'object' ? change as Record<string, unknown> : {};
    add('Mercadoria', data.description || changeRecord.productDescription);
    add('Código', data.sourceCode);
    if ('stockQuantity' in data) add('Novo estoque', displayValue(data.stockQuantity));
    if ('trackStock' in data) add('Controle de estoque', displayValue(data.trackStock));
    if (changeRecord.previousQuantity !== undefined && changeRecord.nextQuantity !== undefined) {
      add('Estoque nesta operação', `${displayValue(changeRecord.previousQuantity)} → ${displayValue(changeRecord.nextQuantity)}`);
    }
    add('O.S. vinculada', getMutationData(findRelatedMutation(relatedMutations, 'cash_launches')).orderNumber
      || getMutationData(movement).cashLaunchOrderNumber);
  } else if (collection === 'stock_movements') {
    add('Tipo de movimento', data.type);
    add('Nº da O.S.', data.cashLaunchOrderNumber
      || getMutationData(findRelatedMutation(relatedMutations, 'cash_launches', displayText(data.cashLaunchId) || undefined)).orderNumber);
    const products = movementProductSummary(data);
    if (products.length > 0) add('Mercadorias afetadas', products.join('; '));
  } else if (collection === 'appointments') {
    add('Cliente', data.clientName);
    add('Moto/modelo', data.bikeModel);
    add('Data agendada', data.scheduledDate);
    add('Serviço', data.serviceRequested);
  } else if (collection === 'expenses') {
    add('Despesa', data.description);
    add('Fornecedor', data.supplier);
    add('Data', data.date);
    add('Forma de pagamento', data.paymentMethod);
    add('Valor', formatCurrency(data.amount));
  } else if (collection === 'warranties') {
    add('Cliente', data.clientName);
    add('O.S. vinculada', data.cashLaunchOrderNumber);
    add('Serviço', data.serviceDescription || data.serviceType);
    add('Data do serviço', data.serviceDate);
    add('Vencimento', data.expiryDate);
  } else if (collection === 'message_logs') {
    add('Cliente', data.clientName);
    add('Moto/modelo', data.bikeModel);
    add('Canal', data.channel);
    add('Status', data.status);
  } else if (collection === 'operational_logs') {
    add('Ação', data.acao);
    add('Resultado', data.resultado);
    add('Registro relacionado', data.targetId);
  } else if (collection === 'settings') {
    add('Empresa', data.businessName);
  } else {
    add('Cliente', data.clientName);
    add('Mercadoria', data.productDescription || data.description);
    add('Nº relacionado', data.orderNumber || data.cashLaunchOrderNumber);
  }

  return lines;
};

const validateField = (name: string, value: unknown, rule: FieldRule): string | null => {
  if (value === null && rule.nullable) return null;
  if (rule.type === 'string') {
    if (typeof value !== 'string') return `Campo "${name}": esperado ${expectedType(rule)}; recebido ${valueType(value)}.`;
    if (rule.maxLength && textLength(value) > rule.maxLength) {
      return `Campo "${name}": texto excede o limite de ${rule.maxLength} caracteres.`;
    }
    if (rule.values && !rule.values.includes(value)) {
      return `Campo "${name}": valor fora das opções permitidas (${rule.values.join(', ')}).`;
    }
    return null;
  }
  if (rule.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `Campo "${name}": esperado ${expectedType(rule)}; recebido ${valueType(value)}.`;
    }
    if ((rule.min !== undefined && value < rule.min) || (rule.max !== undefined && value > rule.max)) {
      return `Campo "${name}": número fora do intervalo permitido (${rule.min ?? '-∞'} a ${rule.max ?? '∞'}).`;
    }
    return null;
  }
  if (rule.type === 'boolean' && typeof value !== 'boolean') {
    return `Campo "${name}": esperado booleano; recebido ${valueType(value)}.`;
  }
  if (rule.type === 'map' && (!value || typeof value !== 'object' || Array.isArray(value))) {
    return `Campo "${name}": esperado objeto; recebido ${valueType(value)}.`;
  }
  return null;
};

const diagnoseMutation = (
  mutation: FirestoreReplayMutation,
  currentUserId?: string | null,
  relatedMutations: FirestoreReplayMutation[] = [mutation],
): ReplayMutationDiagnostic => {
  const path = mutation.path.join('/');
  const collection = mutation.path[2];
  const schema = collection ? collectionRules[collection] : undefined;
  const data = mutation.data;
  const fields = Object.entries(data).map(([name, value]) => {
    const rule = schema?.fields[name];
    return {
      name,
      type: valueType(value),
      note: rule ? `regra: ${expectedType(rule)}` : undefined,
    };
  });
  const violations: string[] = [];
  const limitations: string[] = [];

  if (!schema) {
    limitations.push('Ainda não há validador local para as regras desta coleção; os nomes e tipos são exibidos sem valores.');
    return {
      operation: mutation.operation,
      path,
      recordContext: describeRecordContext(mutation, relatedMutations),
      fields,
      violations,
      limitations,
    };
  }

  Object.keys(data).forEach((name) => {
    if (!schema.allowed.includes(name)) violations.push(`Campo "${name}": não está na lista permitida para ${collection}.`);
    const rule = schema.fields[name];
    if (rule) {
      const violation = validateField(name, data[name], rule);
      if (violation) violations.push(violation);
    }
  });

  const isFullSet = mutation.operation === 'set' && !mutation.merge;
  if (isFullSet) {
    schema.required.forEach((name) => {
      if (!(name in data)) violations.push(`Campo obrigatório "${name}" ausente na gravação integral.`);
    });
  }

  const pathUserId = mutation.path[1];
  if ('userId' in data && data.userId !== pathUserId) {
    violations.push('O campo "userId" não corresponde ao UID presente no caminho da gravação.');
  }
  if (currentUserId && pathUserId !== currentUserId) {
    violations.push('O UID do caminho desta gravação não corresponde à conta autenticada agora neste aparelho.');
  }
  if (mutation.path[0] !== 'users' || !pathUserId || mutation.path.length !== 4) {
    violations.push('O caminho não corresponde ao formato esperado users/{uid}/{coleção}/{documento}.');
  }

  limitations.push('Não é possível confirmar localmente se o perfil está ativo, se o userId já salvo no documento corresponde ao UID, nem o estado atual do documento no servidor.');
  if (!currentUserId) limitations.push('A conta autenticada atual ainda não está disponível para comparar com o UID do caminho.');
  if (mutation.operation === 'update' || mutation.merge) {
    limitations.push('Para atualização parcial, os campos obrigatórios e o formato final dependem também do documento existente no Firebase.');
  }
  return {
    operation: mutation.operation,
    path,
    recordContext: describeRecordContext(mutation, relatedMutations),
    fields,
    violations,
    limitations,
  };
};

export const diagnoseFirestoreReplay = (
  mutations: FirestoreReplayMutation[],
  currentUserId?: string | null,
): ReplayMutationDiagnostic[] => (
  mutations.map((mutation) => diagnoseMutation(mutation, currentUserId, mutations))
);
