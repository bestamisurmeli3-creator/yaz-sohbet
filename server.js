const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const ODALAR = { genel: [], radyo: [] };   // geçmiş mesajlar
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

const yayinlaKullanicilar = (oda) => {
  const liste = odadakiler(oda).map(c => c.ad);
  odadakiler(oda).forEach(c => send(c, { t: 'users', users: liste }));
};

wss.on('connection', (ws) => {
  ws.ad = '';
  ws.oda = 'genel';

  ws.on('message', (message) => {
    try {
      const m = JSON.parse(message);

      // Kullanıcı Giriş Yaptığında
      if (m.t === 'join') {
        const isimAlindiMi = [...wss.clients].some(c => c.ad && c.ad.toLowerCase() === m.name.trim().toLowerCase());
        if (isimAlindiMi) {
          return send(ws, { t: 'err', m: 'Bu kullanıcı adı zaten alınmış.' });
        }
        ws.ad = m.name.trim().substring(0, 20);
        ws.oda = m.room || 'genel';
        
        send(ws, { t: 'joined', name: ws.ad });
        send(ws, { t: 'hist', msgs: ODALAR[ws.oda] || [] });
        
        odadakiler(ws.oda).forEach(c => {
          if (c !== ws) send(c, { t: 'sys', text: `${ws.ad} sohbete katıldı.` });
        });
        yayinlaKullanicilar(ws.oda);
      }

      // Mesaj Gönderildiğinde
      else if (m.t === 'msg' && ws.ad) {
        const yeniMesaj = { t: 'msg', from: ws.ad, text: m.text.substring(0, 500), ts: Date.now() };
        if (!ODALAR[ws.oda]) ODALAR[ws.oda] = [];
        ODALAR[ws.oda].push(yeniMesaj);
        if (ODALAR[ws.oda].length > GECMIS) ODALAR[ws.oda].shift();

        odadakiler(ws.oda).forEach(c => send(c, yeniMesaj));
      }

      // Oda Değiştirildiğinde
      else if (m.t === 'room' && ws.ad && m.room !== ws.oda) {
        const eskiOda = ws.oda;
        odadakiler(eskiOda).forEach(c => {
          if (c !== ws) send(c, { t: 'sys', text: `${ws.ad} odadan ayrıldı.` });
        });
        
        ws.oda = m.room;
        if (!ODALAR[ws.oda]) ODALAR[ws.oda] = [];
        
        send(ws, { t: 'hist', msgs: ODALAR[ws.oda] });
        
        odadakiler(ws.oda).forEach(c => {
          if (c !== ws) send(c, { t: 'sys', text: `${ws.ad} odaya geldi.` });
        });
        
        yayinlaKullanicilar(eskiOda);
        yayinlaKullanicilar(ws.oda);
      }
    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    if (ws.ad) {
      odadakiler(ws.oda).forEach(c => send(c, { t: 'sys', text: `${ws.ad} sohbetten ayrıldı.` }));
      yayinlaKullanicilar(ws.oda);
    }
  });
});

server.listen(PORT, () => console.log(`Sunucu ${PORT} portunda calisiyor.`));
