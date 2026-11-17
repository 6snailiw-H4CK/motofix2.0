export type BackupEndpointEnvironment = 'development' | 'production' | 'test';

export type BackupEndpointOptions = {
  /** The only supported endpoint override. Legacy integration URLs are intentionally not accepted. */
  backupApiUrl?: string | null;
  environment: BackupEndpointEnvironment;
};

/**
 * Resolves the base URL for the dedicated /api/backup routes.
 * Production defaults to the same-origin Firebase Hosting rewrite. Development must
 * explicitly configure a backend origin or '/' for a local same-origin proxy.
 */
export const resolveBackupApiBaseUrl = ({ backupApiUrl, environment }: BackupEndpointOptions): string => {
  const configured = backupApiUrl?.trim();
  if (!configured) {
    if (environment === 'production') return '';
    throw new Error('Configure VITE_BACKUP_API_URL para usar o backup neste ambiente; não existe fallback para outras APIs.');
  }

  if (configured === '/') return '';
  if (configured.startsWith('/')) {
    if (configured.startsWith('//') || configured.includes('?') || configured.includes('#')) {
      throw new Error('VITE_BACKUP_API_URL deve ser uma origem HTTP(S) ou a raiz relativa / do proxy de backup.');
    }
    throw new Error('Para proxy same-origin, configure VITE_BACKUP_API_URL=/; as rotas /api/backup são anexadas automaticamente.');
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('VITE_BACKUP_API_URL não é uma URL válida.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.search || parsed.hash) {
    throw new Error('VITE_BACKUP_API_URL deve usar HTTP(S), sem credenciais, query ou fragmento.');
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
};

export const validateBackupSourceProject = (sourceProjectId: unknown, expectedProjectId: string): string => {
  if (typeof sourceProjectId !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(sourceProjectId)) {
    throw new Error('A API de backup retornou um ID de projeto de origem inválido. Nenhum backup foi gerado.');
  }
  if (!expectedProjectId || sourceProjectId !== expectedProjectId) {
    throw new Error('O projeto de origem informado pela API de backup não corresponde ao projeto Firebase configurado no aplicativo. Nenhum backup foi gerado.');
  }
  return sourceProjectId;
};
