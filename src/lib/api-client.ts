import type { User } from '../contexts/AuthContext';

type SyncUpdate = {
  update: Uint8Array | number[];
  timestamp: number;
  deviceId: string;
  created_at?: number;
};

type SyncResponse = {
  updates: SyncUpdate[];
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  errors?: string[];
  status: number;
};

class ApiClient {
  private baseUrl = '/api/v1';
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const makeRequest = () => {
      const config: RequestInit = {
        method: options.method || 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: options.signal,
      };

      if (options.body !== undefined) {
        config.body = JSON.stringify(options.body);
      }

      return fetch(url, config);
    };

    try {
      const response = await makeRequest();

      // Handle 401 with retry logic
      if (response.status === 401 && endpoint !== '/refresh') {
        const refreshSuccess = await this.attemptRefresh();
        if (refreshSuccess) {
          // Retry the original request with fresh config
          const retryResponse = await makeRequest();
          return this.handleResponse<T>(retryResponse);
        }
      }

      return this.handleResponse<T>(response);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Network error',
        status: 0,
      };
    }
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');

    if (response.ok) {
      if (response.status === 204 || !isJson) {
        return { ok: true, status: response.status };
      }
      const result = await response.json() as { success: boolean; data?: T; error?: string; errors?: string[] };
      // Backend returns { success: boolean, data?: T, error?: string }
      if (result.success && result.data) {
        return { ok: true, data: result.data, status: response.status };
      }
      return {
        ok: false,
        error: result.error || 'Request failed',
        errors: result.errors,
        status: response.status
      };
    }

    let error = `Request failed with status ${response.status}`;
    let errors: string[] | undefined;
    if (isJson) {
      try {
        const errorData = await response.json() as { error?: string; message?: string; errors?: string[] };
        error = errorData.error || errorData.message || error;
        errors = errorData.errors;
      } catch {
        // Ignore JSON parse errors
      }
    }

    return {
      ok: false,
      error,
      errors,
      status: response.status,
    };
  }

  private async attemptRefresh(): Promise<boolean> {
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

  private async doRefresh(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Auth endpoints
  async checkAuth(): Promise<ApiResponse<User>> {
    return this.request<{ user: User }>('/me').then(response => ({
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
  async pushSync(updates: SyncUpdate[]): Promise<ApiResponse<void>> {
    return this.request<void>('/sync', {
      method: 'PUT',
      body: updates,
    });
  }

  async pullSync(since?: string): Promise<ApiResponse<SyncResponse>> {
    const endpoint = since ? `/sync?since=${encodeURIComponent(since)}` : '/sync';
    return this.request<SyncResponse>(endpoint);
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
    };
  }>> {
    return this.request('/debug');
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
