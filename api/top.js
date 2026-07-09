'use strict';
// GET /api/top — top 20 global de la Familia Cíclope (sorted set "top" en Upstash Redis)

function cred() {
  const e = process.env;
  const url = e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL || e.STORAGE_KV_REST_API_URL || e.STORAGE_REST_API_URL;
  const token = e.KV_REST_API_TOKEN || e.UPSTASH_REDIS_REST_TOKEN || e.STORAGE_KV_REST_API_TOKEN || e.STORAGE_REST_API_TOKEN;
  if (url && token) return { url, token };
  // fallback: detectar el par por sufijo, sin importar el prefijo de la integración
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
  const c = cred();
  if (!c) { res.status(500).json({ error: 'sin credenciales de base de datos' }); return; }
  try {
    const flat = await rcmd(c, 'ZREVRANGE', 'top', '0', '19', 'WITHSCORES');
    const top = [];
    for (let i = 0; i < flat.length; i += 2) top.push({ n: flat[i], s: +flat[i + 1] });
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    res.status(200).json({ top });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
