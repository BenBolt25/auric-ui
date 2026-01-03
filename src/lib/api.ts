// auric-ui/src/lib/api.ts

type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  body?: any;
  token?: string | null;
};

// NOTE: Next.js only exposes env vars to the browser if they start with NEXT_PUBLIC_
const RAW_BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim() || 'http://localhost:3000';

// normalize: remove trailing slash
const API_BASE = RAW_BASE.replace(/\/+$/, '');

// helpful: show what base is being used (browser console)
// will run in client pages that import this file
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.log('[auric-ui] API_BASE =', API_BASE);
}

function joinUrl(base: string, path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export async function apiFetch<T = any>(
  path: string,
  opts: ApiFetchOptions = {}
): Promise<T> {
  const url = joinUrl(API_BASE, path);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers as Record<string, string> | undefined)
  };

  // attach auth if present
  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }

  let body: any = undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    ...opts,
    headers,
    body
  });

  // try parse json (even for errors)
  const text = await res.text();
  const maybeJson = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg =
      (maybeJson && (maybeJson.error || maybeJson.message)) ||
      `${res.status} ${res.statusText}`;
    throw new Error(`Request failed: ${msg}`);
  }

  return (maybeJson ?? (text as any)) as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
