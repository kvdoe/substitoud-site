/* Local preview: node dev-server.js [port]   (run from the site folder)
   Serves the static files and the same /api routes Vercel and Cloudflare run.
   Set STRIPE_SECRET_KEY=sk_test_... in the environment to try real Stripe test checkout. */
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[3] ? path.resolve(process.argv[3]) : __dirname;
const api = require(path.join(root, 'api', '_core.js'));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  if (url.pathname.startsWith('/api/')) {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      try { req.body = raw ? JSON.parse(raw) : null; } catch (e) { req.body = null; }
      res.status = c => { res.statusCode = c; return res; };
      res.json = o => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
      api(req, res);
    });
    return;
  }
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.statusCode = 404; file = path.join(root, '404.html'); }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  const stat = fs.statSync(file), range = req.headers.range;
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range), s = +m[1], e = m[2] ? +m[2] : stat.size - 1;
    res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
    return fs.createReadStream(file, { start: s, end: e }).pipe(res);
  }
  fs.createReadStream(file).pipe(res);
}).listen(+process.argv[2] || 4173, () => console.log('SubstitOud preview on http://localhost:' + (+process.argv[2] || 4173)));
