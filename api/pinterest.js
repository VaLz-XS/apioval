import { useQuota, refund } from './_db.js';

export default async function handler(req, res) {
    const q = String(req.query.q || '').trim();
    if (!q) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(400).json({ ok: false, error: 'q kosong' });
    }

    const quota = await useQuota(req, res);
    if (!quota) return;

    try {
        // Tembak API search Pinterest (simpe)
        const apiUrl = `https://api.azbry.com/api/search/pinterest?q=${encodeURIComponent(q)}`;
        const r = await fetch(apiUrl);
        const j = await r.json();

        // Cek format response (bisa result, data, atau array)
        let images = [];
        if (j.result && Array.isArray(j.result)) {
            images = j.result.map(item => item.url || item.image || item).filter(Boolean);
        } else if (j.data && Array.isArray(j.data)) {
            images = j.data.map(item => item.url || item.image || item).filter(Boolean);
        } else if (Array.isArray(j)) {
            images = j.map(item => item.url || item.image || item).filter(Boolean);
        }

        if (images.length === 0) {
            await refund(quota);
            return res.status(502).json({ ok: false, error: 'Gambar tidak ditemukan' });
        }

        // Balikin JSON (formatnya mirip downloads)
        return res.status(200).json({
            ok: true,
            title: 'Pinterest Media',
            thumbnail: images[0],
            type: 'image',
            downloads: images.slice(0, 5).map(url => ({
                type: 'image',
                url: url,
                thumbnail: url
            })),
            plan: quota.info.plan,
            limit: quota.limit,
            remaining: quota.remaining
        });

    } catch (e) {
        await refund(quota);
        return res.status(500).json({ ok: false, error: e.message });
    }
}
