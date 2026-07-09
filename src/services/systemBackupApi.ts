import { auth } from '../firebase';

type ApiResponse<T> = T & {
  error?: string;
  details?: unknown;
};

export type FullBackupRestoreResponse = {
  restoredAt: string;
  restoredByCollection: Record<string, number>;
  restoredTotal: number;
  skippedDocuments: number;
  mode: 'safe-merge';
  excludedCollections: string[];
};

export type FullBackupDownloadResult = {
  filename: string;
};

const backupBaseUrl = (
  import.meta.env.VITE_BACKUP_API_URL
  || import.meta.env.VITE_DATA_RESET_API_URL
  || import.meta.env.VITE_FISCAL_API_URL
  || import.meta.env.VITE_WHATSAPP_API_URL
  || ''
);

const buildUrl = (path: string) => `${backupBaseUrl}${path}`;

const getAuthHeaders = async (contentType = true) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Usuario nao autenticado.');
  }

  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
  };
};

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({})) as ApiResponse<T>;
  if (!response.ok) {
    throw new Error(payload.error || 'Nao foi possivel concluir a operacao de backup.');
  }
  return payload as T;
};

const getFilenameFromResponse = (response: Response) => {
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || `motofix-backup-geral-${new Date().toISOString().slice(0, 10)}.json`;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const readBackupFile = async (file: File) => {
  const text = await file.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Arquivo de backup invalido. Selecione um JSON gerado pelo MotoFix.');
  }
};

export const systemBackupApi = {
  async downloadFullBackup(): Promise<FullBackupDownloadResult> {
    const response = await fetch(buildUrl('/api/backup/full'), {
      method: 'GET',
      headers: await getAuthHeaders(false),
    });

    if (!response.ok) {
      await parseJsonResponse(response);
    }

    const filename = getFilenameFromResponse(response);
    const blob = await response.blob();
    downloadBlob(blob, filename);
    return { filename };
  },

  async restoreFullBackup(file: File) {
    const backup = await readBackupFile(file);
    const response = await fetch(buildUrl('/api/backup/full/restore'), {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ confirmation: 'RESTAURAR', backup }),
    });

    return parseJsonResponse<FullBackupRestoreResponse>(response);
  },
};
