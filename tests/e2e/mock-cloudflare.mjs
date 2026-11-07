// Fake Cloudflare GraphQL API for Web Analytics (rumPageloadEventsAdaptiveGroups), for the e2e test.
import http from 'node:http';
const port = 8792;
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const send = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url !== '/graphql') return send({ errors: [{ message: 'not found' }] }, 404);
    if (req.headers.authorization !== 'Bearer cf-test') return send({ data: null, errors: [{ message: 'not authorized for that account' }] });
    const { query, variables } = JSON.parse(body);
    if (variables.a !== 'a'.repeat(32)) return send({ data: null, errors: [{ message: 'not authorized for that account' }] });
    const f = variables.f;
    const g = (count, visits, dims) => ({ count, sum: { visits }, ...(dims ? { dimensions: dims } : {}) });
    let r;
    if (query.includes('{ date }')) {
      r = [];
      for (let d = new Date(f.date_geq + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= f.date_leq; d = new Date(+d + 864e5)) {
        const day = d.toISOString().slice(0, 10);
        r.push(g(20 + (d.getUTCDate() % 7) * 9, 5 + (d.getUTCDate() % 5), { date: day }));
      }
    } else if (query.includes('requestPath')) r = [g(120, 40, { requestPath: '/' }), g(80, 20, { requestPath: '/play' }), g(30, 10, { requestPath: '/daily' })];
    else if (query.includes('refererHost')) r = [g(50, 20, { refererHost: '' }), g(12, 6, { refererHost: 'www.google.com' })];
    else if (query.includes('countryName')) r = [g(150, 50, { countryName: 'CA' }), g(40, 12, { countryName: 'US' })];
    else if (query.includes('deviceType')) r = [g(130, 40, { deviceType: 'mobile' }), g(60, 22, { deviceType: 'desktop' })];
    else r = [g(274, 13)];
    send({ data: { viewer: { accounts: [{ r }] } }, errors: null });
  });
}).listen(port, '127.0.0.1', () => console.log('mock cloudflare on', port));
