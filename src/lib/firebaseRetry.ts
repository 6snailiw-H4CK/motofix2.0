/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sistema de retry com backoff exponencial para lidar com erros de quota
 * Firebase Firestore retorna 429 (Too Many Requests) quando cota é excedida
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Executa função com retry e backoff exponencial
 * Útil para operações Firebase que podem sofrer com quota exceeded (429)
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Não retry se não for erro de quota
      const isQuotaError =
        lastError.message?.includes('429') ||
        lastError.message?.includes('resource-exhausted') ||
        lastError.message?.includes('Quota exceeded');

      const isLastAttempt = attempt === opts.maxAttempts - 1;

      if (!isQuotaError || isLastAttempt) {
        throw lastError;
      }

      // Calcular delay com jitter para evitar thundering herd
      const exponentialDelay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelayMs
      );
      const jitter = Math.random() * 0.1 * exponentialDelay;
      const delayMs = exponentialDelay + jitter;

      console.warn(
        `Firebase quota exceeded (attempt ${attempt + 1}/${opts.maxAttempts}). Retry em ${Math.round(delayMs)}ms...`
      );

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Detecta se erro é relacionado a quota/rate limiting
 */
export function isQuotaError(error: unknown): boolean {
  const errorStr = String(error);
  return (
    errorStr.includes('429') ||
    errorStr.includes('resource-exhausted') ||
    errorStr.includes('Quota exceeded') ||
    errorStr.includes('Too Many Requests')
  );
}

/**
 * Detecta se erro é relacionado a dados não encontrados (não deve retry)
 */
export function isNotFoundError(error: unknown): boolean {
  const errorStr = String(error);
  return (
    errorStr.includes('404') ||
    errorStr.includes('not-found') ||
    errorStr.includes('No document')
  );
}

/**
 * Calcula tempo de espera recomendado antes de próxima tentativa
 */
export function getRetryDelayMs(attemptNumber: number, maxDelayMs = 30000): number {
  const baseDelay = 100;
  const multiplier = 2;
  const exponentialDelay = Math.min(
    baseDelay * Math.pow(multiplier, attemptNumber),
    maxDelayMs
  );
  const jitter = Math.random() * 0.1 * exponentialDelay;
  return exponentialDelay + jitter;
}
