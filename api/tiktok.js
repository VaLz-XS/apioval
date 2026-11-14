import { redis, PLANS, today, getKey } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = req.query.url;
  const apikey = String(req.query.apikey || req.headers['x-api-key'] || '').trim();

  if (!apikey) return res.status(401).json({ ok: false, error: 'API key wajib (?apikey=...)' });
  if (!url) return res.status(400).json({ ok: false, error: 'url kosong' });

  try {
    const info = await getKey(apikey);
    if (!info) return res.status(401).json({ ok: false, error: 'API key tidak valid' });

    const limit = PLANS[info.plan] ?? 100;
    const ukey = 'usage:' + apikey + ':' + today();
    let used = 0;
    if (limit !== -1) {
      used = await redis('INCR', ukey);
      if (used === 1) await redis('EXPIRE', ukey, 172800);
      if (used > limit) {
        return res.status(429).json({ ok: false, error: 'Limit harian habis', limit, used: limit, remaining: 0 });
      }
    }

    const r = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url));
    const j = await r.json();
    if (!j.data) {
      if (limit !== -1) await redis('DECR', ukey); // gagal = limit dikembaliin
      return res.status(502).json({ ok: false, error: 'Gagal ambil video' });
    }

    res.json({
      ok: true,
      title: j.data.title,
      video: (j.data.play || '').trim(),
      music: (j.data.music || '').trim(),
      plan: info.plan,
      limit,
      remaining: limit === -1 ? -1 : Math.max(limit - used, 0)
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
