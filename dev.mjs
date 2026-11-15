// Local stand-in for Vercel: serves the site and runs api/*.js. Reads .env.local.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = new URL('.', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 4321);
if (existsSync(join(ROOT, '.env.local'))) {
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
// /api/fetch is Python on Vercel; run it locally with the Mac app's Python.
const PY = process.env.VBD_PY || `${process.env.HOME}/Library/Application Support/Video Downloader/venv/bin/python`;
spawn(PY, [join(ROOT, 'dev_fetch.py')], { stdio: 'inherit' });

const TYPES = { '.html': 'text/html; charset=utf-8', '.zip': 'application/zip', '.js': 'text/javascript' };

http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/api/fetch') {
    const up = http.request({ host: '127.0.0.1', port: 4322, path: req.url, method: 'GET' }, (r) => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    up.on('error', () => { res.statusCode = 502; res.end('{"error":"fetch server not running"}'); });
    return up.end();
  }
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
