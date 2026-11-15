import yts from 'yt-search'
import ytScraper from '@denzy-official/youtube_scraper'

export default async function handler(req, res) {
    const q = req.query.q || ''
    if (!q) return res.status(400).json({ ok: false, error: 'Query kosong' })

    try {
        // 1. Cari video pakai yt-search (PERSIS KODE LU)
        const search = await yts(q)
        if (!search.videos.length) {
            return res.status(502).json({ ok: false, error: 'Video tidak ditemukan' })
        }
        const video = search.videos[0]

        // 2. Download MP3 (PERSIS KODE LU)
        const mp3 = await ytScraper.ytmp3(video.url)

        if (!mp3.status || !mp3.download || !mp3.download.url) {
            return res.status(502).json({ ok: false, error: 'Gagal mengambil audio' })
        }

        // 3. Balikin JSON (video, thumbnail, audio)
        return res.status(200).json({
            ok: true,
            title: video.title,
            author: video.author.name,
            duration: video.duration.timestamp,
            views: video.views,
            thumbnail: video.thumbnail,
            video: video.url,
            audio: mp3.download.url  // <--- INI LINK MP3 NYA
        })

    } catch (e) {
        return res.status(500).json({ ok: false, error: e.message })
    }
}
