'use strict';
// .. HTTP server: convert images via ImageMagick

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { FORMATS } = require('./js/formats');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const TMP_DIR = path.join(__dirname, '.tmp');
const MAX_UPLOAD = 200 * 1024 * 1024;

fs.mkdirSync(TMP_DIR, { recursive: true });

function cleanTmp() {
  try {
    const files = fs.readdirSync(TMP_DIR);
    let count = 0;
    for (const f of files) {
      try { fs.unlinkSync(path.join(TMP_DIR, f)); count++; } catch (e) {}
    }
    if (count) console.log('[cleanup]', count, 'temp files removed');
  } catch (e) {}
}
cleanTmp();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.yaml': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
};

const formatMap = new Map(FORMATS.map(([name, ext]) => [name, { name, ext }]));

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length
    });
    res.end(data);
  });
}

function collectBody(req, cb) {
  const chunks = [];
  let size = 0;
  let done = false;
  const finish = (err, buf) => {
    if (done) return;
    done = true;
    cb(err, buf);
  };
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_UPLOAD) {
      finish(new Error('File too large (max 200MB)'));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => finish(null, Buffer.concat(chunks)));
  req.on('error', (e) => finish(e));
}

function handleConvert(req, res) {
  const fmtName = String(req.headers['x-format'] || '').toUpperCase();
  const fmt = formatMap.get(fmtName);
  if (!fmt) {
    sendJson(res, 400, { error: 'Unsupported format: ' + fmtName });
    return;
  }
  const quality = Math.max(0, Math.min(100, parseInt(req.headers['x-quality'], 10) || 90));
  const origName = decodeURIComponent(req.headers['x-filename'] || 'image');
  const origExt = path.extname(origName).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';

  collectBody(req, (err, buf) => {
    if (err) {
      sendJson(res, 413, { error: err.message });
      return;
    }
    if (!buf.length) {
      sendJson(res, 400, { error: 'Empty file' });
      return;
    }

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const inputPath = path.join(TMP_DIR, 'in-' + id + origExt);
    const outputPath = path.join(TMP_DIR, 'out-' + id + '.' + fmt.ext);

    fs.writeFile(inputPath, buf, (werr) => {
      if (werr) {
        sendJson(res, 500, { error: 'Failed to write temp file' });
        return;
      }
      const outTarget = fmt.name + ':' + outputPath;
      const args = [inputPath];
      const resize = quality > 0 ? quality : 10;
      args.push('-resize', resize + '%');
      args.push(outTarget);
      console.log('[convert]', 'magick', args.join(' '));
      execFile('magick', args, { timeout: 120000 }, (cerr, stdout, stderr) => {
        fs.unlink(inputPath, () => {});
        if (cerr) {
          console.log('[convert:err]', String(stderr || cerr.message).slice(0, 300));
          fs.unlink(outputPath, () => {});
          sendJson(res, 422, {
            error: 'Conversion failed',
            detail: String(stderr || cerr.message).slice(0, 600)
          });
          return;
        }
        fs.readFile(outputPath, (rerr, outBuf) => {
          fs.unlink(outputPath, () => {});
          if (rerr) {
            sendJson(res, 500, { error: 'Failed to read output' });
            return;
          }
          res.writeHead(200, {
            'Content-Type': MIME['.' + fmt.ext] || 'application/octet-stream',
            'Content-Length': outBuf.length
          });
          res.end(outBuf);
        });
      });
    });
  });
}

function handleSave(req, res) {
  const saveDir = req.headers['x-save-dir'] || '/sdcard/Download';
  const filename = decodeURIComponent(req.headers['x-filename'] || 'converted');
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = path.join(saveDir, safeName);

  collectBody(req, (err, buf) => {
    if (err) {
      sendJson(res, 413, { error: err.message });
      return;
    }
    if (!buf.length) {
      sendJson(res, 400, { error: 'Empty file' });
      return;
    }
    try { fs.mkdirSync(saveDir, { recursive: true }); } catch (e) {}
    console.log('[save]', dest, '(' + buf.length + ' bytes)');
    fs.writeFile(dest, buf, (werr) => {
      if (werr) {
        sendJson(res, 500, { error: 'Failed to save: ' + dest });
        return;
      }
      sendJson(res, 200, { ok: true, path: dest });
    });
  });
}

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'GET' && url === '/api/formats') {
    sendJson(res, 200, { formats: FORMATS });
    return;
  }
  if (req.method === 'POST' && url === '/api/convert') {
    handleConvert(req, res);
    return;
  }
  if (req.method === 'POST' && url === '/api/save') {
    handleSave(req, res);
    return;
  }
  if (req.method === 'POST' && url === '/api/cleanup') {
    cleanTmp();
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log('Image Converter running on http://localhost:' + PORT);
});
