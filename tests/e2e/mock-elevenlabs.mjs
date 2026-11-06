// Fake ElevenLabs Flows image API for local testing.
import http from 'node:http';
import fs from 'node:fs';
const dir = process.argv[2];
const imgs = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
const jobs = new Map();
let n = 0;
http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.headers['xi-api-key'] !== 'test-key' && !req.url.startsWith('/files/')) return send(401, { detail: 'invalid key' });
  if (req.method === 'POST' && req.url === '/v1/flows/image') {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      const body = JSON.parse(b);
      console.log('CREATE', JSON.stringify(body).slice(0, 200));
      if (body.prompt.includes('FAILME')) return send(422, { detail: 'prompt rejected' });
      const id = 'gen' + ++n; jobs.set(id, { polls: 0, img: imgs[n % imgs.length] });
      send(200, { id, status: 'pending' });
    }); return;
  }
  const m = req.url.match(/^\/v1\/flows\/image\/(\w+)$/);
  if (m) {
    const j = jobs.get(m[1]); if (!j) return send(404, { detail: 'nope' });
    j.polls++;
    if (j.polls < 2) return send(200, { id: m[1], status: 'generating' });
    return send(200, { id: m[1], status: 'completed', content_url: `http://127.0.0.1:8790/files/${encodeURIComponent(j.img)}`, content_mime_type: 'image/png' });
  }
  const f = req.url.match(/^\/files\/(.+)$/);
  if (f) { res.writeHead(200, { 'content-type': 'image/png' }); return fs.createReadStream(dir + '/' + decodeURIComponent(f[1])).pipe(res); }
  send(404, {});
}).listen(8790, '127.0.0.1', () => console.log('mock on 8790'));
