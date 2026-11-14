// api/play.js
import axios from 'axios'

export default async function handler(req, res) {
    // Cek API Key
    const { q, apikey } = req.query
    if (!apikey) {
        return res.status(401).json({ ok: false, error: 'API key kosong' })
    }
    if (!q) {
        return res.status(400).json({ ok: false, error: 'Query kosong' })
    }

    try {
        // Tembak API YouTube (pake nexoracle)
        const apiUrl = `https://api.nexoracle.com/search/youtube?apikey=free&q=${encodeURIComponent(q)}`
        const { data } = await axios.get(apiUrl, { timeout: 15000 })

        if (!data.result || data.result.length === 0) {
            return res.status(502).json({ ok: false, error: 'Lagu tidak ditemukan' })
        }

        // Ambil hasil pertama
        const first = data.result[0]

        // Balikin JSON
        return res.status(200).json({
            ok: true,
            title: first.title,
            author: first.author,
            thumbnail: first.thumbnail,
            url: `https://youtube.com/watch?v=${first.videoId}`,
            duration: first.duration,
            views: first.views,
            plan: 'free',
            limit: 100,
            remaining: 99 // Nanti lu bisa itung sendiri
        })

    } catch (e) {
        console.error('[PLAY ERROR]', e.message)
        return res.status(500).json({ ok: false, error: 'Gagal ambil data dari YouTube' })
    }
}
