export interface ApiRequestLogger {
  route: string;
  query: <T>(label: string, fn: () => PromiseLike<T>) => Promise<T>;
  finish: (details?: Record<string, unknown>) => void;
  fail: (error: unknown) => void;
}

function elapsed(startedAt: number): number {
  return Date.now() - startedAt;
}

export function startApiRequest(
  route: string,
  details?: Record<string, unknown>,
): ApiRequestLogger {
  const requestStartedAt = Date.now();
  console.log(`[api] ${route} request_start`, {
    startedAt: new Date(requestStartedAt).toISOString(),
    ...details,
  });

  return {
    route,
    async query<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
      const queryStartedAt = Date.now();
      console.log(`[api] ${route} query_start`, {
        label,
        at: new Date(queryStartedAt).toISOString(),
      });
      try {
        const result = await Promise.resolve(fn());
        console.log(`[api] ${route} query_end`, {
          label,
          durationMs: elapsed(queryStartedAt),
        });
        return result;
      } catch (error) {
        console.error(`[api] ${route} query_error`, {
          label,
          durationMs: elapsed(queryStartedAt),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    finish(extra?: Record<string, unknown>) {
      console.log(`[api] ${route} request_end`, {
        durationMs: elapsed(requestStartedAt),
        ...extra,
      });
    },
    fail(error: unknown) {
      console.error(`[api] ${route} request_error`, {
        durationMs: elapsed(requestStartedAt),
        error: error instanceof Error ? error.message : String(error),
      });
    },
  };
}
