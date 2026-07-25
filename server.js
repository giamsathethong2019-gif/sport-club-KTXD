const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'registrations.json');
const PHOTOS_FILE = path.join(__dirname, 'photos.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');
if (!fs.existsSync(PHOTOS_FILE)) fs.writeFileSync(PHOTOS_FILE, '[]');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

function getPathname(reqUrl) {
  try { return new URL(reqUrl, 'http://localhost').pathname; }
  catch { return reqUrl.split('?')[0]; }
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

  // Serve uploaded images
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

  // GET registrations
  if (pathname === '/api/registrations' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(fs.readFileSync(DATA_FILE));
    return;
  }

  // POST register
  if (pathname === '/api/register' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const entry = JSON.parse(body);
        entry.id = Date.now();
        entry.timestamp = new Date().toLocaleString('vi-VN');
        const data = JSON.parse(fs.readFileSync(DATA_FILE));
        data.push(entry);
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ success: false })); }
    });
    return;
  }

  // DELETE registration
  if (pathname.startsWith('/api/registrations/') && req.method === 'DELETE') {
    const id = parseInt(pathname.split('/').pop());
    let data = JSON.parse(fs.readFileSync(DATA_FILE));
    data = data.filter(d => d.id !== id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
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

  // EXPORT CSV
  if (pathname === '/api/export/csv') {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const headers = ['STT','Họ Tên','SĐT','Số Áo','Size Áo','Vị Trí','Sức Khỏe','Chiều Cao(cm)','Cân Nặng(kg)','Tốc Độ','Sức Bền','Kỹ Thuật','Chiến Thuật','Thể Lực','Chế Độ Ăn','Phương Tiện','Ghi Chú','Thời Gian'];
    const rows = data.map((d, i) => [
      i + 1, d.fullName, d.phone, d.jerseyNumber, d.jerseySize, d.position, d.health,
      d.height || '', d.weight || '', d.speed || '', d.stamina || '', d.technique || '',
      d.tactic || '', d.physical || '', d.diet, d.transport, d.notes || '', d.timestamp
    ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','));
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="sport-club-danhsach.csv"' });
    res.end(csv);
    return;
  }

  // EXPORT XLSX (XML-based)
  if (pathname === '/api/export/xlsx') {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const headers = ['STT','Họ Tên','SĐT','Số Áo','Size Áo','Vị Trí','Sức Khỏe','Chiều Cao','Cân Nặng','Tốc Độ','Sức Bền','Kỹ Thuật','Chiến Thuật','Thể Lực','Ghi Chú','Thời Gian'];
    const esc = v => (v||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const cell = v => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
    let rows = `<Row>${headers.map(cell).join('')}</Row>`;
    data.forEach((d, i) => {
      const vals = [i+1, d.fullName, d.phone, d.jerseyNumber, d.jerseySize, d.position, d.health, d.height||'', d.weight||'', d.speed||'', d.stamina||'', d.technique||'', d.tactic||'', d.physical||'', d.notes||'', d.timestamp];
      rows += `<Row>${vals.map(cell).join('')}</Row>`;
    });
    const xlsx = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Danh Sach"><Table>${rows}</Table></Worksheet></Workbook>`;
    res.writeHead(200, { 'Content-Type': 'application/vnd.ms-excel; charset=utf-8', 'Content-Disposition': 'attachment; filename="sport-club-danhsach.xls"' });
    res.end('\uFEFF' + xlsx);
    return;
  }

  res.writeHead(404); res.end('Not Found');
});

const PORT = 8000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('✅ ===== SPORT CLUB SERVER =====');
  console.log(`🌐 Link chia sẻ Zalo: http://172.17.240.160:${PORT}`);
  console.log(`💻 Máy bạn:          http://localhost:${PORT}`);
  console.log('📁 Dữ liệu lưu tại:  registrations.json');
  console.log('🖼️  Ảnh lưu tại:      uploads/');
  console.log('================================');
  console.log('Nhấn Ctrl+C để dừng server');
});