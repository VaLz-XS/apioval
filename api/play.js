import { useQuota, refund } from './_db.js';

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).json({ ok: false, error: 'q kosong' });
  }

  // Cek kuota (sama kayak tiktok.js)
  const quota = await useQuota(req, res);
  if (!quota) return;

  try {
    // Tembak API YouTube (pake nexoracle)
    const apiUrl = `https://api.nexoracle.com/search/youtube?apikey=free&q=${encodeURIComponent(q)}`;
    const r = await fetch(apiUrl);
    const j = await r.json();

    if (!j.result || !Array.isArray(j.result) || j.result.length === 0) {
      await refund(quota);
      return res.status(502).json({ ok: false, error: 'Lagu tidak ditemukan' });
    }

    // Ambil hasil pertama
    const first = j.result[0];

    // Balikin JSON (sama struktur kayak tiktok.js)
    res.json({
      ok: true,
      title: first.title || '',
      author: first.author || '',
      video: `https://youtube.com/watch?v=${first.videoId}`,
      thumbnail: first.thumbnail || '',
      duration: first.duration || '',
      views: first.views || '',
      plan: quota.info.plan,
      limit: quota.limit,
      remaining: quota.remaining
    });

  } catch (e) {
    await refund(quota);
    res.status(500).json({ ok: false, error: e.message });
  }
}
