type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  token?: string | null;
};

function normalizeBaseUrl(raw: string | undefined) {
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

export const API_BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);

export async function apiFetch<T>(
  path: string,
  opts: ApiFetchOptions = {}
): Promise<T> {
  const base = API_BASE;
  if (!base) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is missing. Set it in Vercel Environment Variables.'
    );
  }

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers || {})
  };

  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }

  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    if (isJson) {
      try {
        const j = await res.json();
        if (j?.error) detail = `${detail} — ${j.error}`;
      } catch {}
    } else {
      try {
        const t = await res.text();
        if (t) detail = `${detail} — ${t.slice(0, 200)}`;
      } catch {}
    }
    throw new Error(`Request failed: ${detail}`);
  }

  if (isJson) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}
