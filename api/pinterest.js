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
        let allImages = [];

        // === LOOPING PAGE 1-3 ===
        for (let page = 1; page <= 3; page++) {
            try {
                // Nembak API azbry (pake parameter page, kalo API-nya support)
                // Kalo nggak support page, kita tetep dapet 6 gambar per page (tapi sama aja)
                // Solusi: pake API yang beda per page
                const apis = [
                    `https://api.azbry.com/api/search/pinterest?q=${encodeURIComponent(q)}`,
                    `https://api.termai.cc/api/search/pinterest?q=${encodeURIComponent(q)}`,
                    `https://my.izuka-api.xyz/api/search/pinterest?q=${encodeURIComponent(q)}`
                ];

                const apiUrl = apis[page - 1];
                if (!apiUrl) break;

                const r = await fetch(apiUrl);
                const j = await r.json();

                let imgs = [];
                if (j.result && Array.isArray(j.result)) {
                    imgs = j.result.map(item => item.url || item.image || item).filter(Boolean);
                } else if (j.data && Array.isArray(j.data)) {
                    imgs = j.data.map(item => item.url || item.image || item).filter(Boolean);
                } else if (Array.isArray(j)) {
                    imgs = j.map(item => item.url || item.image || item).filter(Boolean);
                }

                allImages = [...allImages, ...imgs];
            } catch (e) {
                console.log('[PINTEREST] API gagal:', e.message);
            }
        }

        // Hapus duplikat
        allImages = [...new Set(allImages)];

        if (allImages.length === 0) {
            await refund(quota);
            return res.status(502).json({ ok: false, error: 'Gambar tidak ditemukan' });
        }

        // Balikin JSON
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
