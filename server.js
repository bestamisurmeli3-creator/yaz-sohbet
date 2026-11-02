const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const ODALAR = { genel: [], radyo: [] };   // son mesajlar
const GECMIS = 50;

const server = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) { res.writeHead(500); return res.end('index.html bulunamadi'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const odadakiler = (oda) => [...wss.clients].filter(c => c.ad && c.oda === oda);
const yayin = (oda, o) => odadakiler(oda).forEach(c => send(c, o));
const liste = (oda) => yayin(oda, { t: 'users', users: odadakiler(oda).map(c => c.ad).sort() });
const sistem = (oda, text) => yayin(oda, { t: 'sys', text });

function odaGir(ws, oda) {
  if (!ODALAR[oda] || ws.oda === oda) return;
  const eski = ws.oda;
  ws.oda = oda;
  if (eski) { sistem(eski, ws.ad + ' ayrıldı'); liste(eski); }
  send(ws, { t: 'hist', room: oda, msgs: ODALAR[oda] });
  sistem(oda, ws.ad + ' katıldı');
  liste(oda);
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'join' && !ws.ad) {
      const ad = String(m.name || '').trim().slice(0, 20);
      if (ad.length < 2) return send(ws, { t: 'err', m: 'Kullanıcı adı en az 2 harf olmalı' });
      if ([...wss.clients].some(c => c.ad && c.ad.toLowerCase() === ad.toLowerCase()))
        return send(ws, { t: 'err', m: 'Bu isim kullanımda, başka bir isim dene' });
      ws.ad = ad;
      send(ws, { t: 'joined', name: ad });
      odaGir(ws, ODALAR[m.room] ? m.room : 'genel');
    }
    else if (m.t === 'room' && ws.ad) odaGir(ws, m.room);
    else if (m.t === 'msg' && ws.ad && ws.oda) {
      const text = String(m.text || '').trim().slice(0, 500);
      if (!text) return;
      const msg = { t: 'msg', from: ws.ad, text, ts: Date.now() };
      ODALAR[ws.oda].push(msg);
      if (ODALAR[ws.oda].length > GECMIS) ODALAR[ws.oda].shift();
      yayin(ws.oda, msg);
    }
  });

  ws.on('close', () => {
    if (ws.ad && ws.oda) { sistem(ws.oda, ws.ad + ' ayrıldı'); liste(ws.oda); }
  });
});

// bağlantısı kopanları temizle
setInterval(() => wss.clients.forEach(ws => {
  if (!ws.isAlive) return ws.terminate();
  ws.isAlive = false; ws.ping();
}), 30000);

server.listen(PORT, () => console.log('Sohbet sunucusu çalışıyor: ' + PORT));
