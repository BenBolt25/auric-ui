import { apiFetch } from '@/lib/api';

export async function getCTraderConnectUrl(accountId: number): Promise<string> {
  const data = await apiFetch<{ url: string }>(`/ctrader/connect-url?accountId=${accountId}`, {
    auth: true
  });
  return data.url;
}
