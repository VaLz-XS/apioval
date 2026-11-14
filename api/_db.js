const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const PLANS = { free: 100, premium: 5000, unlimited: -1 };

export async function redis(...cmd) {
  if (!DB_URL || !DB_TOKEN) throw new Error('Database belum disambungkan');
  const r = await fetch(DB_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

// tanggal WIB, limit reset tiap 00:00 WIB
export function today() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function getKey(key) {
  if (!/^ov_[a-f0-9]{24}$/.test(key || '')) return null;
  const raw = await redis('GET', 'apikey:' + key);
  return raw ? JSON.parse(raw) : null;
}
