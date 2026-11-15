import { useQuota, refund } from './_db.js';

export default async function handler(req, res) {
    const text = String(req.query.text || '').trim();
    if (!text) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(400).json({ ok: false, error: 'text kosong' });
    }

    const quota = await useQuota(req, res);
    if (!quota) return;

    try {
        // Tembak API pihak ketiga (izuka)
        const apiUrl = `https://my.izuka-api.xyz/api/canvas/iqc?text=${encodeURIComponent(text)}`;
        const r = await fetch(apiUrl);
        
        // Kalo API ngasih gambar, balikin sebagai gambar
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('image')) {
            const buffer = Buffer.from(await r.arrayBuffer());
            res.setHeader('Content-Type', 'image/png');
            return res.send(buffer);
        } else {
            // Kalo ngasih JSON error, balikin error
            const j = await r.json().catch(() => ({}));
            await refund(quota);
            return res.status(502).json({ ok: false, error: j.message || 'Gagal bikin IQC' });
        }
    } catch (e) {
        await refund(quota);
        return res.status(500).json({ ok: false, error: e.message });
    }
}
