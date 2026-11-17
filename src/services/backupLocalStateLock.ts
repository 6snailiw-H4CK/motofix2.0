/** Coordinates every browser-local business-state write with a complete backup. */
export const MOTOFIX_LOCAL_STATE_LOCK = 'motofix:local-state:v1';
export const BACKUP_PEER_PROTOCOL_VERSION = 1;
const PEER_PROBE_TIMEOUT_MS = 1800;

type LockManagerLike = Pick<LockManager, 'request'>;

const getLockManager = (): LockManagerLike | null => {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return null;
  return navigator.locks;
};

/** Ordinary writes remain usable on browsers without Web Locks; complete backups fail closed there. */
export const withLocalStateMutation = async <T,>(operation: () => T | Promise<T>): Promise<T> => {
  const locks = getLockManager();
  if (!locks) return operation();
  return locks.request(MOTOFIX_LOCAL_STATE_LOCK, { mode: 'exclusive' }, operation);
};

const probeServiceWorkerPeers = async (): Promise<void> => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Backup completo bloqueado: não foi possível verificar as outras abas do MotoFix.');
  }
  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    throw new Error('Backup completo bloqueado: o Service Worker ainda não controla esta aba. Recarregue após a atualização do aplicativo.');
  }

  const channel = new MessageChannel();
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  try {
    const response = new Promise<{ ok?: boolean; message?: string }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Uma aba do MotoFix não confirmou o protocolo de proteção do backup. Feche ou atualize as abas e tente novamente.')), PEER_PROBE_TIMEOUT_MS);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data || {});
      };
      channel.port1.onmessageerror = () => {
        clearTimeout(timeout);
        reject(new Error('Não foi possível verificar com segurança as outras abas do MotoFix.'));
      };
    });
    controller.postMessage({ type: 'motofix:backup-peer-audit', requestId, protocolVersion: BACKUP_PEER_PROTOCOL_VERSION }, [channel.port2]);
    const result = await response;
    if (result.ok !== true) throw new Error(result.message || 'Uma aba aberta não confirmou a proteção contra gravações durante o backup.');
  } finally {
    channel.port1.close();
  }
};

/** Must wrap the entire read, stability check, manifest creation, and encryption operation. */
export const withCompleteBackupStateLock = async <T,>(operation: () => T | Promise<T>): Promise<T> => {
  const locks = getLockManager();
  if (!locks) throw new Error('Backup completo bloqueado: este navegador não oferece Web Locks para coordenar as abas.');
  return locks.request(MOTOFIX_LOCAL_STATE_LOCK, { mode: 'exclusive' }, async () => {
    await probeServiceWorkerPeers();
    return operation();
  });
};

/** Every current app tab responds; stale/uncooperative tabs intentionally make complete backup unavailable. */
export const registerBackupPeerProbeResponder = () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || typeof window === 'undefined') return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const message = event.data as { type?: unknown; protocolVersion?: unknown } | null;
    if (message?.type !== 'motofix:backup-peer-audit') return;
    const port = event.ports[0];
    if (!port) return;
    const supported = message.protocolVersion === BACKUP_PEER_PROTOCOL_VERSION && Boolean(getLockManager());
    port.postMessage({
      ok: supported,
      protocolVersion: BACKUP_PEER_PROTOCOL_VERSION,
      message: supported ? undefined : 'Esta aba não oferece o protocolo atual de proteção do backup.',
    });
    port.close();
  });
};
