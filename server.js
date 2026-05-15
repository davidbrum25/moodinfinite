/**
 * Moodinfinite dev server
 * -----------------------
 * Sets Cross-Origin-Opener-Policy: same-origin-allow-popups so that the
 * Google Identity Services OAuth popup can communicate with this page
 * without Chrome blocking window.closed calls (COOP warning).
 *
 * Usage: node server.js   (default port 3000)
 *        PORT=8080 node server.js
 */

import http from 'http';
import fs   from 'fs';
import path from 'path';
import url  from 'url';

const PORT = process.env.PORT || 3000;
const ROOT = path.dirname(url.fileURLToPath(import.meta.url));

const MIME = {
    '.html' : 'text/html; charset=utf-8',
    '.js'   : 'application/javascript; charset=utf-8',
    '.css'  : 'text/css; charset=utf-8',
    '.json' : 'application/json; charset=utf-8',
    '.png'  : 'image/png',
    '.jpg'  : 'image/jpeg',
    '.jpeg' : 'image/jpeg',
    '.gif'  : 'image/gif',
    '.webp' : 'image/webp',
    '.svg'  : 'image/svg+xml',
    '.ico'  : 'image/x-icon',
    '.woff' : 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf'  : 'font/ttf',
    '.mp4'  : 'video/mp4',
    '.webm' : 'video/webm',
    '.zip'  : 'application/zip',
    '.mood' : 'application/octet-stream',
};

const server = http.createServer((req, res) => {
    // Security / COOP headers
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const parsed   = url.parse(req.url);
    let   pathname = decodeURIComponent(parsed.pathname);

    // Default to index.html
    if (pathname === '/' || pathname === '') pathname = '/index.html';

    const filePath = path.join(ROOT, pathname);

    // Prevent directory traversal outside ROOT
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            // Try index.html inside the requested directory
            const indexPath = path.join(filePath, 'index.html');
            fs.stat(indexPath, (err2, stat2) => {
                if (err2 || !stat2.isFile()) {
                    res.writeHead(404);
                    return res.end('Not found: ' + pathname);
                }
                serveFile(indexPath, res);
            });
            return;
        }
        serveFile(filePath, res);
    });
});

function serveFile(filePath, res) {
    const ext      = path.extname(filePath).toLowerCase();
    const mimeType = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500);
            return res.end('Server error');
        }
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
    });
}

server.listen(PORT, () => {
    console.log(`\n  Moodinfinite dev server`);
    console.log(`  ➜  http://localhost:${PORT}/\n`);
});
