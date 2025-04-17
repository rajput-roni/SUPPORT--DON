const express = require("express"); const fs = require("fs"); const pino = require("pino"); const multer = require("multer"); const { default: Gifted_Tech, useMultiFileAuthState, delay, makeCacheableSignalKeyStore } = require("maher-zubair-baileys");

const app = express(); const PORT = 5000;

// Create temp folder if it doesn't exist defaultTemp = "temp"; if (!fs.existsSync(defaultTemp)) fs.mkdirSync(defaultTemp);

const upload = multer({ dest: "uploads/" }); app.use(express.json()); app.use(express.urlencoded({ extended: true }));

let waClient = null;

// Home page with two boxes: Pairing and SMS app.get("/", (req, res) => { res.send(`<!DOCTYPE html>

<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Auto Sender</title>
  <style>
    body { margin:0; padding:0; font-family:Arial,sans-serif;
      background:url('https://i.postimg.cc/vB9RYNYd/1c03e985a3c70572a37c32719b356ccb.jpg') no-repeat center center fixed;
      background-size:cover; color:#fff; text-align:center;
    }
    h1 { margin:30px 0; text-shadow:2px 2px 4px rgba(0,0,0,0.7); }
    .box { background:rgba(0,0,0,0.6); width:90%; max-width:400px; margin:20px auto; padding:20px; border-radius:10px; }
    .box h2 { margin-bottom:15px; }
    .box input, .box select, .box button { width:100%; padding:10px; margin:10px 0; border:none; border-radius:5px; }
    .box input, .box select { background:#eee; color:#333; }
    .box button { background:#28a745; color:#fff; font-weight:bold; cursor:pointer; }
    .box button:hover { background:#218838; }
  </style>
</head>
<body>
  <h1>WhatsApp Auto Sender</h1>  <div class="box">
    <h2>Generate Pairing Code</h2>
    <form action="/code" method="GET">
      <input type="text" name="number" placeholder="Enter WhatsApp Number" required />
      <button type="submit">Get Pairing Code</button>
    </form>
  </div>  <div class="box">
    <h2>Send Messages</h2>
    <form action="/send-message" method="POST" enctype="multipart/form-data">
      <select name="targetType" required>
        <option value="">-- Select Target Type --</option>
        <option value="number">Target Number</option>
        <option value="group">Group UID</option>
      </select>
      <input type="text" name="target" placeholder="Enter Number or Group UID" required />
      <input type="file" name="messageFile" accept=".txt" required />
      <input type="number" name="delaySec" placeholder="Delay in Seconds" required />
      <button type="submit">Start Sending 24×7</button>
    </form>
  </div>
</body>
</html>`);
});// Pairing code route app.get("/code", async (req, res) => { const num = (req.query.number || "").replace(/[^0-9]/g, ""); const id = Math.random().toString(36).substr(2, 8); const tempPath = temp/${id}; if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

const { state, saveCreds } = await useMultiFileAuthState(tempPath); waClient = Gifted_Tech({ auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })) }, printQRInTerminal: false, logger: pino({ level: 'fatal' }) });

if (!waClient.authState.creds.registered) { await delay(1500); const code = await waClient.requestPairingCode(num); return res.send(`<!DOCTYPE html>

<html><head><title>Pairing Code</title></head><body style="background:#000;color:#0f0;text-align:center;padding:50px;">
  <h2>Pairing Code: ${code}</h2>
  <a href="/" style="color:#0ff;">Back</a>
</body></html>`);
  }waClient.ev.on('creds.update', saveCreds); waClient.ev.on('connection.update', async ({ connection, lastDisconnect }) => { if (connection === 'open') console.log('Connected'); else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) { console.log('Reconnecting...'); await delay(10000); req.query.number = num; app._router.handle(req, res, () => {}); } }); });

// Message sending route app.post("/send-message", upload.single("messageFile"), async (req, res) => { if (!waClient) return res.send(<h2 style="text-align:center;color:red;">Error: Not connected</h2><a href="/">Back</a>);

const { target, targetType, delaySec } = req.body; const filePath = req.file?.path; if (!target || !filePath || !targetType) return res.send(<h2 style="text-align:center;color:red;">Error: Missing fields</h2><a href="/">Back</a>);

const messages = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean); let idx = 0; while (true) { const msg = messages[idx]; const recipient = targetType === 'group' ? ${target}@g.us : ${target}@s.whatsapp.net; await waClient.sendMessage(recipient, { text: msg }); console.log('Sent:', msg); idx = (idx + 1) % messages.length; await delay(parseInt(delaySec) * 1000); } });

app.listen(PORT, () => console.log(Server running: http://localhost:${PORT}));

