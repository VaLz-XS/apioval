import { redis, PLANS, getKey } from './_db.js';

export default async function handler(req, res) {
  const { token, key, plan } = req.query;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ ok: false, error: 'Token salah' });
  }
  if (!Object.prototype.hasOwnProperty.call(PLANS, plan)) {
    return res.status(400).json({ ok: false, error: 'plan: free / premium / unlimited' });
  }
  try {
    const info = await getKey(key);
    if (!info) return res.status(404).json({ ok: false, error: 'Key tidak ditemukan' });
    info.plan = plan;
    await redis('SET', 'apikey:' + key, JSON.stringify(info));
    res.json({ ok: true, key, plan });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
