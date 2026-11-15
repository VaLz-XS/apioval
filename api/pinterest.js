import { useQuota, refund } from './_db.js';

export default async function handler(req, res) {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);

    if (!q) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(400).json({ ok: false, error: 'q kosong' });
    }

    const quota = await useQuota(req, res);
    if (!quota) return;

    try {
        // === DAFTAR API PINTEREST (MULTIPLE FALLBACK) ===
        const APIS = [
            `https://api.azbry.com/api/search/pinterest?q=${encodeURIComponent(q)}`,
            `https://api.termai.cc/api/search/pinterest?q=${encodeURIComponent(q)}`,
            `https://my.izuka-api.xyz/api/search/pinterest?q=${encodeURIComponent(q)}`,
            `https://api.nyxs.pw/search/pinterest?q=${encodeURIComponent(q)}`
        ];

        let allImages = [];

        // Nembak semua API (paralel)
        const results = await Promise.allSettled(
            APIS.map(url => fetch(url).then(r => r.json()))
        );

        // Gabungin hasil dari semua API
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                const j = result.value;
                let imgs = [];
                
                if (j.result && Array.isArray(j.result)) {
                    imgs = j.result.map(item => item.url || item.image || item).filter(Boolean);
                } else if (j.data && Array.isArray(j.data)) {
                    imgs = j.data.map(item => item.url || item.image || item).filter(Boolean);
                } else if (Array.isArray(j)) {
                    imgs = j.map(item => item.url || item.image || item).filter(Boolean);
                }

                allImages = [...allImages, ...imgs];
            }
        }

        // Hapus duplikat
        allImages = [...new Set(allImages)];

        if (allImages.length === 0) {
            await refund(quota);
            return res.status(502).json({ ok: false, error: 'Gambar tidak ditemukan' });
        }

        // Balikin JSON (pake limit yang diminta)
        return res.status(200).json({
            ok: true,
            title: 'Pinterest Media',
            thumbnail: allImages[0],
            type: 'image',
            downloads: allImages.slice(0, limit).map(url => ({
                type: 'image',
                url: url,
                thumbnail: url
            })),
            total_found: allImages.length,
            plan: quota.info.plan,
            limit: quota.limit,
            remaining: quota.remaining
        });

    } catch (e) {
        await refund(quota);
        return res.status(500).json({ ok: false, error: e.message });
    }
}
