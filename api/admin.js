import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { redis, PLANS, today, getKey } from './_db.js';

const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

async function checkLogin(user, pass) {
  const raw = await redis('GET', 'admin:cred');
  if (raw) {
    const c = JSON.parse(raw);
    const h = scryptSync(String(pass), c.salt, 32).toString('hex');
    return eq(user, c.user) && eq(h, c.hash);
  }
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) return false;
  return eq(user, process.env.ADMIN_USER) && eq(pass, process.env.ADMIN_PASS);
}

async function authed(req) {
  const t = String(req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!/^[a-f0-9]{48}$/.test(t)) return null;
  return (await redis('GET', 'admin:sess:' + t)) ? t : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Pakai POST' });
  const b = req.body || {};
  try {
    if (b.action === 'login') {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      const fk = 'loginfail:' + ip;
      const fails = Number(await redis('GET', fk)) || 0;
      if (fails >= 5) return res.status(429).json({ ok: false, error: 'Terlalu banyak percobaan, coba lagi 15 menit' });
      if (!(await checkLogin(b.username, b.password))) {
        const n = await redis('INCR', fk);
        if (n === 1) await redis('EXPIRE', fk, 900);
        return res.status(401).json({ ok: false, error: 'Username / password salah' });
      }
      await redis('DEL', fk);
      const token = randomBytes(24).toString('hex');
      await redis('SET', 'admin:sess:' + token, '1', 'EX', 43200);
      return res.json({ ok: true, token, adminKey: process.env.ADMIN_KEY || '' });
    }

    const tok = await authed(req);
    if (!tok) return res.status(401).json({ ok: false, error: 'Sesi habis, login lagi' });

    if (b.action === 'logout') {
      await redis('DEL', 'admin:sess:' + tok);
      return res.json({ ok: true });
    }

    if (b.action === 'list') {
      let cursor = '0', keys = [];
      do {
        const r = await redis('SCAN', cursor, 'MATCH', 'apikey:*', 'COUNT', 200);
        cursor = r[0];
        keys = keys.concat(r[1]);
      } while (cursor !== '0' && keys.length < 500);
      let items = [];
      if (keys.length) {
        const vals = await redis('MGET', ...keys);
        const uses = await redis('MGET', ...keys.map(k => 'usage:' + k.slice(7) + ':' + today()));
        items = keys.map((k, i) => {
          let v = {}; try { v = JSON.parse(vals[i]); } catch (e) {}
          return { key: k.slice(7), name: v.name || '', plan: v.plan || 'free', created: v.created || 0, used: Number(uses[i]) || 0 };
        }).sort((a, z) => z.created - a.created);
      }
      return res.json({ ok: true, items, limits: PLANS });
    }

    if (b.action === 'setplan') {
      if (!Object.prototype.hasOwnProperty.call(PLANS, b.plan)) return res.status(400).json({ ok: false, error: 'Plan tidak valid' });
      const info = await getKey(b.key);
      if (!info) return res.status(404).json({ ok: false, error: 'Key tidak ditemukan' });
      info.plan = b.plan;
      await redis('SET', 'apikey:' + b.key, JSON.stringify(info));
      return res.json({ ok: true });
    }

    if (b.action === 'delete') {
      if (!/^ov_[a-f0-9]{24}$/.test(b.key || '')) return res.status(400).json({ ok: false, error: 'Key tidak valid' });
      await redis('DEL', 'apikey:' + b.key);
      return res.json({ ok: true });
    }

    if (b.action === 'create') {
      const plan = Object.prototype.hasOwnProperty.call(PLANS, b.plan) ? b.plan : 'free';
      const key = 'ov_' + randomBytes(12).toString('hex');
      const name = String(b.name || '').slice(0, 30).replace(/[<>]/g, '');
      await redis('SET', 'apikey:' + key, JSON.stringify({ name, plan, created: Date.now() }));
      return res.json({ ok: true, key, plan });
    }

    if (b.action === 'changepass') {
      if (!(await checkLogin(b.username, b.current))) return res.status(401).json({ ok: false, error: 'Password lama salah' });
      const nu = String(b.newUsername || b.username).trim();
      const np = String(b.newPassword || '');
      if (nu.length < 3) return res.status(400).json({ ok: false, error: 'Username minimal 3 karakter' });
      if (np.length < 8) return res.status(400).json({ ok: false, error: 'Password baru minimal 8 karakter' });
      const salt = randomBytes(16).toString('hex');
      const hash = scryptSync(np, salt, 32).toString('hex');
      await redis('SET', 'admin:cred', JSON.stringify({ user: nu, salt, hash }));
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Action tidak dikenal' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
