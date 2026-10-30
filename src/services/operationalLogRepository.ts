import { collection, doc, setDoc } from 'firebase/firestore';
import type { OperationalLogAction, OperationalLogResult } from '../types';
import { db } from '../firebase';
import { createFirestoreReplayDescriptor, queueFirestoreVoidWrite } from './firestoreOfflineQueue';
import { isFirestoreNetworkEnabled } from './firestoreNetworkControl';

type OperationalLogInput = {
  userId: string;
  usuario?: string | null;
  oficina?: string | null;
  acao: OperationalLogAction;
  resultado?: OperationalLogResult;
  targetId?: string;
  details?: Record<string, unknown>;
};

const operationalLogCollectionPath = (userId: string) => collection(db, 'users', userId, 'operational_logs');

const operationalMetadataFields = new Set([
  'id', 'userId', 'createdAt', 'updatedAt', 'timestamp', 'orderNumber',
]);

const hasAuditValue = (value: unknown) => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
};

/** Returns changed field names only, so operational history never needs to store field values. */
export const getOperationalChangedFields = (
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
) => Object.keys(after).filter((field) => {
  if (operationalMetadataFields.has(field)) return false;
  if (!before) return hasAuditValue(after[field]);
  return JSON.stringify(before[field]) !== JSON.stringify(after[field]);
});

export const recordOperationalLog = ({
  userId,
  usuario,
  oficina,
  acao,
  resultado,
  targetId,
  details,
}: OperationalLogInput) => {
  const docRef = doc(operationalLogCollectionPath(userId));
  const isOffline = (typeof navigator !== 'undefined' && navigator.onLine === false)
    || !isFirestoreNetworkEnabled();
  const logData = {
    timestamp: new Date().toISOString(),
    usuario: usuario || userId,
    userId,
    oficina: oficina || 'Oficina nao informada',
    acao,
    resultado: resultado || (isOffline ? 'salvo_offline' : 'sucesso'),
    targetId: targetId || '',
    details: details || {},
  };

  void queueFirestoreVoidWrite(
    () => setDoc(docRef, logData),
    `Registrar log operacional: ${acao}`,
    createFirestoreReplayDescriptor(
      'set',
      ['users', userId, 'operational_logs', docRef.id],
      logData
    )
  ).catch((error) => {
    console.warn('Falha ao registrar log operacional:', error);
  });
};
