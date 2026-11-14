const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.json({ status: 'ok' }));

app.get('/api/tiktok', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url kosong' });
  try {
    const r = await fetch('https://www.tikwm.com/api/?url=' + encodeURIComponent(url));
    const j = await r.json();
    if (!j.data) return res.status(502).json({ error: 'gagal ambil video', detail: j });
    res.json({
      ok: true,
      title: j.data.title,
      video: j.data.play,
      music: j.data.music
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log('jalan di', PORT));
