const http = require("http");
const https = require("https");
const { URL } = require("url");

const LISTEN_PORT = Number(process.env.PROXY_PORT || 18899);
const TARGET = process.env.TARGET_URL || "https://api.anthropic.com";
const CLASH_PROXY = process.env.CLASH_PROXY_URL;

if (!CLASH_PROXY) {
  throw new Error("Set CLASH_PROXY_URL, for example http://user:password@127.0.0.1:17890");
}

const proxyUrl = new URL(CLASH_PROXY);
const proxyAuth = proxyUrl.username
  ? "Basic " + Buffer.from((proxyUrl.username || "") + ":" + (proxyUrl.password || "")).toString("base64")
  : null;

const server = http.createServer((req, res) => {
  const targetUrl = new URL(req.url, TARGET);
  const connectHeaders = {};
  if (proxyAuth) connectHeaders["Proxy-Authorization"] = proxyAuth;

  const proxyReq = http.request({
    hostname: proxyUrl.hostname,
    port: proxyUrl.port,
    method: "CONNECT",
    path: targetUrl.hostname + ":443",
    headers: connectHeaders,
  });

  proxyReq.on("connect", (proxyRes, socket) => {
    if (proxyRes.statusCode !== 200) {
      res.writeHead(502);
      res.end("Proxy CONNECT failed: " + proxyRes.statusCode);
      socket.destroy();
      return;
    }

    const finalReq = https.request({
      hostname: targetUrl.hostname,
      port: 443,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: { ...req.headers, host: targetUrl.host },
      socket,
      agent: false,
    }, (finalRes) => {
      res.writeHead(finalRes.statusCode || 502, finalRes.headers);
      finalRes.pipe(res);
    });

    finalReq.on("error", (e) => {
      if (!res.headersSent) res.writeHead(502);
      res.end("Target error: " + e.message);
    });

    req.pipe(finalReq);
  });

  proxyReq.on("error", (e) => {
    if (!res.headersSent) res.writeHead(502);
    res.end("Proxy error: " + e.message);
  });

  proxyReq.end();
});

server.listen(LISTEN_PORT, "127.0.0.1", () => {
  console.log(`Reverse proxy listening on 127.0.0.1:${LISTEN_PORT}`);
});
