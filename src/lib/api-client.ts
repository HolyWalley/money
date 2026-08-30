import type { User } from '../contexts/AuthContext';
import { reportRequestOutcome } from './network-status';

/**
 * Why a request did not succeed. `undefined` when `ok === true`.
 *
 * THE RULE FOR EVERY CONSUMER: only 'auth' means "the server positively
 * rejected this identity". Everything else must leave cached state intact.
 */
export type ApiFailure =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'server'
  | 'client'
  | 'parse';

export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  errors?: string[];
  status: number;
  failure?: ApiFailure;
  retryAfterMs?: number;
};

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** null disables the deadline entirely. Default: API_TIMEOUTS.default. */
  timeoutMs?: number | null;
};

export const API_TIMEOUTS = {
  default: 10_000,
  auth: 8_000,
  syncPull: 30_000,
  syncPush: 45_000,
  syncInitialPush: 120_000,
  debug: 30_000,
} as const;

export function isRetryableFailure(failure: ApiFailure | undefined): boolean {
  return failure === 'network' || failure === 'timeout' || failure === 'server' || failure === 'parse';
}

export type SyncUpdate = {
  update: Uint8Array | string;
  timestamp: number;
  deviceId: string;
  created_at?: number;
  id?: number;
};

export type SyncPullQuery = {
  sinceId?: number;
  since?: number;
};

export type SyncResponse = {
  updates: SyncUpdate[];
  /**
   * Absent when talking to a worker that predates the id cursor, in which case
   * clients must fall back to the created_at cursor.
   */
  latestId?: number;
};

type RefreshOutcome = 'refreshed' | 'rejected' | 'unavailable';

const PUBLIC_ENDPOINTS = new Set(['/refresh', '/signin', '/signup']);

const MAX_RETRY_AFTER_MS = 120_000;

class TimeoutError extends Error {
  constructor() {
    super('Request timed out');
    this.name = 'TimeoutError';
  }
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  // Only the delta-seconds form; the HTTP-date form is deliberately ignored
  // because a skewed client clock turns it into an arbitrary delay.
  if (!/^\d+$/.test(trimmed)) return undefined;
  return Math.min(Number(trimmed) * 1000, MAX_RETRY_AFTER_MS);
}

class ApiClient {
  private baseUrl = '/api/v1';
  private isRefreshing = false;
  private refreshPromise: Promise<RefreshOutcome> | null = null;

