import { useQuota, refund } from './_db.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

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
        // === SCRAPE PINTEREST SEARCH LANGSUNG ===
        const searchUrl = `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`;
        
        const { data: html } = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 15000
        });

        const $ = cheerio.load(html);
        const images = [];

        // Cara 1: Cari gambar dari tag <img> dengan src pinimg
        $('img').each((_, el) => {
            let src = $(el).attr('src') || $(el).attr('data-src');
            if (src && src.includes('pinimg.com')) {
                // Ganti ukuran jadi 720x biar HD
                src = src.replace(/\/\d+x\d*\//, '/720x/');
                if (!images.includes(src)) images.push(src);
            }
        });

        // Cara 2: Cari dari <script> JSON (Pinterest nyimpen data di sini)
        $('script').each((_, el) => {
            const content = $(el).html() || '';
            // Cari URL pinimg di dalem script
            const regex = /https:\/\/i\.pinimg\.com\/[^"'\s\\]+/g;
            const matches = content.match(regex);
            if (matches) {
                matches.forEach(url => {
                    const hdUrl = url.replace(/\/\d+x\d*\//, '/720x/');
                    if (!images.includes(hdUrl) && images.length < 50) {
                        images.push(hdUrl);
                    }
                });
            }
        });

        if (images.length === 0) {
            await refund(quota);
            return res.status(502).json({ ok: false, error: 'Gambar tidak ditemukan (mungkin Pinterest ngeblokir)' });
        }

        // Balikin JSON (pake limit yang diminta)
        return res.status(200).json({
            ok: true,
            title: 'Pinterest Media',
            thumbnail: images[0],
            type: 'image',
            downloads: images.slice(0, limit).map(url => ({
                type: 'image',
                url: url,
                thumbnail: url
            })),
            total_found: images.length,
            plan: quota.info.plan,
            limit: quota.limit,
            remaining: quota.remaining
        });

    } catch (e) {
        await refund(quota);
        return res.status(500).json({ ok: false, error: e.message });
    }
}
