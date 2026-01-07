// auric-ui/src/lib/api.ts
import { getToken } from '@/lib/auth';

export class ApiError extends Error {
  status: number;
  statusText: string;
  url: string;
  json: unknown | null;
  bodyText: string | null;

  constructor(args: {
    message: string;
    status: number;
    statusText: string;
    url: string;
    json?: unknown | null;
    bodyText?: string | null;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.status = args.status;
    this.statusText = args.statusText;
    this.url = args.url;
    this.json = args.json ?? null;
    this.bodyText = args.bodyText ?? null;
  }
}

type ApiFetchOptions = {
  method?: string;
  auth?: boolean;
  body?: any; // object | string | FormData
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

function joinUrl(base: string, path: string) {
  if (!base) return path;
  if (base.endsWith('/') && path.startsWith('/')) return base.slice(0, -1) + path;
  if (!base.endsWith('/') && !path.startsWith('/')) return base + '/' + path;
  return base + path;
}

export async function apiFetch<T = any>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  const url = joinUrl(base, path);

  const method = (opts.method || 'GET').toUpperCase();

  const headers: Record<string, string> = {
    ...(opts.headers || {})
  };

  if (opts.auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined = undefined;

  // If body is already a string or FormData, pass through.
  if (opts.body != null) {
    if (typeof opts.body === 'string') {
      body = opts.body;
      // If they gave us a raw JSON string and didn't set content-type, default it.
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    } else if (typeof FormData !== 'undefined' && opts.body instanceof FormData) {
      body = opts.body;
      // Don't set Content-Type for FormData (browser sets boundary)
    } else {
      body = JSON.stringify(opts.body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
    signal: opts.signal
  });

  // Try to parse body (json preferred, fallback to text)
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json') || ct.includes('+json');

  let parsedJson: unknown | null = null;
  let parsedText: string | null = null;

  try {
    if (isJson) {
      parsedJson = await res.json();
    } else {
      parsedText = await res.text();
      // Sometimes APIs return JSON without the header
      if (parsedText && parsedText.trim().startsWith('{')) {
        try {
          parsedJson = JSON.parse(parsedText);
        } catch {
          // keep as text
        }
      }
    }
  } catch {
    // ignore parse errors
  }

  if (!res.ok) {
    const msg =
      (parsedJson && typeof parsedJson === 'object' && parsedJson !== null && 'error' in parsedJson
        ? String((parsedJson as any).error)
        : null) ||
      (parsedJson && typeof parsedJson === 'object' && parsedJson !== null && 'message' in parsedJson
        ? String((parsedJson as any).message)
        : null) ||
      parsedText ||
      `Request failed (${res.status})`;

    throw new ApiError({
      message: msg,
      status: res.status,
      statusText: res.statusText,
      url,
      json: parsedJson,
      bodyText: parsedText
    });
  }

  // No content
  if (res.status === 204) return undefined as any;

  // Return JSON if we have it, otherwise text
  if (parsedJson != null) return parsedJson as T;
  if (parsedText != null && parsedText.length) return parsedText as any;

  // As a last resort, try json again
  try {
    return (await res.json()) as T;
  } catch {
    return undefined as any;
  }
}
