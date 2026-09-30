// 依存なしの簡易静的サーバー: http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { path } from './lib.js';

const ROOT = path('public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const PORT = Number(process.env.PORT ?? 8080);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = normalize(join(ROOT, url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': `${TYPES[extname(file)] ?? 'application/octet-stream'}; charset=utf-8` }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
