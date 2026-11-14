import { useQuota, refund } from './_db.js';

export default async function handler(req, res) {
  const url = String(req.query.url || '').trim();
  if (!url) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).json({ ok: false, error: 'url kosong' });
  }

  const q = await useQuota(req, res);
  if (!q) return;

  try {
    const r = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url));
    const j = await r.json();
    const d = j && j.data;
    if (!d) {
      await refund(q);
      return res.status(502).json({ ok: false, error: 'Gagal ambil data, cek link-nya' });
    }

    const images = Array.isArray(d.images) ? d.images.map(s => String(s).trim()).filter(Boolean) : [];
    const isImage = images.length > 0;
    const music = String(d.music || (d.music_info && d.music_info.play) || '').trim();

    res.json({
      ok: true,
      type: isImage ? 'image' : 'video',
      title: d.title || '',
      author: (d.author && (d.author.nickname || d.author.unique_id)) || '',
      video: isImage ? '' : String(d.play || d.hdplay || '').trim(),
      images,
      music,
      plan: q.info.plan,
      limit: q.limit,
      remaining: q.remaining
    });
  } catch (e) {
    await refund(q);
    res.status(500).json({ ok: false, error: e.message });
  }
}
