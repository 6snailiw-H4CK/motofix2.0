import type { PortableImportPlan, PlannedImportDocument } from './portableImportPlan';

export type DestinationImportPreflight = {
  sourceWorkshopId: string;
  destinationProjectId: string;
  destinationUid: string;
  destinationAdminUid: string;
  destinationAuthorized: boolean;
  targetEmpty: boolean;
  destinationCounts: Record<string, number>;
  otherCollectionCounts: Record<string, number>;
  totalExisting: number;
  importable: boolean;
  resumable: boolean;
  existingImportStatus: string | null;
  activeImportId: string | null;
  lockExpiresAt: string | null;
  lockSessionStatus: string | null;
  recoveryRequired: boolean;
  recoveryMessage: string | null;
  staleLockCanBeReleased: boolean;
  writesPerformed: false;
  profileAndPermissionsWillBeImported: false;
};

export type DestinationImportResult = {
  importId: string;
  status: 'completed' | 'interrupted' | 'verification_failed' | 'recovery_required';
  verified: boolean;
  documentsVerified: number;
  mismatchCount: number;
  verifiedPlanSha256?: string | null;
  recoveryRequired?: boolean;
  recoveryMessage?: string;
  resumed?: boolean;
};

export type DestinationImportProgress = { stage: string; completed?: number; total?: number };

export interface BackupDestinationAdapter {
  readonly projectId: string;
  readonly uid: string;
  inspect(plan: PortableImportPlan): Promise<DestinationImportPreflight>;
  import(plan: PortableImportPlan, confirmation: string, onProgress?: (progress: DestinationImportProgress) => void): Promise<DestinationImportResult>;
}

type FirebaseFunctionDestinationOptions = {
  projectId: string;
  uid: string;
  getIdToken: () => Promise<string>;
  emulatorBaseUrl?: string;
  fetchImpl?: typeof fetch;
};

type ApiResponse<T> = T & { error?: string };
type ImportSession = {
  importId: string;
  status: 'running' | 'verifying' | 'completed' | 'interrupted' | 'verification_failed' | 'recovery_required';
  nextChunkIndex: number;
  expectedChunks: number;
  documentsWritten: number;
  resumed: boolean;
};

const MAX_CHUNK_DOCUMENTS = 150;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const isSafeProjectId = (projectId: string) => /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId);

const parseTokenProjectId = (token: string) => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { aud?: string; iss?: string };
    return claims.aud && claims.iss === `https://securetoken.google.com/${claims.aud}` ? claims.aud : null;
  } catch {
    return null;
  }
};

const createChunks = (documents: PlannedImportDocument[]) => {
  const chunks: Array<{ collection: string; documents: Array<Record<string, unknown>> }> = [];
  let current: Array<Record<string, unknown>> = [];
  let currentCollection = '';
  let currentBytes = 2;
  const flush = () => {
    if (!current.length) return;
    chunks.push({ collection: currentCollection, documents: current });
    current = [];
    currentCollection = '';
    currentBytes = 2;
  };

  for (const document of documents) {
    const bytes = new TextEncoder().encode(JSON.stringify(document.data)).byteLength + 1;
    if (current.length && (currentCollection !== document.collection
      || current.length >= MAX_CHUNK_DOCUMENTS || currentBytes + bytes > MAX_CHUNK_BYTES)) flush();
    if (bytes > MAX_CHUNK_BYTES) throw new Error(`O documento ${document.collection}/${document.id} excede o limite do lote de importação.`);
    currentCollection = document.collection;
    current.push(document.data);
    currentBytes += bytes;
  }
  flush();
  return chunks;
};

