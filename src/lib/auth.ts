export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auric_token');
}

export function setToken(token: string) {
  localStorage.setItem('auric_token', token);
}

export function clearToken() {
  localStorage.removeItem('auric_token');
}

export function isAuthed(): boolean {
  return !!getToken();
}
