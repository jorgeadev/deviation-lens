const fs = require('fs');

const decode = u => {
  try {
    const t = new URL(u).searchParams.get('token');
    if (!t) return 'no-token';
    const p = JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return JSON.stringify(p.obj || p);
  } catch (e) { return 'bad-token'; }
};

const filter = process.argv[2] || '';

process.argv.slice(3).forEach(f => {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const all = new Set();
  const add = u => { if (u && u.includes(filter)) all.add(u); };
  const collectImgs = arr => (arr || []).forEach(i => { add(i.src); if (i.srcset) i.srcset.split(',').forEach(s => add(s.trim().split(' ')[0])); });
  [d.before, d.after, d.afterEsc].forEach(s => s && collectImgs(s.imgs));
  ['scan1', 'scan2', 'scan3'].forEach(k => collectImgs(d[k]));
  (d.requests || []).forEach(r => add(typeof r === 'string' ? r : r.url));
  (d.responses || []).forEach(r => add(r.url));
  console.log('==', f, `(${all.size} urls)`);
  [...all].forEach(u => console.log(`${decode(u)} || ${u.slice(0, 320)}`));
});
