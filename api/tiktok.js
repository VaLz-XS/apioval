export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url kosong' });
  try {
    const r = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url));
    const j = await r.json();
    if (!j.data) return res.status(502).json({ error: 'gagal ambil video' });
    res.json({ ok: true, title: j.data.title, video: j.data.play, music: j.data.music });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
