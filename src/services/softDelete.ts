import { firestoreSyncTimestamp } from './firestoreSyncFields';

export type SoftDeleteMetadata = {
  deletedAt: string | null;
  deletedBy: string | null;
  deletedReason: string | null;
  resetAt?: string | null;
  resetId?: string | null;
  updatedAt: string;
};

export const createSoftDeleteMetadata = (
  deletedBy: string,
  deletedReason = 'Exclusao solicitada pelo usuario'
): SoftDeleteMetadata => ({
  deletedAt: new Date().toISOString(),
  deletedBy,
  deletedReason,
  updatedAt: firestoreSyncTimestamp(),
});

export const createRestoreMetadata = (): SoftDeleteMetadata => ({
  deletedAt: null,
  deletedBy: null,
  deletedReason: null,
  updatedAt: firestoreSyncTimestamp(),
});

export const isSoftDeleted = (value: unknown) => Boolean(
  value
  && typeof value === 'object'
  && (value as { deletedAt?: unknown }).deletedAt
);