  private async attempt<T>(
    url: string,
    init: RequestInit,
    timeoutMs: number | null,
    callerSignal?: AbortSignal
  ): Promise<{ response: Response; parsed: ApiResponse<T> }> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = timeoutMs === null ? null : setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    callerSignal?.addEventListener('abort', onCallerAbort);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      // The timer is still live here on purpose: a poor connection stalls in the
      // BODY, not the headers, so the deadline must cover handleResponse too.
      const parsed = await this.handleResponse<T>(response);
      // Aborting mid-body makes response.json() reject, which handleResponse
      // reports as an unreadable body; the honest reason is our own deadline.
      if (timedOut && parsed.failure === 'parse') throw new TimeoutError();
      return { response, parsed };
    } catch (error) {
      throw timedOut ? new TimeoutError() : error;
    } finally {
      if (timer) clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const timeoutMs = options.timeoutMs === undefined ? API_TIMEOUTS.default : options.timeoutMs;
    const init: RequestInit = {
      method: options.method || 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    };

    try {
      const first = await this.attempt<T>(url, init, timeoutMs, options.signal);

      if (first.response.status === 401 && !PUBLIC_ENDPOINTS.has(endpoint)) {
        const outcome = await this.attemptRefresh();
        if (outcome === 'refreshed') {
          const retry = await this.attempt<T>(url, init, timeoutMs, options.signal);
          return this.finish(retry.parsed);
        }
        if (outcome === 'rejected') {
          return this.finish({ ...first.parsed, ok: false, status: 401, failure: 'auth' });
        }
        // 'unavailable': we could not reach the server to renew the session. This
        // must NOT look like a rejection, or a flaky link ends the offline session.
        return this.finish({
          ok: false,
          status: 0,
          failure: 'network',
          error: 'Could not reach the server to refresh your session',
        });
      }

      return this.finish(first.parsed);
    } catch (error) {
      const failure: ApiFailure = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network';
      return this.finish({
        ok: false,
        status: 0,
        failure,
        error: failure === 'timeout' ? 'Request timed out' : 'Network error',
      });
    }
  }

  private finish<T>(response: ApiResponse<T>): ApiResponse<T> {
    const failure = response.failure;
    const transportFailed = failure === 'network' || failure === 'timeout' || failure === 'parse';
    reportRequestOutcome(transportFailed ? 'network-failure' : 'success');
    return response;
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const contentType = response.headers.get('content-type');
    const isJson = !!contentType && contentType.includes('application/json');

    if (response.ok) {
      if (response.status === 204) {
        return { ok: true, status: response.status };
      }
      // A 200 with an HTML body is a captive portal, an intercepting proxy, or a
      // service worker serving the app shell - never a real API response. Reporting
      // it as a success with no data is what used to route it into setUser(null).
      if (!isJson) {
        return { ok: false, status: response.status, failure: 'parse', error: 'Unexpected response from server' };
      }

      let result: { success?: boolean; data?: T; error?: string; errors?: string[] };
      try {
        result = await response.json() as { success?: boolean; data?: T; error?: string; errors?: string[] };
      } catch {
        return { ok: false, status: response.status, failure: 'parse', error: 'Malformed response from server' };
      }

      if (result.success === true) {
        return { ok: true, data: result.data, status: response.status };
      }
      if (result.success === false) {
        return {
          ok: false,
          error: result.error || 'Request failed',
          errors: result.errors,
          status: response.status,
          failure: 'client',
        };
      }
      return { ok: false, status: response.status, failure: 'parse', error: 'Unexpected response from server' };
    }

    let error = `Request failed with status ${response.status}`;
    let errors: string[] | undefined;
    if (isJson) {
      try {
        const body = await response.json() as { error?: string; message?: string; errors?: string[] };
        error = body.error || body.message || error;
        errors = body.errors;
      } catch {
        // Keep the status-derived message.
      }
    }

    const status = response.status;
    const failure: ApiFailure = status === 401 ? 'auth' : (status === 429 || status >= 500) ? 'server' : 'client';
    const retryAfterMs = (status === 429 || status === 503)
      ? parseRetryAfterMs(response.headers.get('retry-after'))
      : undefined;

    return {
      ok: false,
      error,
      errors,
      status,
      failure,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    };
  }

  private async attemptRefresh(): Promise<RefreshOutcome> {
    // Prevent multiple simultaneous refresh attempts
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.doRefresh();

    try {
      return await this.refreshPromise;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<RefreshOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUTS.auth);

    try {
      const response = await fetch(`${this.baseUrl}/refresh`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      });
      if (response.ok) return 'refreshed';
      const isJson = response.headers.get('content-type')?.includes('application/json');
      // Only an explicit 401 with a real API body means the server looked at the
      // refresh cookie and said no. 403 (security block), 429 and 5xx must not.
      return response.status === 401 && isJson ? 'rejected' : 'unavailable';
    } catch {
      return 'unavailable';
    } finally {
      clearTimeout(timer);
    }
  }

  // Auth endpoints
  async checkAuth(): Promise<ApiResponse<User>> {
    return this.request<{ user: User }>('/me', { timeoutMs: API_TIMEOUTS.auth }).then(response => ({
      ...response,
      data: response.data?.user
    }));
  }

  async signin(username: string, password: string): Promise<ApiResponse<User>> {
    return this.request<{ user: User }>('/signin', {
      method: 'POST',
      body: { username, password },
    }).then(response => ({
      ...response,
      data: response.data?.user
    }));
  }

  async signup(username: string, password: string): Promise<ApiResponse<User>> {
    return this.request<{ user: User }>('/signup', {
      method: 'POST',
      body: { username, password },
    }).then(response => ({
      ...response,
      data: response.data?.user,
      error: response.errors?.join(', ') || response.error
    }));
  }

  async signout(): Promise<ApiResponse<void>> {
    return this.request<void>('/signout', {
      method: 'POST',
    });
  }

  async updateUser(updates: { settings?: { defaultCurrency?: string } }): Promise<ApiResponse<{ user: User }>> {
    return this.request<{ user: User }>('/me', {
      method: 'PUT',
      body: updates,
    });
  }

  // Sync endpoints
  async pushSync(updates: SyncUpdate[], options?: { timeoutMs?: number }): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>('/sync', {
      method: 'PUT',
      body: updates,
      timeoutMs: options?.timeoutMs ?? API_TIMEOUTS.syncPush,
    });
  }

  async pullSync(query?: SyncPullQuery): Promise<ApiResponse<SyncResponse>> {
    let endpoint = '/sync';
    if (query?.sinceId !== undefined) {
      endpoint = `/sync?sinceId=${String(query.sinceId)}`;
    } else if (query?.since !== undefined) {
      endpoint = `/sync?since=${String(query.since)}`;
    }
    return this.request<SyncResponse>(endpoint, { timeoutMs: API_TIMEOUTS.syncPull });
  }

  // Debug endpoint
  async getDebugInfo(): Promise<ApiResponse<{
    durableObject: {
      userId: string;
      storageSizes: {
        updatesTableBytes: number;
        compiledStateBytes: number;
        totalBytes: number;
      };
      updateStatistics: {
        count: number;
        totalBytes: number;
        minSize: number;
        maxSize: number;
        avgSize: number;
        medianSize: number;
        distribution: { range: string; count: number }[];
      };
    };
  }>> {
    return this.request('/debug', { timeoutMs: API_TIMEOUTS.debug });
  }

  // Download database dump (returns a URL for streaming download)
  getDatabaseDumpUrl(): string {
    return `${this.baseUrl}/dump`;
  }

  // Import database from dump
  async importDatabaseDump(dumpFile: File): Promise<ApiResponse<{
    message: string;
    updatesImported: number;
    hasCompiledState: boolean;
  }>> {
    const text = await dumpFile.text();
    const url = `${this.baseUrl}/dump`;

    try {
      // No deadline: the dump is a user-chosen file of arbitrary size with its
      // own progress UI.
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-ndjson'
        },
        body: text
      });

      return this.finish(await this.handleResponse(response));
    } catch (error) {
      console.error('Request error:', error);
      return this.finish({
        ok: false,
        error: 'Network error occurred',
        status: 0,
        failure: 'network',
      });
    }
  }

  // Cleanup old updates
  async cleanupOldUpdates(): Promise<ApiResponse<{
    message: string;
    deletedCount: number;
    remainingBytes: number;
    remainingKB: string;
    remainingMB: string;
  }>> {
    return this.request('/cleanup', {
      method: 'POST',
      timeoutMs: API_TIMEOUTS.debug,
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
