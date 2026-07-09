'use strict';
// POST /api/score {n, s} — registra un récord en el top global.
// Solo actualiza si el puntaje supera el anterior del mismo apodo (ZADD GT).
// Límite: 12 envíos por minuto por IP; puntaje plausible 1..60000.

function cred() {
  const e = process.env;
  const url = e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL || e.STORAGE_KV_REST_API_URL || e.STORAGE_REST_API_URL;
  const token = e.KV_REST_API_TOKEN || e.UPSTASH_REDIS_REST_TOKEN || e.STORAGE_KV_REST_API_TOKEN || e.STORAGE_REST_API_TOKEN;
  if (url && token) return { url, token };
  const uk = Object.keys(e).find(k => /REST_API_URL$|REDIS_REST_URL$/.test(k) && String(e[k]).startsWith('https'));
  const tk = Object.keys(e).find(k => /REST_API_TOKEN$|REDIS_REST_TOKEN$/.test(k));
  return uk && tk ? { url: e[uk], token: e[tk] } : null;
}

async function rcmd(c, ...parts) {
  const r = await fetch(c.url + '/' + parts.map(encodeURIComponent).join('/'), {
    headers: { Authorization: 'Bearer ' + c.token }
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'solo POST' }); return; }
  const c = cred();
  if (!c) { res.status(500).json({ error: 'sin credenciales de base de datos' }); return; }
  try {
    const b = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const n = String(b.n || '').trim().replace(/[<>&"'`]/g, '').slice(0, 15);
    const s = Math.floor(Number(b.s));
    if (n.length < 2) { res.status(400).json({ error: 'apodo inválido' }); return; }
    if (!Number.isFinite(s) || s < 1 || s > 60000) { res.status(400).json({ error: 'puntaje inválido' }); return; }

    const ip = String(req.headers['x-forwarded-for'] || '?').split(',')[0].trim();
    const hits = await rcmd(c, 'INCR', 'rl:' + ip);
    if (hits === 1) await rcmd(c, 'EXPIRE', 'rl:' + ip, '60');
    if (hits > 12) { res.status(429).json({ error: 'los Kori necesitan descansar; intenta en un minuto' }); return; }

    await rcmd(c, 'ZADD', 'top', 'GT', String(s), n);
    await rcmd(c, 'ZREMRANGEBYRANK', 'top', '0', '-201'); // conservar solo los 200 mejores
    const rank = await rcmd(c, 'ZREVRANK', 'top', n);
    res.status(200).json({ ok: true, rank: rank === null ? null : rank + 1 });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
