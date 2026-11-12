import {ProviderCheckFailure} from './provider-health-check';

/** Rejects with a `timeout` failure if `work` takes longer; `work` is not cancelled. */
export async function withinTimeLimit<T>(
  work: Promise<T>,
  timeoutMs: number,
  what: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeLimit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new ProviderCheckFailure('timeout', `${what} took longer than ${timeoutMs} ms`),
        ),
      timeoutMs,
    );
  });
  return Promise.race([work, timeLimit]).finally(() => clearTimeout(timer));
}
