export type SoftDeleteMetadata = {
  deletedAt: string | null;
  deletedBy: string | null;
  deletedReason: string | null;
};

export const createSoftDeleteMetadata = (
  deletedBy: string,
  deletedReason = 'Exclusao solicitada pelo usuario'
): SoftDeleteMetadata => ({
  deletedAt: new Date().toISOString(),
  deletedBy,
  deletedReason,
});

export const createRestoreMetadata = (): SoftDeleteMetadata => ({
  deletedAt: null,
  deletedBy: null,
  deletedReason: null,
});

export const isSoftDeleted = (value: unknown) => Boolean(
  value
  && typeof value === 'object'
  && (value as { deletedAt?: unknown }).deletedAt
);
