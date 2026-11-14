import pkg from '@napi-rs/canvas';
import { useQuota, refund } from './_db.js';

const { createCanvas, GlobalFonts } = pkg;

const FONTS = [
  'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/arimo/Arimo%5Bwght%5D.ttf',
  'https://cdn.jsdelivr.net/npm/@fontsource/arimo/files/arimo-latin-400-normal.woff',
  'https://cdn.jsdelivr.net/npm/@fontsource/roboto/files/roboto-latin-400-normal.woff'
];

let fontP = null;
function ensureFont() {
  if (!fontP) {
    fontP = (async () => {
      for (const u of FONTS) {
        try {
          const r = await fetch(u);
          if (!r.ok) continue;
          const ok = GlobalFonts.register(Buffer.from(await r.arrayBuffer()), 'BratFont');
          if (ok) return true;
        } catch (e) {}
      }
      throw new Error('Font gagal dimuat');
    })().catch(e => { fontP = null; throw e; });
  }
  return fontP;
}

function wrap(ctx, words, maxW) {
  const lines = []; let cur = [];
  for (const w of words) {
    if (ctx.measureText(w).width > maxW) return null;
    if (cur.length && ctx.measureText(cur.concat(w).join(' ')).width > maxW) { lines.push(cur); cur = [w]; }
    else cur.push(w);
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function hexOr(v, d) { return /^[0-9a-f]{6}$/i.test(v || '') ? '#' + v : d; }

function render(text, bg, fg) {
  const W = 512, pad = 28, maxW = W - pad * 2, maxH = W - pad * 2;
  const fam = '"BratFont", Arial, sans-serif';
  const canvas = createCanvas(W, W);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, W);

  const words = text.toLowerCase().replace(/\s+/g, ' ').trim().split(' ')
    .flatMap(w => w.match(/.{1,25}/g) || []);
  let size = 200, lines = null;
  for (; size >= 12; size -= 2) {
    ctx.font = size + 'px ' + fam;
    lines = wrap(ctx, words, maxW);
    if (lines && lines.length * size * 1.05 <= maxH) break;
  }
  if (!lines) { ctx.font = '12px ' + fam; lines = wrap(ctx, words, maxW) || [words]; size = 12; }

  ctx.textBaseline = 'top';
  ctx.fillStyle = fg;
  const lh = size * 1.05;
  let y = pad;
  lines.forEach((ws, i) => {
    const last = i === lines.length - 1;
    if (last || ws.length === 1) {
      ctx.fillText(ws.join(' '), pad, y);
    } else {
      const sum = ws.reduce((a, w) => a + ctx.measureText(w).width, 0);
      const gap = (maxW - sum) / (ws.length - 1);
      let x = pad;
      ws.forEach(w => { ctx.fillText(w, x, y); x += ctx.measureText(w).width + gap; });
    }
    y += lh;
  });

  // blur tipis ala brat (kalau didukung)
  try {
    const c2 = createCanvas(W, W);
    const x2 = c2.getContext('2d');
    x2.filter = 'blur(1.2px)';
    x2.drawImage(canvas, 0, 0);
    return c2;
  } catch (e) { return canvas; }
}

export default async function handler(req, res) {
  const text = String(req.query.text || '').trim().slice(0, 150);
  if (!text) { res.setHeader('Access-Control-Allow-Origin', '*'); return res.status(400).json({ ok: false, error: 'text kosong' }); }

  const q = await useQuota(req, res);
  if (!q) return;

  try {
    await ensureFont();
    const c = render(text, hexOr(req.query.bg, '#ffffff'), hexOr(req.query.color, '#000000'));
    const webp = String(req.query.format || '').toLowerCase() === 'webp';
    const buf = webp ? c.toBuffer('image/webp', 90) : c.toBuffer('image/png');
    res.setHeader('Content-Type', webp ? 'image/webp' : 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-RateLimit-Remaining', String(q.remaining));
    res.status(200).send(buf);
  } catch (e) {
    await refund(q);
    res.status(500).json({ ok: false, error: e.message });
  }
}
