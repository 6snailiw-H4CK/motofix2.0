import { getFirestoreOfflineQueueState } from './firestoreOfflineQueue';
import { isFirestoreNetworkEnabled } from './firestoreNetworkControl';

/**
 * A browser network connection is not proof that Firestore accepted a write.
 * The app intentionally pauses Firestore between explicit sync sessions, so
 * success messages must reflect the durable local queue until the server has
 * acknowledged all queued writes.
 */
export const getFirestoreSaveResultMessage = (remoteConfirmedMessage: string) => {
  const queue = getFirestoreOfflineQueueState();

  if (queue.lastPersistenceError) {
    return 'A alteração não teve confirmação de gravação local durável. Mantenha este aparelho e esta aba; confira Configurações > Sincronização.';
  }

  if (!isFirestoreNetworkEnabled() || queue.pendingWrites > 0 || queue.failedWrites > 0) {
    if (queue.failedWrites > 0) {
      return `Alteração processada neste aparelho. Há ${queue.failedWrites} gravação(ões) sem confirmação do Firebase; confira Configurações > Sincronização.`;
    }

    const pending = queue.pendingWrites;
    return pending > 0
      ? `Salvo neste aparelho; ${pending} gravação(ões) ainda aguardam confirmação do Firebase. Clique em Sincronizar.`
      : 'Salvo neste aparelho; ainda não foi enviado ao Firebase. Clique em Sincronizar.';
  }

  return `${remoteConfirmedMessage} Confirmado pelo Firebase.`;
};
