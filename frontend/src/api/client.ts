import type { ApiErrorBody, ApiErrorCode } from './types';

const TOKEN_KEY = 'cst.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Normalised error surfaced to the UI. `code` is the locked error-code constant
 * from §6.5 so callers can branch on it (e.g. INSUFFICIENT_HOLDING, FORBIDDEN).
 */
export class ApiError extends Error {
  code: ApiErrorCode | string;
  status: number;
  details?: Record<string, unknown>;
  traceId?: string;

  constructor(
    status: number,
    code: ApiErrorCode | string,
    message: string,
    details?: Record<string, unknown>,
    traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.traceId = traceId;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // query params; undefined/empty values are skipped
  query?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `/api${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = opts;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new ApiError(0, 'NETWORK_ERROR', '無法連線到伺服器，請確認後端是否啟動 (:8000)。', {
      cause: String(networkErr),
    });
  }

  // 401 → clear stale token so the auth guard redirects to login.
  if (res.status === 401) {
    clearToken();
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!res.ok) {
    const errBody = parsed as ApiErrorBody | undefined;
    if (errBody && errBody.error) {
      throw new ApiError(
        res.status,
        errBody.error.code,
        errBody.error.message || '發生未知錯誤',
        errBody.error.details,
        errBody.error.trace_id,
      );
    }
    throw new ApiError(res.status, 'INTERNAL_ERROR', `請求失敗 (HTTP ${res.status})`);
  }

  return parsed as T;
}