export const createFirebaseFunctionDestinationAdapter = (
  options: FirebaseFunctionDestinationOptions,
): BackupDestinationAdapter => {
  const projectId = options.projectId.trim();
  if (!isSafeProjectId(projectId)) throw new Error('O ID do projeto Firebase de destino é inválido.');
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(options.uid)) throw new Error('A identidade autenticada no destino é inválida.');

  const baseUrl = options.emulatorBaseUrl
    ? (() => {
      const emulatorUrl = new URL(options.emulatorBaseUrl);
      if (!['localhost', '127.0.0.1'].includes(emulatorUrl.hostname)
        || emulatorUrl.protocol !== 'http:'
        || !emulatorUrl.pathname.includes(`/${projectId}/us-central1/backupApi`)) {
        throw new Error('A URL do emulador precisa apontar para localhost e para o projeto Firebase de destino selecionado.');
      }
      return emulatorUrl.toString().replace(/\/$/, '');
    })()
    : `https://us-central1-${projectId}.cloudfunctions.net/backupApi`;
  const fetcher = options.fetchImpl || fetch;

  const request = async <T>(path: string, body?: unknown): Promise<T> => {
    const token = await options.getIdToken();
    if (parseTokenProjectId(token) !== projectId) {
      throw new Error('A sessão autenticada pertence a outro projeto Firebase; os dados não foram enviados.');
    }
    const response = await fetcher(`${baseUrl}/api/backup/import${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error('A API de importação do projeto de destino não respondeu JSON. Verifique se as Functions foram implantadas nele.');
    }
    const payload = await response.json().catch(() => ({})) as ApiResponse<T>;
    if (!response.ok) throw new Error(payload.error || `A API do destino respondeu HTTP ${response.status}.`);
    return payload as T;
  };

  return {
    projectId,
    uid: options.uid,
    async inspect(plan) {
      if (plan.destinationProjectId !== projectId || plan.destinationUid !== options.uid) {
        throw new Error('O plano de importação foi preparado para outra identidade de destino.');
      }
      return request<DestinationImportPreflight>('/plan', {
        sourceWorkshopId: plan.sourceWorkshopId,
        sourceProjectId: plan.sourceProjectId,
        dataSha256: plan.dataSha256,
        plannedDataSha256: plan.plannedDataSha256,
        counts: plan.counts,
      });
    },
    async import(plan, confirmation, onProgress) {
      if (!plan.canImport) throw new Error('O plano tem erros. Corrija-os antes de iniciar a importação.');
      if (plan.destinationProjectId !== projectId || plan.destinationUid !== options.uid) {
        throw new Error('O plano de importação foi preparado para outra identidade de destino.');
      }
      if (confirmation !== 'IMPORTAR NO DESTINO') throw new Error('Digite IMPORTAR NO DESTINO para confirmar.');
      const chunks = createChunks(plan.documents);
      const session = await request<ImportSession>('/start', {
        confirmation,
        sourceWorkshopId: plan.sourceWorkshopId,
        sourceProjectId: plan.sourceProjectId,
        dataSha256: plan.dataSha256,
        plannedDataSha256: plan.plannedDataSha256,
        counts: plan.counts,
        totalChunks: chunks.length,
      });
      if (session.status === 'completed') {
        const result = await request<DestinationImportResult>('/finalize', {
          importId: session.importId,
          sourceWorkshopId: plan.sourceWorkshopId,
          sourceProjectId: plan.sourceProjectId,
          dataSha256: plan.dataSha256,
          plannedDataSha256: plan.plannedDataSha256,
        });
        if (result.verified !== true || result.verifiedPlanSha256 !== plan.plannedDataSha256) {
          throw new Error(result.recoveryMessage || 'O destino não confirmou a igualdade integral com o plano remapeado.');
        }
        return result;
      }
      for (let index = session.nextChunkIndex; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        const response = await request<{ restored: number; nextChunkIndex: number }>('/chunk', {
          importId: session.importId,
          sourceWorkshopId: plan.sourceWorkshopId,
          sourceProjectId: plan.sourceProjectId,
          dataSha256: plan.dataSha256,
          plannedDataSha256: plan.plannedDataSha256,
          chunkIndex: index,
          collection: chunk.collection,
          documents: chunk.documents,
        });
        if (response.restored !== chunk.documents.length || response.nextChunkIndex !== index + 1) {
          throw new Error(`A confirmação do lote ${index + 1} divergiu. A sessão pode ser retomada com o mesmo arquivo.`);
        }
        onProgress?.({ stage: `Importando ${chunk.collection}`, completed: index + 1, total: chunks.length });
      }
      onProgress?.({ stage: 'Verificando conteúdo, propriedade e checkpoints no destino.' });
      const result = await request<DestinationImportResult>('/finalize', {
        importId: session.importId,
        sourceWorkshopId: plan.sourceWorkshopId,
        sourceProjectId: plan.sourceProjectId,
        dataSha256: plan.dataSha256,
        plannedDataSha256: plan.plannedDataSha256,
      });
      if (result.status !== 'completed' || result.verified !== true || result.documentsVerified !== plan.totalDocuments
        || result.verifiedPlanSha256 !== plan.plannedDataSha256) {
        throw new Error(result.recoveryMessage || 'A importação não passou pela verificação final integral do destino; a sessão permanece protegida para recuperação.');
      }
      return result;
    },
  };
};
