const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const REGISTRATIONS_FILE = path.join(__dirname, 'registrations.json');
const PHOTOS_FILE = path.join(__dirname, 'photos.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || '';
const GOOGLE_ENABLED = Boolean(GOOGLE_APPS_SCRIPT_URL);

const REG_HEADERS = [
  'id', 'timestamp', 'fullName', 'phone', 'jerseyNumber', 'jerseySize',
  'position', 'health', 'height', 'weight', 'speed', 'stamina',
  'technique', 'tactic', 'physical', 'diet', 'transport', 'notes'
];

if (!fs.existsSync(REGISTRATIONS_FILE)) fs.writeFileSync(REGISTRATIONS_FILE, '[]');
if (!fs.existsSync(PHOTOS_FILE)) fs.writeFileSync(PHOTOS_FILE, '[]');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

function getPathname(reqUrl) {
  try {
    return new URL(reqUrl, 'http://localhost').pathname;
  } catch {
    return reqUrl.split('?')[0];
  }
}

function readJsonArray(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8') || '[]';
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(`Read error for ${path.basename(filePath)}:`, e.message);
    return [];
  }
}

function writeJsonArray(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeRegistration(row, fallbackId) {
  const id = row.id ?? fallbackId;
  const timestamp = row.timestamp || row.createdAt || row.created_at || '';
  return {
    id: Number.isFinite(Number(id)) ? Number(id) : String(id),
    timestamp,
    fullName: row.fullName || row.full_name || '',
    phone: row.phone || '',
    jerseyNumber: row.jerseyNumber || row.jersey_number || '',
    jerseySize: row.jerseySize || row.jersey_size || '',
    position: row.position || '',
    health: row.health || '',
    height: row.height || '',
    weight: row.weight || '',
    speed: row.speed || '',
    stamina: row.stamina || '',
    technique: row.technique || '',
    tactic: row.tactic || '',
    physical: row.physical || '',
    diet: row.diet || '',
    transport: row.transport || '',
    notes: row.notes || ''
  };
}

function registrationToSheetRow(row) {
  return [
    String(row.id || ''),
    row.timestamp || '',
    row.fullName || '',
    row.phone || '',
    row.jerseyNumber || '',
    row.jerseySize || '',
    row.position || '',
    row.health || '',
    row.height || '',
    row.weight || '',
    row.speed || '',
    row.stamina || '',
    row.technique || '',
    row.tactic || '',
    row.physical || '',
    row.diet || '',
    row.transport || '',
    row.notes || ''
  ];
}

function sheetRowToRegistration(values, index) {
  const v = values || [];
  return normalizeRegistration({
    id: v[0] || Date.now() + index,
    timestamp: v[1] || '',
    fullName: v[2] || '',
    phone: v[3] || '',
    jerseyNumber: v[4] || '',
    jerseySize: v[5] || '',
    position: v[6] || '',
    health: v[7] || '',
    height: v[8] || '',
    weight: v[9] || '',
    speed: v[10] || '',
    stamina: v[11] || '',
    technique: v[12] || '',
    tactic: v[13] || '',
    physical: v[14] || '',
    diet: v[15] || '',
    transport: v[16] || '',
    notes: v[17] || ''
  }, v[0] || Date.now() + index);
}

function readRegistrationsLocal() {
  return readJsonArray(REGISTRATIONS_FILE).map((row, i) => normalizeRegistration(row, row.id ?? Date.now() + i));
}

function writeRegistrationsLocal(rows) {
  writeJsonArray(REGISTRATIONS_FILE, rows);
}

function syncLocalPhotos() {
  return readJsonArray(PHOTOS_FILE);
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

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function appsScriptRequest(payload) {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_APPS_SCRIPT_URL) {
      return reject(new Error('GOOGLE_APPS_SCRIPT_URL is not configured'));
    }

    const body = JSON.stringify(payload);
    const url = new URL(GOOGLE_APPS_SCRIPT_URL);

    const req = https.request({
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Accept: 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const statusCode = res.statusCode || 0;
        let parsed = data;
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch {
          parsed = data;
        }

        if (statusCode >= 400) {
          const detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          return reject(new Error(`HTTP ${statusCode} Apps Script request failed: ${detail}`));
        }

        resolve(parsed);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchGoogleRegistrations() {
  const data = await appsScriptRequest({ action: 'read' });
  const rows = Array.isArray(data.rows) ? data.rows : [];
  return rows.map((row, index) => normalizeRegistration(row, row.id ?? Date.now() + index));
}

async function replaceGoogleRegistrations(rows) {
  await appsScriptRequest({
    action: 'replace',
    rows: rows.map(row => ({
      id: row.id || '',
      timestamp: row.timestamp || '',
      fullName: row.fullName || '',
      phone: row.phone || '',
      jerseyNumber: row.jerseyNumber || '',
      jerseySize: row.jerseySize || '',
      position: row.position || '',
      health: row.health || '',
      height: row.height || '',
      weight: row.weight || '',
      speed: row.speed || '',
      stamina: row.stamina || '',
      technique: row.technique || '',
      tactic: row.tactic || '',
      physical: row.physical || '',
      diet: row.diet || '',
      transport: row.transport || '',
      notes: row.notes || ''
    }))
  });
}

async function resolveRegistrations() {
  const local = readRegistrationsLocal();
  if (!GOOGLE_ENABLED) return local;

  try {
    const sheetRows = await fetchGoogleRegistrations();
    if (sheetRows.length) {
      writeRegistrationsLocal(sheetRows);
      return sheetRows;
    }

    if (local.length) {
      await replaceGoogleRegistrations(local);
      writeRegistrationsLocal(local);
      return local;
    }

    return [];
  } catch (e) {
    console.error('Google Sheets read error:', e.message);
    return local;
  }
}

async function persistRegistrations(rows) {
  writeRegistrationsLocal(rows);
  if (!GOOGLE_ENABLED) return;
  await replaceGoogleRegistrations(rows);
}

function convertToExportRows(rows) {
  return rows.map((d, i) => ({
    stt: i + 1,
    fullName: d.fullName,
    phone: d.phone,
    jerseyNumber: d.jerseyNumber,
    jerseySize: d.jerseySize,
    position: d.position,
    health: d.health,
    height: d.height,
    weight: d.weight,
    speed: d.speed,
    stamina: d.stamina,
    technique: d.technique,
    tactic: d.tactic,
    physical: d.physical,
    diet: d.diet,
    transport: d.transport,
    notes: d.notes,
    timestamp: d.timestamp
  }));
}

const server = http.createServer((req, res) => {
  const pathname = getPathname(req.url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (pathname.startsWith('/uploads/')) {
    const file = path.join(__dirname, pathname);
    if (!file.startsWith(UPLOADS_DIR)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const mime = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4'
      }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
    return;
  }

  if (pathname === '/api/meta' && req.method === 'GET') {
    sendJson(res, 200, {
      googleSheets: GOOGLE_ENABLED,
      source: GOOGLE_ENABLED ? 'Google Apps Script' : 'Local cache only',
      appsScript: GOOGLE_ENABLED ? 'configured' : 'not configured',
      localCache: true
    });
    return;
  }

  if (pathname === '/api/registrations' && req.method === 'GET') {
    (async () => {
      const rows = await resolveRegistrations();
      sendJson(res, 200, rows);
    })().catch(err => {
      console.error('GET registrations error:', err.message);
      sendJson(res, 200, readRegistrationsLocal());
    });
    return;
  }

  if (pathname === '/api/register' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      (async () => {
        const d = JSON.parse(body || '{}');
        const row = normalizeRegistration({
          id: Date.now(),
          timestamp: new Date().toLocaleString('vi-VN'),
          fullName: d.fullName || '',
          phone: d.phone || '',
          jerseyNumber: d.jerseyNumber || '',
          jerseySize: d.jerseySize || '',
          position: d.position || '',
          health: d.health || '',
          height: d.height || '',
          weight: d.weight || '',
          speed: d.speed || '',
          stamina: d.stamina || '',
          technique: d.technique || '',
          tactic: d.tactic || '',
          physical: d.physical || '',
          diet: d.diet || '',
          transport: d.transport || '',
          notes: d.notes || ''
        });

        const rows = await resolveRegistrations();
        const nextRows = [...rows, row];
        await persistRegistrations(nextRows);
        sendJson(res, 200, { success: true, id: row.id });
      })().catch(err => {
        console.error('POST registrations error:', err.message);
        sendJson(res, 500, { success: false, message: 'Could not save registration' });
      });
    });
    return;
  }

  if (pathname.startsWith('/api/registrations/') && req.method === 'DELETE') {
    const id = pathname.split('/').pop();
    (async () => {
      const rows = await resolveRegistrations();
      const nextRows = rows.filter(row => String(row.id) !== String(id));
      await persistRegistrations(nextRows);
      sendJson(res, 200, { success: true });
    })().catch(err => {
      console.error('DELETE registrations error:', err.message);
      sendJson(res, 500, { success: false, message: 'Could not delete registration' });
    });
    return;
  }

  if (pathname === '/api/photos' && req.method === 'GET') {
    sendJson(res, 200, syncLocalPhotos());
    return;
  }

  if (pathname === '/api/photos/upload' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const ct = req.headers['content-type'] || '';
        const bm = ct.match(/boundary=(.+)/);
        if (!bm) {
          res.writeHead(400);
          res.end('No boundary');
          return;
        }
        const parts = parseMultipart(buffer, bm[1]);
        const fp = parts.find(p => p.filename);
        const quarter = parts.find(p => p.name === 'quarter')?.data.toString() || 'Q1';
        const caption = parts.find(p => p.name === 'caption')?.data.toString() || '';
        if (!fp) {
          res.writeHead(400);
          res.end('No file');
          return;
        }
        const ext = path.extname(fp.filename) || '.jpg';
        const fname = `photo_${Date.now()}${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, fname), fp.data);
        const photos = readJsonArray(PHOTOS_FILE);
        photos.push({
          id: Date.now(),
          filename: fname,
          url: `/uploads/${fname}`,
          quarter,
          caption,
          uploadedAt: new Date().toLocaleString('vi-VN')
        });
        writeJsonArray(PHOTOS_FILE, photos);
        sendJson(res, 200, { success: true });
      } catch (e) {
        console.error('Upload error:', e.message);
        res.writeHead(500);
        res.end('Error');
      }
    });
    return;
  }

  if (pathname.startsWith('/api/photos/') && req.method === 'DELETE') {
    const id = parseInt(pathname.split('/').pop(), 10);
    let photos = readJsonArray(PHOTOS_FILE);
    const photo = photos.find(p => p.id === id);
    if (photo) {
      const fp = path.join(UPLOADS_DIR, photo.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    photos = photos.filter(p => p.id !== id);
    writeJsonArray(PHOTOS_FILE, photos);
    sendJson(res, 200, { success: true });
    return;
  }

  if (pathname === '/api/export/csv') {
    (async () => {
      const rows = await resolveRegistrations();
      const h = ['STT', 'Ho Ten', 'SDT', 'So Ao', 'Size', 'Vi Tri', 'Suc Khoe', 'Cao', 'Nang', 'Toc Do', 'Suc Ben', 'Ky Thuat', 'Chien Thuat', 'The Luc', 'Che Do An', 'Phuong Tien', 'Ghi Chu', 'Ngay Tao'];
      const csvRows = convertToExportRows(rows).map(d => [
        d.stt, d.fullName, d.phone, d.jerseyNumber, d.jerseySize, d.position, d.health, d.height, d.weight,
        d.speed, d.stamina, d.technique, d.tactic, d.physical, d.diet, d.transport, d.notes, d.timestamp
      ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','));
      const csv = '\uFEFF' + [h.join(','), ...csvRows].join('\r\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment;filename="sport-club.csv"'
      });
      res.end(csv);
    })().catch(err => {
      console.error('CSV export error:', err.message);
      res.writeHead(500);
      res.end('Error');
    });
    return;
  }

  if (pathname === '/api/export/xlsx') {
    (async () => {
      const rows = await resolveRegistrations();
      const esc = v => (v || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const cell = v => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
      const h = ['STT', 'Ho Ten', 'SDT', 'So Ao', 'Size', 'Vi Tri', 'Suc Khoe', 'Cao', 'Nang', 'Toc Do', 'Suc Ben', 'Ky Thuat', 'Chien Thuat', 'The Luc', 'Che Do An', 'Phuong Tien', 'Ghi Chu', 'Ngay Tao'];
      let xmlRows = `<Row>${h.map(cell).join('')}</Row>`;
      convertToExportRows(rows).forEach(d => {
        xmlRows += `<Row>${[
          d.stt, d.fullName, d.phone, d.jerseyNumber, d.jerseySize, d.position, d.health, d.height, d.weight,
          d.speed, d.stamina, d.technique, d.tactic, d.physical, d.diet, d.transport, d.notes, d.timestamp
        ].map(cell).join('')}</Row>`;
      });
      const xlsx = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="DanhSach"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
      res.writeHead(200, {
        'Content-Type': 'application/vnd.ms-excel;charset=utf-8',
        'Content-Disposition': 'attachment;filename="sport-club.xls"'
      });
      res.end('\uFEFF' + xlsx);
    })().catch(err => {
      console.error('XLS export error:', err.message);
      res.writeHead(500);
      res.end('Error');
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sport Club server running on port ${PORT}`);
  console.log(`Google Apps Script enabled: ${GOOGLE_ENABLED ? 'yes' : 'no'}`);
});
