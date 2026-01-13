import { apiFetch } from '@/lib/api';

export async function getCTraderConnectUrl(accountId?: number): Promise<string> {
  const qs = accountId ? `?accountId=${encodeURIComponent(String(accountId))}` : '';
  const data = await apiFetch<{ url?: string; connectUrl?: string }>(`/ctrader/connect-url${qs}`, {
    auth: true
  });

  const url = data.url ?? data.connectUrl;
  if (!url) throw new Error('Missing cTrader connect url');
  return url;
}
