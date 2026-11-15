import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

let db = null;
if (!db) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
        if (serviceAccount.project_id) {
            initializeApp({ credential: cert(serviceAccount) });
            db = getFirestore();
        }
    } catch (e) {
        console.error('[CHAT] Firebase init error:', e.message);
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (!db) {
        return res.status(500).json({ ok: false, error: 'Firebase belum dikonfigurasi' });
    }

    const action = String(req.query.action || '').trim();

    try {
        // === 1. KIRIM PESAN ===
        if (action === 'send' && req.method === 'POST') {
            const { name, message } = req.body || {};
            if (!name || !message) {
                return res.status(400).json({ ok: false, error: 'name dan message wajib diisi' });
            }

            await db.collection('global_chat').add({
                name: String(name).slice(0, 30),
                message: String(message).slice(0, 500),
                timestamp: FieldValue.serverTimestamp()
            });

            return res.status(200).json({ ok: true, message: 'Pesan terkirim' });
        }

        // === 2. AMBIL PESAN ===
        if (action === 'history') {
            const snapshot = await db.collection('global_chat')
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();

            const messages = [];
            snapshot.forEach(doc => {
                const d = doc.data();
                messages.push({
                    id: doc.id,
                    name: d.name,
                    message: d.message,
                    timestamp: d.timestamp?.toDate()?.toISOString() || null
                });
            });

            return res.status(200).json({
                ok: true,
                messages: messages.reverse()
            });
        }

        return res.status(400).json({ ok: false, error: 'action tidak dikenal' });

    } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
    }
}
