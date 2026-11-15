import { useQuota, refund } from './_db.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
    const url = String(req.query.url || '').trim();
    if (!url) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(400).json({ ok: false, error: 'url kosong' });
    }

    const quota = await useQuota(req, res);
    if (!quota) return;

    try {
        // === LOGIKA SCRAPE INDOWN.NET (PERSIS KODE LU) ===
        const cleanUrl = url.split("?")[0];
        const payload = new URLSearchParams();
        payload.append("q", cleanUrl);
        payload.append("vt", "reel");
        payload.append("t", "media");
        payload.append("lang", "en");
        payload.append("v", "v2");

        const r = await axios.post("https://indown.net/api/ajaxSearch", payload.toString(), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest",
                Origin: "https://indown.net",
                Referer: "https://indown.net/",
            },
            timeout: 15000,
        });

        const json = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
        if (!json || json.status !== "ok" || !json.data) {
            await refund(quota);
            return res.status(502).json({ ok: false, error: json?.mess?.replace(/<[^>]+>/g, "").trim() || "Gagal proses IG" });
        }

        const $ = cheerio.load(json.data);
        const downloads = [];
        let thumbnail = null;

        $(".download-items").each((_, el) => {
            const thumb = $(el).find("img").attr("src");
            if (thumb && !thumbnail) thumbnail = thumb;

            $(el).find("a[href*='download'], a.abutton, a.btn, a[href*='snapcdn'], a[href*='rapidcdn'], a[href*='cdninstagram']").each((_, a) => {
                const href = $(a).attr("href");
                if (href && href.startsWith("http") && !downloads.some((d) => d.url === href)) {
                    downloads.push({
                        type: "video", // Anggep video dulu, nanti bot yang nentuin
                        url: href,
                        thumbnail: thumb || href,
                    });
                }
            });
        });

        if (downloads.length === 0) {
            await refund(quota);
            return res.status(502).json({ ok: false, error: "Media tidak ditemukan (mungkin private)" });
        }

        // Balikin JSON
        return res.status(200).json({
            ok: true,
            title: "Instagram Media",
            thumbnail: thumbnail || downloads[0].thumbnail,
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
