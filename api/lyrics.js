import { useQuota, refund } from './_db.js';

export default async function handler(req, res) {
    const artist = String(req.query.artist || '').trim();
    const title = String(req.query.title || '').trim();

    if (!artist || !title) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(400).json({ ok: false, error: 'artist dan title wajib diisi' });
    }

    const quota = await useQuota(req, res);
    if (!quota) return;

    try {
        // 1. Coba endpoint 'get' LRCLIB (paling akurat, butuh artist & title)
        const getUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
        let r = await fetch(getUrl);
        
        // 2. Kalo gagal (404), coba endpoint 'search' (lebih fleksibel)
        if (!r.ok) {
            const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(artist + ' ' + title)}`;
            r = await fetch(searchUrl);
            const searchData = await r.json();
            
            if (!searchData || searchData.length === 0) {
                await refund(quota);
                return res.status(502).json({ ok: false, error: 'Lirik tidak ditemukan' });
            }
            // Ambil hasil pertama dari search
            const first = searchData[0];
            return res.status(200).json({
                ok: true,
                title: first.trackName,
                artist: first.artistName,
                album: first.albumName || '',
                lyrics: first.plainLyrics || '',
                syncedLyrics: first.syncedLyrics || null,
                plan: quota.info.plan,
                limit: quota.limit,
                remaining: quota.remaining
            });
        }

        // Kalo endpoint 'get' berhasil
        const data = await r.json();
        return res.status(200).json({
            ok: true,
            title: data.trackName,
            artist: data.artistName,
            album: data.albumName || '',
            lyrics: data.plainLyrics || '',
            syncedLyrics: data.syncedLyrics || null,
            plan: quota.info.plan,
            limit: quota.limit,
            remaining: quota.remaining
        });

    } catch (e) {
        await refund(quota);
        return res.status(500).json({ ok: false, error: e.message });
    }
}
