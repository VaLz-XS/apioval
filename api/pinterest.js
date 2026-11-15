import { useQuota, refund } from './_db.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
    const query = String(req.query.q || '').trim();
    if (!query) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(400).json({ ok: false, error: 'q kosong' });
    }

    const quota = await useQuota(req, res);
    if (!quota) return;

    try {
        // === 1. CARI GAMBAR DI PINTEREST ===
        const searchUrl = `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
        const searchRes = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            },
            timeout: 15000
        });

        const $search = cheerio.load(searchRes.data);
        let imageUrl = null;

        // Cari URL gambar di hasil pencarian (pinterest pake tag meta og:image atau <img>)
        $search('img').each((_, el) => {
            const src = $search(el).attr('src');
            if (src && src.includes('pinimg.com') && !imageUrl) {
                imageUrl = src;
            }
        });

        if (!imageUrl) {
            await refund(quota);
            return res.status(502).json({ ok: false, error: 'Gambar tidak ditemukan di Pinterest' });
        }

        // === 2. SCRAPE PIN DOWN (PERSIS KODE LU) ===
        const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

        const client = axios.create({
            baseURL: 'https://pindown.io',
            headers: { 'User-Agent': userAgent, Referer: 'https://pindown.io/', Origin: 'https://pindown.io' },
            timeout: 15000
        });

        const { data: homeHtml, headers: homeHeaders } = await client.get('/');
        const $home = cheerio.load(homeHtml);

        const cfgVal = $home('input[data-challenge-config]').attr('value') || $home('input[data-challenge-config]').val();
        let config = { seedParts: ['PinDown.io', ':browser:', 'challenge:v1'], lang: 'en' };
        if (cfgVal) { try { config = { ...config, ...JSON.parse(cfgVal) }; } catch (_) {} }

        const homeCookies = (homeHeaders['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

        const { data: tokenData, headers: tokenHeaders } = await client.post('/api/token', { url: imageUrl }, {
            headers: { 'Content-Type': 'application/json', 'X-Form-Language': config.lang || 'en', 'X-Requested-With': 'XMLHttpRequest', Cookie: homeCookies }
        });

        const { id, p } = tokenData || {};
        if (!id || !p) { await refund(quota); return res.status(502).json({ ok: false, error: 'Gagal token pindown' }); }

        // Challenge solving (pake crypto, PERSIS kode lu)
        const crypto = require('crypto');
        const key = crypto.createHash('sha256').update(config.seedParts.join('') + ':' + id).digest();
        const bytes = Buffer.from(p, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, bytes.slice(0, 16));
        const challenge = JSON.parse(Buffer.concat([decipher.update(bytes.slice(16)), decipher.final()]).toString('utf8'));

        let answer;
        switch (challenge.t) {
            case 'r': answer = challenge.n.reduce((s, n) => s + n, 0) * 2 + 1; break;
            case 'b': answer = ((challenge.a ^ challenge.b) >> challenge.shift) & 255; break;
            case 'c': answer = challenge.word.charCodeAt(challenge.index) * challenge.multiplier; break;
            case 'm': answer = ((challenge.a + challenge.b) % 100) * challenge.multiplier; break;
            case 'n': answer = challenge.a * challenge.b + challenge.b * challenge.c + challenge.c * challenge.a - challenge.a; break;
            default: await refund(quota); return res.status(502).json({ ok: false, error: 'Challenge type unknown' });
        }

        const verify = `${id}:${answer}:${challenge._e}:${challenge._h}`;
        const tokenCookies = (tokenHeaders['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
        const allCookies = [homeCookies, tokenCookies].filter(Boolean).join('; ');

        const formData = new URLSearchParams();
        formData.append('url', imageUrl);
        formData.append('lang', config.lang || 'en');

        const { data: actionData } = await client.post('/action', formData.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Verify': verify, 'X-Requested-With': 'XMLHttpRequest', Cookie: allCookies }
        });

        if (!actionData.success || !actionData.html) { await refund(quota); return res.status(502).json({ ok: false, error: actionData.message || 'Gagal proses pindown' }); }

        const $ = cheerio.load(actionData.html);
        const downloads = [];
        const seen = new Set();

        $('table tr').each((_, tr) => {
            const $tr = $(tr);
            const rowText = $tr.text().trim();
            const $btn = $tr.find("a[href^='http']").first();
            const dlUrl = $btn.attr('href');
            if (dlUrl && !seen.has(dlUrl)) {
                seen.add(dlUrl);
                const isVideo = rowText.toLowerCase().includes('video') || dlUrl.includes('.mp4');
                downloads.push({ quality: rowText.replace(/download/i, '').trim() || (isVideo ? '720p' : 'orig'), type: isVideo ? 'video' : 'image', url: dlUrl });
            }
        });

        if (downloads.length === 0) {
            $("a[href^='http']").each((_, a) => {
                const href = $(a).attr('href');
                if (href && !href.includes('pindown.io') && !seen.has(href)) {
                    seen.add(href);
                    const isVideo = href.includes('.mp4');
                    downloads.push({ quality: isVideo ? 'video' : 'image', type: isVideo ? 'video' : 'image', url: href });
                }
            });
        }

        if (downloads.length === 0) { await refund(quota); return res.status(502).json({ ok: false, error: 'Link download tidak ditemukan' }); }

        return res.status(200).json({
            ok: true,
            title: 'Pinterest Media',
            thumbnail: imageUrl,
            type: downloads.some(d => d.type === 'video') ? 'video' : 'image',
            downloads: downloads,
            plan: quota.info.plan,
            limit: quota.limit,
            remaining: quota.remaining
        });

    } catch (e) {
        await refund(quota);
        return res.status(500).json({ ok: false, error: e.message });
    }
}
