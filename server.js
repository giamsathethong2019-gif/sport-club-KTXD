const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = 'https://lpkydkswxohqijjllaxi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxwa3lka3N3eG9ocWlqamxsYXhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwOTEzMDQsImV4cCI6MjEwMDY2NzMwNH0.2Z--r5WVdqKbsR7-IwFghuI8xWgYS_Eyn3QQfjfdGjM';
const PHOTOS_FILE = path.join(__dirname, 'photos.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(PHOTOS_FILE)) fs.writeFileSync(PHOTOS_FILE, '[]');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

function getPathname(reqUrl) {
  try { return new URL(reqUrl, 'http://localhost').pathname; }
  catch { return reqUrl.split('?')[0]; }
}

function supabaseRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(SUPABASE_URL + endpoint);
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (method === 'POST') headers['Prefer'] = 'return=minimal';
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : []);
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
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
    parts.push({ name: nameMatch?nameMatch[1]:'', filename: filenameMatch?filenameMatch[1]:null, contentType: ctMatch?ctMatch[1].trim():'text/plain', data });
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

  if (pathname === '/' || pathname === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) { res.writeHead(404); res.end('Not Found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (pathname.startsWith('/uploads/')) {
    const file = path.join(__dirname, pathname);
    if (!file.startsWith(UPLOADS_DIR)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const ext = path.extname(file).toLowerCase();
      const mime = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp'}[ext]||'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
    return;
  }

  if (pathname === '/api/registrations' && req.method === 'GET') {
    supabaseRequest('GET', '/rest/v1/registrations?select=*&order=created_at.asc').then(data => {
      const result = Array.isArray(data) ? data.map((d,i) => ({
        id: d.id, timestamp: d.timestamp||'',
        fullName: d.full_name||'', phone: d.phone||'',
        jerseyNumber: d.jersey_number||'', jerseySize: d.jersey_size||'',
        position: d.position||'', health: d.health||'',
        height: d.height||'', weight: d.weight||'',
        speed: d.speed||'', stamina: d.stamina||'',
        technique: d.technique||'', tactic: d.tactic||'',
        physical: d.physical||'', diet: d.diet||'',
        transport: d.transport||'', notes: d.notes||''
      })) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }).catch(e => {
      console.error('GET error:', e.message);
      res.writeHead(200); res.end('[]');
    });
    return;
  }

  if (pathname === '/api/register' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        const row = {
          timestamp: new Date().toLocaleString('vi-VN'),
          full_name: d.fullName||'', phone: d.phone||'',
          jersey_number: d.jerseyNumber||'', jersey_size: d.jerseySize||'',
          position: d.position||'', health: d.health||'',
          height: d.height||'', weight: d.weight||'',
          speed: d.speed||'', stamina: d.stamina||'',
          technique: d.technique||'', tactic: d.tactic||'',
          physical: d.physical||'', diet: d.diet||'',
          transport: d.transport||'', notes: d.notes||''
        };
        supabaseRequest('POST', '/rest/v1/registrations', row).then(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        }).catch(e => {
          console.error('POST error:', e.message);
          res.writeHead(500); res.end(JSON.stringify({ success: false }));
        });
      } catch(e) { res.writeHead(400); res.end(JSON.stringify({ success: false })); }
    });
    return;
  }

  if (pathname.startsWith('/api/registrations/') && req.method === 'DELETE') {
    const id = pathname.split('/').pop();
    supabaseRequest('DELETE', `/rest/v1/registrations?id=eq.${id}`).then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    }).catch(() => { res.writeHead(500); res.end(JSON.stringify({ success: false })); });
    return;
  }

  if (pathname === '/api/photos' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(fs.existsSync(PHOTOS_FILE) ? fs.readFileSync(PHOTOS_FILE) : '[]');
    return;
  }

  if (pathname === '/api/photos/upload' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const ct = req.headers['content-type']||'';
        const bm = ct.match(/boundary=(.+)/);
        if (!bm) { res.writeHead(400); res.end('No boundary'); return; }
        const parts = parseMultipart(buffer, bm[1]);
        const fp = parts.find(p => p.filename);
        const quarter = parts.find(p => p.name==='quarter')?.data.toString()||'Q1';
        const caption = parts.find(p => p.name==='caption')?.data.toString()||'';
        if (!fp) { res.writeHead(400); res.end('No file'); return; }
        const ext = path.extname(fp.filename)||'.jpg';
        const fname = `photo_${Date.now()}${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, fname), fp.data);
        const photos = JSON.parse(fs.existsSync(PHOTOS_FILE) ? fs.readFileSync(PHOTOS_FILE) : '[]');
        photos.push({ id: Date.now(), filename: fname, url: `/uploads/${fname}`, quarter, caption, uploadedAt: new Date().toLocaleString('vi-VN') });
        fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch(e) { res.writeHead(500); res.end('Error'); }
    });
    return;
  }

  if (pathname.startsWith('/api/photos/') && req.method === 'DELETE') {
    const id = parseInt(pathname.split('/').pop());
    let photos = JSON.parse(fs.existsSync(PHOTOS_FILE) ? fs.readFileSync(PHOTOS_FILE) : '[]');
    const photo = photos.find(p => p.id===id);
    if (photo) { const fp = path.join(UPLOADS_DIR, photo.filename); if (fs.existsSync(fp)) fs.unlinkSync(fp); }
    photos = photos.filter(p => p.id!==id);
    fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (pathname === '/api/export/csv') {
    supabaseRequest('GET', '/rest/v1/registrations?select=*&order=created_at.asc').then(data => {
      const rows = Array.isArray(data) ? data : [];
      const h = ['STT','Họ Tên','SĐT','Số Áo','Size','Vị Trí','Sức Khỏe','Cao','Nặng','Tốc Độ','Sức Bền','Kỹ Thuật','Chiến Thuật','Thể Lực','Chế Độ Ăn','Phương Tiện','Ghi Chú','Thời Gian'];
      const csvRows = rows.map((d,i) => [i+1,d.full_name,d.phone,d.jersey_number,d.jersey_size,d.position,d.health,d.height,d.weight,d.speed,d.stamina,d.technique,d.tactic,d.physical,d.diet,d.transport,d.notes,d.timestamp].map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(','));
      const csv = '\uFEFF' + [h.join(','), ...csvRows].join('\r\n');
      res.writeHead(200, {'Content-Type':'text/csv;charset=utf-8','Content-Disposition':'attachment;filename="sport-club.csv"'});
      res.end(csv);
    }).catch(() => { res.writeHead(500); res.end('Error'); });
    return;
  }

  if (pathname === '/api/export/xlsx') {
    supabaseRequest('GET', '/rest/v1/registrations?select=*&order=created_at.asc').then(data => {
      const rows = Array.isArray(data) ? data : [];
      const esc = v => (v||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const cell = v => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
      const h = ['STT','Họ Tên','SĐT','Số Áo','Size','Vị Trí','Sức Khỏe','Cao','Nặng','Tốc Độ','Sức Bền','Kỹ Thuật','Chiến Thuật','Thể Lực','Chế Độ Ăn','Phương Tiện','Ghi Chú','Thời Gian'];
      let xmlRows = `<Row>${h.map(cell).join('')}</Row>`;
      rows.forEach((d,i) => { xmlRows+=`<Row>${[i+1,d.full_name,d.phone,d.jersey_number,d.jersey_size,d.position,d.health,d.height,d.weight,d.speed,d.stamina,d.technique,d.tactic,d.physical,d.diet,d.transport,d.notes,d.timestamp].map(cell).join('')}</Row>`; });
      const xlsx=`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="DanhSach"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
      res.writeHead(200,{'Content-Type':'application/vnd.ms-excel;charset=utf-8','Content-Disposition':'attachment;filename="sport-club.xls"'});
      res.end('\uFEFF'+xlsx);
    }).catch(() => { res.writeHead(500); res.end('Error'); });
    return;
  }

  res.writeHead(404); res.end('Not Found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Sport Club Server running on port ${PORT}`);
  console.log(`💾 Database: Supabase`);
});
