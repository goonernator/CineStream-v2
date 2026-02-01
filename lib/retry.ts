/**
 * Retry utility with exponential backoff
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryable?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryable: () => true, // Retry all errors by default
};

/**
 * Retries a function with exponential backoff
 * @param fn The async function to retry
 * @param options Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  let delay = config.initialDelay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!config.retryable(error)) {
        throw error;
      }

      // Don't wait after the last attempt
      if (attempt < config.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Creates a retryable fetch function
 * @param url The URL to fetch
 * @param options Fetch options
 * @param retryOptions Retry configuration
 * @returns The fetch response
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  return retryWithBackoff(
    async () => {
      const response = await fetch(url, options);
      if (!response.ok && response.status >= 500) {
        // Retry on server errors (5xx)
        throw new Error(`Server error: ${response.status}`);
      }
      return response;
    },
    {
      ...retryOptions,
      retryable: (error) => {
        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (error instanceof Error) {
          if (error.message.includes('Server error:')) {
            return true;
          }
          // Retry on network errors
          if (error.message.includes('fetch') || error.message.includes('network')) {
            return true;
          }
        }
        return retryOptions.retryable ? retryOptions.retryable(error) : false;
      },
    }
  );
}

