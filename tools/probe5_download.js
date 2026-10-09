const url = 'https://www.deviantart.com/download/1079563018/dhuqs5m-180926e1-6492-49cc-85b1-54f0499439fa.jpg?token=22cb1baacd8278ba6be6c65ed716ca5abb1c6791&ts=1791531543';

(async () => {
  const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' };
  try {
    const r = await fetch(url, { method: 'HEAD', headers: UA, redirect: 'manual' });
    console.log('HEAD(manual):', r.status, r.headers.get('location'));
  } catch (e) { console.log('HEAD manual err', e.message); }
  try {
    const r = await fetch(url, { method: 'HEAD', headers: UA, redirect: 'follow' });
    console.log('HEAD(follow):', r.status, 'len=' + r.headers.get('content-length'), 'type=' + r.headers.get('content-type'), 'disp=' + (r.headers.get('content-disposition') || '').slice(0, 120));
    console.log('final url:', r.url);
  } catch (e) { console.log('HEAD follow err', e.message); }
  try {
    const r = await fetch(url, { method: 'GET', headers: { ...UA, Range: 'bytes=0-0' }, redirect: 'follow' });
    console.log('GET(range):', r.status, 'content-range=' + r.headers.get('content-range'), 'len=' + r.headers.get('content-length'), 'type=' + r.headers.get('content-type'));
    if (r.body) { try { await r.body.cancel(); } catch (e) { } }
    console.log('final url:', r.url);
  } catch (e) { console.log('GET range err', e.message); }
})();
