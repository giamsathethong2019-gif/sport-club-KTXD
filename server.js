const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbyFreCV4GIgP_ys5b8UYYtTrh69Yp1_-NYE1K8wRjlMA7dOtu8rhUZRQLwP2go9cFL3-A/exec';
const PHOTOS_FILE = path.join(__dirname, 'photos.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(PHOTOS_FILE)) fs.writeFileSync(PHOTOS_FILE, '[]');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

function getPathname(reqUrl) {
  try { return new URL(reqUrl, 'http://localhost').pathname; }
  catch { return reqUrl.split('?')[0]; }
}

function sheetRequest(method, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const urlObj = new URL(SHEET_URL);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: { 'Content-Type': 'application/json' },
      followRedirects: true
    };
    const req = https.request(options, (res) => {
      let raw = '';
      // follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        https.get(loc, (r2) => {
          let d = '';
          r2.on('data', c => d += c);
          r2.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
        }).on('error', reject);
        return;
      }
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from('--' + boundary);
  let start = 0;
  while (true) {
    const bIdx = buffer.indexOf(boundaryBuf, start);
    if (bIdx === -1) break;
    const headerStart = bIdx + boundaryBuf.length + 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;
    const headers = buffer.slice(headerStart, headerEnd).toString();
    const dataStart = headerEnd + 4;
    const nextB = buffer.indexOf(boundaryBuf, dataStart);
    if (nextB === -1) break;
    const data = buffer.slice(dataStart, nextB - 2);
    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const ctMatch = headers.match(/Content-Type: (.+)/);
    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: filenameMatch ? filenameMatch[1] : null,
      contentType: ctMatch ? ctMatch[1].trim() : 'text/plain',
      data
    });
    start = nextB;
  }
  return parts;
}

