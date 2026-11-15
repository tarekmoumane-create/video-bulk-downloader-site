// Local stand-in for Vercel: serves the site and runs api/*.js. Reads .env.local.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 4321);
if (existsSync(join(ROOT, '.env.local'))) {
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.zip': 'application/zip', '.js': 'text/javascript' };

http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const api = path.match(/^\/api\/([a-z]+)$/);
  if (api) {
    try {
      const mod = await import(join(ROOT, 'api', `${api[1]}.js`));
      return await mod.default(req, res);
    } catch {
      res.statusCode = 404; return res.end('Not found');
    }
  }
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
  if (!file.startsWith(ROOT) || file.includes('/api/') || file.includes('.env')) { res.statusCode = 404; return res.end('Not found'); }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.statusCode = 404; res.end('Not found'); }
}).listen(PORT, '127.0.0.1', () => console.log(`Site on http://127.0.0.1:${PORT}`));
