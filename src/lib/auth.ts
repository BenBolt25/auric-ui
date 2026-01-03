const TOKEN_KEY = 'auric_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;

  // If someone pastes "Bearer xxx", strip it
  return raw.startsWith('Bearer ') ? raw.slice('Bearer '.length) : raw;
}

export function setToken(token: string) {
  if (typeof window === 'undefined') return;
  const cleaned = token.startsWith('Bearer ') ? token.slice('Bearer '.length) : token;
  localStorage.setItem(TOKEN_KEY, cleaned);
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
