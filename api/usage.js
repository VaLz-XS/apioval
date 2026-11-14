import { redis, PLANS, today, getKey } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const apikey = String(req.query.apikey || '').trim();
  try {
    const info = await getKey(apikey);
    if (!info) return res.status(401).json({ ok: false, error: 'API key tidak valid' });
    const limit = PLANS[info.plan] ?? 100;
    const used = Number(await redis('GET', 'usage:' + apikey + ':' + today())) || 0;
    res.json({ ok: true, plan: info.plan, limit, used, remaining: limit === -1 ? -1 : Math.max(limit - used, 0) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