const server = http.createServer((req, res) => {
  const pathname = getPathname(req.url);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // Serve index.html
  if (pathname === '/' || pathname === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) { res.writeHead(404); res.end('Not Found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // Serve uploads
  if (pathname.startsWith('/uploads/')) {
    const file = path.join(__dirname, pathname);
    if (!file.startsWith(UPLOADS_DIR)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const ext = path.extname(file).toLowerCase();
      const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
    return;
  }

  // GET registrations — đọc từ Google Sheets
  if (pathname === '/api/registrations' && req.method === 'GET') {
    sheetRequest('GET').then(data => {
      // Map Sheet columns về object
      const result = Array.isArray(data) ? data.map((d, i) => ({
        id: i + 1,
        timestamp: d['Thời Gian'] || '',
        fullName: d['Họ Tên'] || '',
        phone: d['SĐT'] || '',
        jerseyNumber: d['Số Áo'] || '',
        jerseySize: d['Size'] || '',
        position: d['Vị Trí'] || '',
        health: d['Sức Khỏe'] || '',
        height: d['Cao'] || '',
        weight: d['Nặng'] || '',
        speed: d['Tốc Độ'] || '',
        stamina: d['Sức Bền'] || '',
        technique: d['Kỹ Thuật'] || '',
        tactic: d['Chiến Thuật'] || '',
        physical: d['Thể Lực'] || '',
        diet: d['Chế Độ Ăn'] || '',
        transport: d['Phương Tiện'] || '',
        notes: d['Ghi Chú'] || ''
      })) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }).catch(() => {
      res.writeHead(500); res.end(JSON.stringify([]));
    });
    return;
  }

  // POST register — ghi vào Google Sheets
  if (pathname === '/api/register' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const entry = JSON.parse(body);
        sheetRequest('POST', entry).then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        }).catch(() => {
          res.writeHead(500); res.end(JSON.stringify({ success: false }));
        });
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ success: false })); }
    });
    return;
  }

  // GET photos
  if (pathname === '/api/photos' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(fs.readFileSync(PHOTOS_FILE));
    return;
  }

  // POST upload photo
  if (pathname === '/api/photos/upload' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const ct = req.headers['content-type'] || '';
        const boundaryMatch = ct.match(/boundary=(.+)/);
        if (!boundaryMatch) { res.writeHead(400); res.end('No boundary'); return; }
        const parts = parseMultipart(buffer, boundaryMatch[1]);
        const filePart = parts.find(p => p.filename);
        const quarter = parts.find(p => p.name === 'quarter')?.data.toString() || 'Q1';
        const caption = parts.find(p => p.name === 'caption')?.data.toString() || '';
        if (!filePart) { res.writeHead(400); res.end('No file'); return; }
        const ext = path.extname(filePart.filename) || '.jpg';
        const fname = `photo_${Date.now()}${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, fname), filePart.data);
        const photos = JSON.parse(fs.readFileSync(PHOTOS_FILE));
        photos.push({ id: Date.now(), filename: fname, url: `/uploads/${fname}`, quarter, caption, uploadedAt: new Date().toLocaleString('vi-VN') });
        fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) { console.error(e); res.writeHead(500); res.end('Error'); }
    });
    return;
  }

  // DELETE photo
  if (pathname.startsWith('/api/photos/') && req.method === 'DELETE') {
    const id = parseInt(pathname.split('/').pop());
    let photos = JSON.parse(fs.readFileSync(PHOTOS_FILE));
    const photo = photos.find(p => p.id === id);
    if (photo) {
      const fp = path.join(UPLOADS_DIR, photo.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    photos = photos.filter(p => p.id !== id);
    fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // EXPORT CSV — đọc từ Sheets
  if (pathname === '/api/export/csv') {
    sheetRequest('GET').then(data => {
      const rows = Array.isArray(data) ? data : [];
      const headers = ['STT','Họ Tên','SĐT','Số Áo','Size','Vị Trí','Sức Khỏe','Cao(cm)','Nặng(kg)','Tốc Độ','Sức Bền','Kỹ Thuật','Chiến Thuật','Thể Lực','Chế Độ Ăn','Phương Tiện','Ghi Chú','Thời Gian'];
      const csvRows = rows.map((d, i) => [
        i+1, d['Họ Tên'], d['SĐT'], d['Số Áo'], d['Size'], d['Vị Trí'], d['Sức Khỏe'],
        d['Cao'], d['Nặng'], d['Tốc Độ'], d['Sức Bền'], d['Kỹ Thuật'],
        d['Chiến Thuật'], d['Thể Lực'], d['Chế Độ Ăn'], d['Phương Tiện'], d['Ghi Chú'], d['Thời Gian']
      ].map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(','));
      const csv = '\uFEFF' + [headers.join(','), ...csvRows].join('\r\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="sport-club.csv"' });
      res.end(csv);
    }).catch(() => { res.writeHead(500); res.end('Error'); });
    return;
  }

  // EXPORT XLSX
  if (pathname === '/api/export/xlsx') {
    sheetRequest('GET').then(data => {
      const rows = Array.isArray(data) ? data : [];
      const headers = ['STT','Họ Tên','SĐT','Số Áo','Size','Vị Trí','Sức Khỏe','Cao','Nặng','Tốc Độ','Sức Bền','Kỹ Thuật','Chiến Thuật','Thể Lực','Chế Độ Ăn','Phương Tiện','Ghi Chú','Thời Gian'];
      const esc = v => (v||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const cell = v => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
      let xmlRows = `<Row>${headers.map(cell).join('')}</Row>`;
      rows.forEach((d, i) => {
        const vals = [i+1, d['Họ Tên'], d['SĐT'], d['Số Áo'], d['Size'], d['Vị Trí'], d['Sức Khỏe'], d['Cao'], d['Nặng'], d['Tốc Độ'], d['Sức Bền'], d['Kỹ Thuật'], d['Chiến Thuật'], d['Thể Lực'], d['Chế Độ Ăn'], d['Phương Tiện'], d['Ghi Chú'], d['Thời Gian']];
        xmlRows += `<Row>${vals.map(cell).join('')}</Row>`;
      });
      const xlsx = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Danh Sach"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
      res.writeHead(200, { 'Content-Type': 'application/vnd.ms-excel; charset=utf-8', 'Content-Disposition': 'attachment; filename="sport-club.xls"' });
      res.end('\uFEFF' + xlsx);
    }).catch(() => { res.writeHead(500); res.end('Error'); });
    return;
  }

  res.writeHead(404); res.end('Not Found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('✅ ===== SPORT CLUB SERVER =====');
  console.log(`🌐 Link: http://localhost:${PORT}`);
  console.log('💾 Database: Google Sheets');
  console.log('================================');
});