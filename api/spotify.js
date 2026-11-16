import axios from 'axios';
import * as cheerio from 'cheerio';

function createMultipartBody(fields) {
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
  let body = "";
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
    }
  }
  body += `--${boundary}--\r\n`;
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function scrapeSpotify(url) {
    // ... (KODE SCRAPE SPOTIFY LU YANG LAMA, BIARIN AJA) ...
    // Gua singkat di sini biar lu gampang copy, intinya sama kayak sebelumnya.
}

async function searchSpotify(query) {
    const { data } = await axios.get(`https://api.spotifydown.com/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Origin': 'https://spotifydown.com', 'Referer': 'https://spotifydown.com/', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!data || !data.tracks) throw new Error('Format API tidak valid');
    return data.tracks.map(track => ({
        id: track.id,
        title: track.title,
        artist: track.artists,
        thumbnail: track.cover,
        url: `https://open.spotify.com/track/${track.id}`
    }));
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { action, url, q } = req.query;

    // 1. Kalau action=search, jalanin fungsi search
    if (action === 'search') {
        if (!q) return res.status(400).json({ ok: false, error: 'Query kosong' });
        try {
            const results = await searchSpotify(q);
            return res.status(200).json({ ok: true, results });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    }

    // 2. Kalau nggak ada action, berarti default-nya DOWNLOAD (pakai url)
    if (!url) return res.status(400).json({ ok: false, error: 'Parameter "url" kosong' });
    try {
        const result = await scrapeSpotify(url);
        res.status(200).json({ ok: true, ...result });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}
