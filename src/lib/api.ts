// src/lib/api.ts

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function getBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!base || base.trim().length === 0) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is missing. Add it to .env.local and restart `npm run dev`.'
    );
  }

  return base.replace(/\/$/, '');
}

type ApiFetchOptions = RequestInit & {
  authToken?: string | null;
};

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const { authToken, headers, body, ...rest } = options;

  const res = await fetch(url, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(headers || {})
    },
    body
  });

  const text = await res.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data && data.error) ||
      (typeof data === 'string' && data) ||
      `Request failed (${res.status})`;
    throw new ApiError(String(msg), res.status, data);
  }

  return data as T;
}
