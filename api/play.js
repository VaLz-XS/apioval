import { useQuota, refund } from './_db.js';
import yts from 'yt-search';
import ytScraper from '@denzy-official/youtube_scraper';

export default async function handler(req, res) {
    // 1. Ambil query
    const q = String(req.query.q || '').trim();
    if (!q) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(400).json({ ok: false, error: 'q kosong' });
    }

    // 2. CEK KUOTA (INI YANG KURANG TADI!)
    const quota = await useQuota(req, res);
    if (!quota) return;

    try {
        // 3. Cari video
        const search = await yts(q);
        if (!search.videos.length) {
            await refund(quota);
            return res.status(502).json({ ok: false, error: 'Video tidak ditemukan' });
        }
        const video = search.videos[0];

        // 4. Download MP3
        const mp3 = await ytScraper.ytmp3(video.url);

        if (!mp3.status || !mp3.download || !mp3.download.url) {
            await refund(quota);
            return res.status(502).json({ ok: false, error: 'Gagal mengambil audio' });
        }

        // 5. Balikin JSON (LENGKAP)
        return res.status(200).json({
            ok: true,
            title: video.title,
            author: video.author.name,
            duration: video.duration.timestamp,
            views: video.views,
            thumbnail: video.thumbnail,
            audio: mp3.download.url,
            plan: quota.info.plan,
            limit: quota.limit,
            remaining: quota.remaining
        });

    } catch (e) {
        await refund(quota);
        return res.status(500).json({ ok: false, error: e.message });
    }
}
