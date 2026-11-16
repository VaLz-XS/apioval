import axios from 'axios';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ ok: false, error: 'Query kosong' });

    try {
        // Kita pakai API Spotify internal (tanpa auth) buat search
        const { data } = await axios.get(`https://api.spotifydown.com/search?q=${encodeURIComponent(query)}`, {
            headers: {
                'Origin': 'https://spotifydown.com',
                'Referer': 'https://spotifydown.com/',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        if (!data || !data.tracks) throw new Error('Format API tidak valid');

        const results = data.tracks.map(track => ({
            id: track.id,
            title: track.title,
            artist: track.artists,
            thumbnail: track.cover,
            url: `https://open.spotify.com/track/${track.id}`
        }));

        res.status(200).json({ ok: true, results });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
}
