const http = require('http');

const TARGET_HOST = '35.220.164.252';
const TARGET_PORT = 3888;
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

  // Filter beta headers
  if (headers['anthropic-beta']) {
    const betas = headers['anthropic-beta'].split(',').map(s => s.trim()).filter(b => ALLOWED_BETAS.has(b));
    if (betas.length > 0) headers['anthropic-beta'] = betas.join(',');
    else delete headers['anthropic-beta'];
  }

  // Collect request body
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    let body = Buffer.concat(chunks);

    // Strip cache_control.scope from JSON body
    if (headers['content-type']?.includes('application/json') && body.length > 0) {
      try {
        let parsed = JSON.parse(body.toString());
        parsed = stripCacheScope(parsed);
        delete parsed.context_management;
        body = Buffer.from(JSON.stringify(parsed));
        headers['content-length'] = String(body.length);
      } catch (e) {}
    }

    const opts = {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers,
    };

    const proxy = http.request(opts, (pRes) => {
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

server.listen(18900, '127.0.0.1', () => {
  console.log('zhihang proxy listening on 127.0.0.1:18900');
});
