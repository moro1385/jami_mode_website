import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const entry = html.match(/src="(\/assets\/[^"\s]+\.js)"/)?.[1];
if (!entry || !(await readFile(path.join(root, entry), 'utf8')).includes('sb_publishable_offline_build_placeholder')) {
  throw Error('Offline E2E requires the isolated synthetic build. Run build:isolated first.');
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "connect-src 'self' https://cifhcrlmjnsxpkhyloen.supabase.co; img-src 'self' data:; font-src 'self' data:");
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/__offline_e2e__/health') { res.setHeader('Content-Type', 'application/json'); res.end('{"offline":true}'); return; }
    if (pathname.startsWith('/api/')) { res.writeHead(501, { 'Content-Type': 'application/json' }); res.end('{"error":"Offline fixtures must intercept APIs"}'); return; }
    let file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try { if (!(await stat(file)).isFile()) file = path.join(root, 'index.html'); }
    catch { file = path.join(root, 'index.html'); }
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    // No production preconnect may escape the browser's fixture routing.
    res.end(file.endsWith('index.html') ? html.replace(/<link\b[^>]*rel=["']preconnect["'][^>]*>/gi, '') : await readFile(file));
  } catch { res.writeHead(500); res.end('Offline server error'); }
});
server.listen(4179, '127.0.0.1', () => process.stdout.write('{"offline":true,"port":4179}\n'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
