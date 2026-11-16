import axios from 'axios';
import * as cheerio from 'cheerio';

// Fungsi pembuat multipart body
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

// Fungsi inti scraping
async function scrapeSpotify(url) {
  try {
    const cleanUrl = url.trim().split("?")[0];
    const BASE = "https://spotimate.app";
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

    const r1 = await axios.get(BASE + "/en1", {
      headers: { "User-Agent": ua, Accept: "*/*" },
      timeout: 10000,
    });
    let cookies = (r1.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
    let token = "";

    try {
      const vRes = await axios.post(BASE + "/api/userverify", "url=" + encodeURIComponent(cleanUrl), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": ua,
          "X-Requested-With": "XMLHttpRequest",
          Referer: BASE + "/en1",
          Origin: BASE,
          Cookie: cookies,
        },
        timeout: 8000,
      });
      if (vRes.data?.token) token = vRes.data.token;
      const vCookies = (vRes.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
      if (vCookies) cookies = cookies ? `${cookies}; ${vCookies}` : vCookies;
    } catch (_) {}

    const actMp = createMultipartBody({ url: cleanUrl, cftoken: token });
    const { data: actRes, headers: actHeaders } = await axios.post(BASE + "/action", actMp.body, {
      headers: {
        "Content-Type": actMp.contentType,
        "User-Agent": ua,
        Referer: BASE + "/en1",
        Origin: BASE,
        Cookie: cookies,
      },
      timeout: 15000,
    });

    const actCookies = (actHeaders["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
    if (actCookies) cookies = cookies ? `${cookies}; ${actCookies}` : actCookies;

    if (!actRes || actRes.success === false) throw new Error(actRes?.message || "Spotimate returned failure.");

    const html = actRes.html || "";
    const $ = cheerio.load(html);
    const titleH = $("h2, h3").first().text().trim();
    const artistP = $('p.text-sm, p[class*="text-white"], .spotifymate-middle p').first().text().trim();
    const thumbImg = $('img[class*="rounded"], .spotifymate img, img').first().attr("src") || "";

    const tracks = [];
    $("form").each((_, form) => {
      const dataVal = $(form).find('input[name="data"]').val() || "";
      const trackToken = $(form).find('input[name="token"]').val() || $(form).find('input[name="track_token"]').val() || "";
      const baseVal = $(form).find('input[name="base"]').val() || cleanUrl;
      if (!dataVal && !trackToken) return;

      let trackInfo = { title: "", artist: "", thumbnail: "" };
      if (dataVal) {
        try {
          const decoded = JSON.parse(Buffer.from(dataVal, "base64").toString());
          trackInfo.title = decoded.name || decoded.title || "";
          trackInfo.artist = decoded.artist || decoded.singer || "";
          trackInfo.thumbnail = decoded.cover || "";
        } catch (_) {}
      }
      tracks.push({
        data: dataVal, base: baseVal, trackToken,
        title: trackInfo.title || titleH || "Spotify Track",
        artist: trackInfo.artist || artistP || "",
        thumbnail: trackInfo.thumbnail || thumbImg,
      });
    });

    if (tracks.length === 0) throw new Error("No tracks found.");

    const downloads = [];
    const firstTrack = tracks[0];

    if (firstTrack.data && firstTrack.trackToken) {
      try {
        const trackMp = createMultipartBody({
          data: firstTrack.data,
          base: firstTrack.base || cleanUrl,
          token: firstTrack.trackToken,
        });

        const { data: dlRes } = await axios.post(BASE + "/action/track", trackMp.body, {
          headers: {
            "Content-Type": trackMp.contentType,
            "User-Agent": ua,
            Referer: BASE + "/en1",
            Origin: BASE,
            Cookie: cookies,
          },
          timeout: 15000,
        });

        const dlHtml = dlRes?.data || dlRes?.html || "";
        if (dlHtml) {
          const $dl = cheerio.load(dlHtml);
          $dl("a[href^='http']").each((_, a) => {
            const href = $dl(a).attr("href");
            const text = $dl(a).text().trim();
            if (href && !href.includes("tunecable") && !href.includes("premium") && !text.toLowerCase().includes("another song")) {
              const isCover = text.toLowerCase().includes("cover") || href.includes("cover") || href.includes("scdn.co") || /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(href);
              downloads.push({
                quality: isCover ? "cover" : "320kbps",
                type: isCover ? "photo" : "audio",
                url: href,
              });
            }
          });
        }
      } catch (_) {}
    }

    if (downloads.length === 0) throw new Error("Gagal mendapatkan link download.");

    return {
      title: firstTrack.title || titleH || "Spotify Track",
      artist: firstTrack.artist || artistP || undefined,
      thumbnail: firstTrack.thumbnail || thumbImg,
      type: "audio",
      downloads,
    };
  } catch (err) {
    throw new Error(err.message || "Failed to scrape Spotify.");
  }
}

// === HANDLER API VERCEL ===
export default async function handler(req, res) {
    // Buka akses CORS biar web lu bisa akses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const url = String(req.query.url || '').trim();
    if (!url) return res.status(400).json({ ok: false, error: 'Parameter "url" kosong' });

    try {
        const result = await scrapeSpotify(url);
        // Kirim response persis kayak API Oval lu
        res.status(200).json({
            ok: true,
            ...result
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}
