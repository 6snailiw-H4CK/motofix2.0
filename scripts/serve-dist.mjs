import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.env.PORT || process.argv[3] || 4173);
const host = process.env.HOST || '0.0.0.0';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const sendFile = (res, filePath) => {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
    res.end(data);
  });
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const requestedPath = decodeURIComponent(url.pathname);
  let filePath = path.normalize(path.join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    filePath = path.join(root, 'index.html');
  }

  fs.stat(filePath, (error, stat) => {
    if (error || stat.isDirectory()) {
      sendFile(res, path.join(root, 'index.html'));
      return;
    }

    sendFile(res, filePath);
  });
});

server.listen(port, host, () => {
  console.log(`MotoFix dist server running at http://localhost:${port}`);
});
