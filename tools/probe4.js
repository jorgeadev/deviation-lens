const fs = require('fs');

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));

function allUrls(d) {
  const urls = new Set();
  ['before', 'after', 'afterEsc'].forEach(k => d[k] && (d[k].imgs || []).forEach(i => { urls.add(i.src); if (i.srcset) i.srcset.split(',').forEach(s => urls.add(s.trim().split(' ')[0])); }));
  (d.requests || []).forEach(u => urls.add(typeof u === 'string' ? u : u.url));
  (d.responses || []).forEach(u => urls.add(u.url));
  return [...urls];
}

function decodeToken(u) {
  try {
    const t = new URL(u).searchParams.get('token');
    if (!t) return null;
    return JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch (e) { return null; }
}

async function head(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' } });
    return `STATUS=${r.status} LEN=${r.headers.get('content-length')} TYPE=${r.headers.get('content-type')}`;
  } catch (e) { return `FETCH-ERR ${e.message}`; }
}

const seeds = [];
const findBest = (urls, id) => urls.filter(u => u.includes(id) && u.includes('token=')).sort((a, b) => b.length - a.length)[0];
const p1 = findBest(allUrls(read('probe_mobile.json')), 'dhzec7g');
if (p1) seeds.push({ name: 'dhzec7g_jpg', url: p1 });
const p2 = findBest(allUrls(read('probe2_mobile.json')), 'dmog0y1');
if (p2) seeds.push({ name: 'dmog0y1_png', url: p2 });

(async () => {
  for (const seed of seeds) {
    const tok = decodeToken(seed.url);
    const caps = tok && tok.obj ? tok.obj[0][0] : null;
    const base = seed.url.match(/^(https:\/\/images-wixmp-[a-z0-9]+\.wixmp\.com\/f\/[^/]+\/[^/]+\.(png|jpg|jpeg|gif|webp))/i);
    if (!caps || !base) { console.log(`[${seed.name}] missing caps/base`, caps, base); continue; }
    const W = (caps.width || '').replace(/[<=]/g, '');
    const H = (caps.height || '').replace(/[<=]/g, '');
    const token = new URL(seed.url).searchParams.get('token');
    console.log(`[${seed.name}] ext=${base[2]} caps=${W}x${H}`);
    const tests = [
      ['jpg_q100', `${base[1]}/v1/fill/w_${W},h_${H},q_100,strp/probe.jpg?token=${token}`],
      ['png_q100', `${base[1]}/v1/fill/w_${W},h_${H},q_100,strp/probe.png?token=${token}`],
      ['jpg_noq', `${base[1]}/v1/fill/w_${W},h_${H},strp/probe.jpg?token=${token}`],
      ['jpg_q80', `${base[1]}/v1/fill/w_${W},h_${H},q_80,strp/probe.jpg?token=${token}`],
      ['gif_q100', `${base[1]}/v1/fill/w_${W},h_${H},q_100,strp/probe.gif?token=${token}`]
    ];
    for (const [k, u] of tests) console.log(`[${seed.name}][${k}] ${await head(u)}`);
  }
})();
