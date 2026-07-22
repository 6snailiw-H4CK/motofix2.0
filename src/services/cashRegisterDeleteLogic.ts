export type CashRegisterDeleteCandidate = {
  stockDeducted?: boolean;
  status?: string;
  invoiced?: boolean;
};

export const shouldUseStockRestoreOnDelete = (launch?: CashRegisterDeleteCandidate) => {
  if (!launch) return false;
  return Boolean(
    launch.stockDeducted === true
    || launch.status === 'Finalizado'
    || launch.invoiced === true
  );
};

export const buildFallbackFinalizedLaunchPayload = <T extends Record<string, unknown>>(
  data: T,
  userId: string,
  launchId: string,
  previousLaunch?: CashRegisterDeleteCandidate & { userId?: string; orderNumber?: string; createdAt?: string; updatedAt?: string; items?: unknown[] },
  now = new Date().toISOString()
) => ({
  ...data,
  userId: data.userId || previousLaunch?.userId || userId,
  orderNumber: data.orderNumber || previousLaunch?.orderNumber || `LC-${launchId}`,
  createdAt: data.createdAt || previousLaunch?.createdAt || now,
  updatedAt: data.updatedAt || now,
  status: data.status || previousLaunch?.status || 'Finalizado',
  items: data.items || previousLaunch?.items || [],
  stockDeducted: true,
  stockDeductedAt: now,
  stockMovementBatchId: `fallback-${launchId}`,
});
