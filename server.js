const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function extractUIDFromResolvedContent(content) {
    const patterns = [
        /fb:\/\/profile\/(\d{8,})/i,
        /[?&]id=(\d{8,})/i,
        /set=pb\.(\d{8,})/i,
        /entity_id["'=:\s\\\/]+(\d{8,})/i,
        /owner(?:_id)?["'=:\s\\\/]+(\d{8,})/i,
        /userID["'=:\s\\\/]+(\d{8,})/i,
        /USER_ID["'=:\s\\\/]+(\d{8,})/i
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) return match[1];
    }

    return "";
}

const server = http.createServer(async (req, res) => {
    // Enable CORS for development ease
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 1. API Route
    if (req.method === 'POST' && req.url === '/api/resolve-uid') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const parsed = JSON.parse(body || '{}');
                const { url } = parsed;
                if (!url) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'URL is required' }));
                    return;
                }

                console.log(`[API] Resolving FB URL: ${url}`);
                const fbRes = await fetch(url);

                if (!fbRes.ok) {
                    throw new Error(`Facebook responded with status ${fbRes.status}`);
                }

                const html = await fbRes.text();
                const uid = extractUIDFromResolvedContent(html);

                if (uid) {
                    console.log(`[API] Resolved to UID: ${uid}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ uid }));
                } else {
                    console.warn(`[API] Could not find UID in page content of: ${url}`);
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Could not extract UID from page content. Make sure it is a valid Facebook profile/share link.' }));
                }
            } catch (err) {
                console.error('[API] Error during resolution:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || 'Server error during Facebook link resolution' }));
            }
        });
        return;
    }

    // 2. Static Files serving
    // Normalize URL path to prevent directory traversal
    let safeUrl = req.url.split('?')[0];
    if (safeUrl === '/') {
        safeUrl = '/index.html';
    }

    const filePath = path.join(PUBLIC_DIR, safeUrl);

    // Prevent directory traversal attacks
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    const extname = path.extname(filePath);
    let contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
