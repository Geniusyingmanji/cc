const http = require('http');
const https = require('https');

const TARGET = 'https://api.boyuerichdata.opensphereai.com';
const ALLOWED_BETAS = new Set([
  'interleaved-thinking-2025-05-14',
  'token-counting-2024-11-01',
  'computer-use-2024-10-22',
  'output-128k-2025-02-19',
]);

function stripCacheScope(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripCacheScope);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'cache_control' && v && typeof v === 'object') {
      const cc = { ...v };
      delete cc.scope;
      if (Object.keys(cc).length > 0) out[k] = cc;
    } else {
      out[k] = stripCacheScope(v);
    }
  }
  return out;
}

const server = http.createServer((req, res) => {
  const headers = { ...req.headers };
  delete headers.host;

  if (headers['anthropic-beta']) {
    const betas = headers['anthropic-beta'].split(',').map(s => s.trim()).filter(b => ALLOWED_BETAS.has(b));
    if (betas.length > 0) headers['anthropic-beta'] = betas.join(',');
    else delete headers['anthropic-beta'];
  }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    let body = Buffer.concat(chunks);

    if (headers['content-type']?.includes('application/json') && body.length > 0) {
      try {
        let parsed = JSON.parse(body.toString());
        parsed = stripCacheScope(parsed);
        delete parsed.context_management;
        body = Buffer.from(JSON.stringify(parsed));
        headers['content-length'] = String(body.length);
      } catch (e) {}
    }

    const url = require('url');
    const parsed = url.parse(TARGET + req.url);
    const opts = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.path,
      method: req.method,
      headers,
    };

    const proxy = https.request(opts, (pRes) => {
      res.writeHead(pRes.statusCode, pRes.headers);
      pRes.pipe(res);
    });
    proxy.on('error', (e) => {
      res.writeHead(502);
      res.end('Proxy error: ' + e.message);
    });
    proxy.end(body);
  });
});

server.listen(18899, '127.0.0.1', () => {
  console.log('yifan proxy listening on 127.0.0.1:18899');
});
