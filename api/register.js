import { randomBytes } from 'crypto';
import { redis, today } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Pakai method POST' });
  try {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const rk = 'reg:' + ip + ':' + today();
    const n = await redis('INCR', rk);
    if (n === 1) await redis('EXPIRE', rk, 172800);
    if (n > 3) return res.status(429).json({ ok: false, error: 'Maksimal 3 API key per hari per IP' });

    const name = String((req.body && req.body.name) || '').slice(0, 30).replace(/[<>]/g, '');
    const key = 'ov_' + randomBytes(12).toString('hex');
    await redis('SET', 'apikey:' + key, JSON.stringify({ name, plan: 'free', created: Date.now() }));
    res.json({ ok: true, apikey: key, plan: 'free', limit: 100 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
