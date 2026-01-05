import { getToken } from './auth';

export type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: any;
  auth?: boolean; // ✅ allow { auth: true }
  headers?: Record<string, string>;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '') || '';

function buildHeaders(opts?: ApiFetchOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers || {})
  };

  if (opts?.auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function apiFetch<T>(path: string, opts?: ApiFetchOptions): Promise<T> {
  if (!API_BASE) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is missing. Set it in .env.local (e.g. https://aurix-zero.onrender.com)'
    );
  }

  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    method: opts?.method || 'GET',
    headers: buildHeaders(opts),
    body: opts?.body !== undefined 
  ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) 
  : undefined
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-json response
  }

  if (!res.ok) {
    const msg =
      (json && (json.error || json.message)) ||
      text ||
      `Request failed: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return (json ?? ({} as any)) as T;
}
