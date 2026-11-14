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
  if (process.env.ADMIN_KEY && key === process.env.ADMIN_KEY) {
    return { name: 'admin', plan: 'unlimited' };
  }
  if (!/^ov_[a-f0-9]{24}$/.test(key || '')) return null;
  const raw = await redis('GET', 'apikey:' + key);
  return raw ? JSON.parse(raw) : null;
}
  export async function useQuota(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const apikey = String(req.query.apikey || req.headers['x-api-key'] || '').trim();
  if (!apikey) { res.status(401).json({ ok: false, error: 'API key wajib (?apikey=...)' }); return null; }
  const info = await getKey(apikey);
  if (!info) { res.status(401).json({ ok: false, error: 'API key tidak valid' }); return null; }
  const limit = PLANS[info.plan] ?? 100;
  const ukey = 'usage:' + apikey + ':' + today();
  let used = 0;
  if (limit !== -1) {
    used = await redis('INCR', ukey);
    if (used === 1) await redis('EXPIRE', ukey, 172800);
    if (used > limit) {
      res.status(429).json({ ok: false, error: 'Limit harian habis', limit, used: limit, remaining: 0 });
      return null;
    }
  }
  return { apikey, info, limit, used, ukey, remaining: limit === -1 ? -1 : Math.max(limit - used, 0) };
}

export async function refund(q) {
  if (q && q.limit !== -1) await redis('DECR', q.ukey);
}
