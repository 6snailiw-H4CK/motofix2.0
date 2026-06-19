import { collection, doc, setDoc } from 'firebase/firestore';
import type { OperationalLogAction, OperationalLogResult } from '../types';
import { db } from '../firebase';
import { queueFirestoreVoidWrite } from './firestoreOfflineQueue';

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
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  void queueFirestoreVoidWrite(
    () => setDoc(docRef, {
      timestamp: new Date().toISOString(),
      usuario: usuario || userId,
      userId,
      oficina: oficina || 'Oficina nao informada',
      acao,
      resultado: resultado || (isOffline ? 'salvo_offline' : 'sucesso'),
      targetId: targetId || '',
      details: details || {},
    }),
    `Registrar log operacional: ${acao}`
  ).catch((error) => {
    console.warn('Falha ao registrar log operacional:', error);
  });
};
