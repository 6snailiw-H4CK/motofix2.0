/** Shared metadata used by Firestore's change-only collection sync. */
export const firestoreSyncTimestamp = () => new Date().toISOString();

export const withFirestoreSyncTimestamp = <T extends object>(
  data: T,
  updatedAt = firestoreSyncTimestamp()
): T & { updatedAt: string } => ({
  ...data,
  updatedAt,
});
