import { createStorageKeys } from './storage.js';
import type { CheckResponse, RuntimeMetadata, StorageAdapter, VibeUpdateError } from './types.js';
import { parseCheckResponse } from './validation.js';

interface CachedCheck {
  etag: string | null;
  response: CheckResponse;
}

export interface CheckApiOptions {
  appId: string;
  apiUrl: string;
  timeoutMs: number;
  metadata: RuntimeMetadata;
  storage: StorageAdapter;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  onError?: (error: VibeUpdateError) => void;
  now?: () => number;
}

export interface CheckApiResult {
  response: CheckResponse;
  checkedAt: number;
  fromCache: boolean;
}

function report(options: CheckApiOptions, error: VibeUpdateError): null {
  try { options.onError?.(error); } catch { /* Host callbacks must not break fail-open behavior. */ }
  return null;
}

async function readCache(storage: StorageAdapter, key: string): Promise<CachedCheck | null> {
  try {
    const raw = await storage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    const response = parseCheckResponse(record.response);
    const etag = record.etag;
    return response !== null && (typeof etag === 'string' || etag === null) ? { response, etag } : null;
  } catch {
    return null;
  }
}

function endpoint(options: CheckApiOptions): URL | null {
  try {
    const base = new URL(options.apiUrl);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && (base.hostname === 'localhost' || base.hostname === '127.0.0.1'))) return null;
    const url = new URL(`/api/v1/sdk/apps/${encodeURIComponent(options.appId.trim())}/check`, base);
    const metadata = options.metadata;
    url.search = new URLSearchParams({
      platform: metadata.platform,
      nativeApplicationId: metadata.nativeApplicationId,
      buildNumber: String(metadata.buildNumber),
      version: metadata.version,
      locale: metadata.locale,
    }).toString();
    return url;
  } catch {
    return null;
  }
}

export async function checkApi(options: CheckApiOptions): Promise<CheckApiResult | null> {
  const url = endpoint(options);
  if (url === null || !/^app_[A-Za-z0-9_-]+$/.test(options.appId.trim()) || !Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    return report(options, { code: 'invalid-config', message: 'VibeUpdate received an invalid appId, apiUrl, or timeout.' });
  }
  const keys = createStorageKeys(options.appId, options.metadata.platform, options.metadata.buildNumber, 0);
  const cached = await readCache(options.storage, keys.cache);
  const controller = new AbortController();
  const abort = (): void => { controller.abort(); };
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  let didTimeout = false;
  const timer = setTimeout(() => { didTimeout = true; controller.abort(); }, options.timeoutMs);
  try {
    const headers = new Headers({ Accept: 'application/json' });
    if (cached?.etag) headers.set('If-None-Match', cached.etag);
    const response = await (options.fetcher ?? fetch)(url, { method: 'GET', headers, signal: controller.signal });
    const checkedAt = (options.now ?? Date.now)();
    if (response.status === 304) {
      if (cached === null) return report(options, { code: 'invalid-response', message: 'VibeUpdate received 304 without a cached response.' });
      try {
        await options.storage.setItem(keys.lastSuccess, String(checkedAt));
      } catch (cause) {
        report(options, { code: 'storage', message: 'VibeUpdate could not persist the last successful check.', cause });
      }
      return { response: cached.response, checkedAt, fromCache: true };
    }
    if (!response.ok) {
      const likelyConfigurationError = response.status === 400 || response.status === 404;
      return report(options, {
        code: likelyConfigurationError ? 'invalid-config' : 'http',
        message: likelyConfigurationError
          ? `VibeUpdate rejected the SDK check parameters or app configuration (HTTP ${response.status}).`
          : `VibeUpdate request failed with HTTP ${response.status}.`,
        status: response.status,
      });
    }
    let body: unknown;
    try { body = await response.json(); } catch (cause) {
      return report(options, { code: 'invalid-response', message: 'VibeUpdate returned invalid JSON.', cause });
    }
    const parsed = parseCheckResponse(body);
    if (parsed === null) return report(options, { code: 'invalid-response', message: 'VibeUpdate returned an invalid response.' });
    if (parsed.changelog !== null && parsed.changelog.buildNumber !== options.metadata.buildNumber) {
      return report(options, { code: 'invalid-response', message: 'VibeUpdate returned a changelog for a different installed build.' });
    }
    if (parsed.update !== null && parsed.update.targetBuildNumber <= options.metadata.buildNumber) {
      return report(options, { code: 'invalid-response', message: 'VibeUpdate returned an update that is not newer than the installed build.' });
    }
    const etag = response.headers.get('ETag');
    try {
      await Promise.all([
        options.storage.setItem(keys.cache, JSON.stringify({ etag, response: parsed } satisfies CachedCheck)),
        options.storage.setItem(keys.lastSuccess, String(checkedAt)),
      ]);
    } catch (cause) {
      report(options, { code: 'storage', message: 'VibeUpdate could not persist the SDK check.', cause });
    }
    return { response: parsed, checkedAt, fromCache: false };
  } catch (cause) {
    if (options.signal?.aborted && !didTimeout) return null;
    return report(options, didTimeout
      ? { code: 'timeout', message: `VibeUpdate timed out after ${options.timeoutMs}ms.`, cause }
      : { code: 'network', message: 'VibeUpdate could not reach the update service.', cause });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
