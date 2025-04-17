const express = require("express");
const fs = require("fs");
const pino = require("pino");
const multer = require("multer");
const {
  default: Gifted_Tech,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore
} = require("maher-zubair-baileys");

const app = express();
const PORT = 5000;

// temp folder बनाएँ अगर मौजूद नहीं
if (!fs.existsSync("temp")) fs.mkdirSync("temp");

// multipart/form-data के लिए
const upload = multer({ dest: "uploads/" });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let waClient = null;
let isReady = false;  // लॉगिन स्टेट

// Home page: Dynamic pairing या SMS form
app.get("/", (req, res) => {
  if (!isReady) {
    // अभी लॉगिन नहीं हुआ → केवल pairing code बॉक्स
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Login to WhatsApp</title>
  <style>
    body { margin:0;padding:0;font-family:Arial;background:#222;color:#fff;
      background:url('https://i.postimg.cc/vB9RYNYd/1c03e985a3c70572a37c32719b356ccb.jpg')center/cover fixed;
      text-align:center;
    }
    .box { background:rgba(0,0,0,0.7);margin:100px auto;padding:20px;border-radius:10px;
      width:90%;max-width:360px;
    }
    input,button { width:100%;padding:12px;margin:10px 0;border:none;border-radius:6px;font-size:1em; }
    input { background:#fff;color:#000; }
    button { background:#28a745;color:#fff;cursor:pointer; }
    button:hover { background:#218838; }
  </style>
</head>
<body>
  <div class="box">
    <h2>WhatsApp Login</h2>
    <form action="/code" method="GET">
      <input type="text" name="number" placeholder="Enter WhatsApp Number" required/>
      <button type="submit">Get Pairing Code</button>
    </form>
  </div>
</body>
</html>`);
  }

  // लॉगिन हो चुका → SMS भेजने का फॉर्म
  res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Send SMS 24×7</title>
  <style>
    body { margin:0;padding:0;font-family:Arial;background:#222;color:#fff;
      background:url('https://i.postimg.cc/vB9RYNYd/1c03e985a3c70572a37c32719b356ccb.jpg')center/cover fixed;
      text-align:center;
    }
    .box { background:rgba(0,0,0,0.7);margin:50px auto;padding:20px;border-radius:10px;
      width:90%;max-width:360px;
    }
    select,input,button { width:100%;padding:12px;margin:10px 0;border:none;border-radius:6px;font-size:1em; }
    select,input { background:#fff;color:#000; }
    button { background:#007bff;color:#fff;cursor:pointer; }
    button:hover { background:#0056b3; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Send Messages</h2>
    <form action="/send-message" method="POST" enctype="multipart/form-data">
      <select name="targetType" required>
        <option value="">-- Select Target --</option>
        <option value="number">Phone Number</option>
        <option value="group">Group UID</option>
      </select>
      <input type="text" name="target" placeholder="Enter Number or Group UID" required/>
      <input type="file" name="messageFile" accept=".txt" required/>
      <input type="number" name="delaySec" placeholder="Delay in Seconds" required/>
      <button type="submit">Start Sending</button>
    </form>
  </div>
</body>
</html>`);
});

// Pairing code endpoint
app.get("/code", async (req, res) => {
  const num = (req.query.number || "").replace(/[^0-9]/g, "");
  const id = Math.random().toString(36).substr(2, 8);
  const tempPath = `temp/${id}`;
  if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

  // Authentication state setup
  const { state, saveCreds } = await useMultiFileAuthState(tempPath);
  waClient = Gifted_Tech({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
    },
    printQRInTerminal: false,
    logger: pino({ level: "fatal" })
  });

  // अगर पहले से registered नहीं है, तो pairing code भेजें
  if (!waClient.authState.creds.registered) {
    await delay(1500);
    const code = await waClient.requestPairingCode(num);
    // pairing code दिखाएं, फिर home पर वापस जाएं
    return res.send(`<!DOCTYPE html>
<html lang="en"><body style="background:#000;color:#0f0;text-align:center;padding:50px;">
  <h2>Pairing Code:</h2><pre style="font-size:1.5em;">${code}</pre>
  <p>Use this code in your WhatsApp to approve login.</p>
  <meta http-equiv="refresh" content="5;url=/" />
</body></html>`);
  }

  // लॉगिन स्टेट अपडेट
  waClient.ev.on("creds.update", saveCreds);
  waClient.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ WhatsApp Logged In");
      isReady = true;
    } else if (
      connection === "close" &&
      lastDisconnect?.error?.output?.statusCode !== 401
    ) {
      console.log("🔄 Reconnecting...");
      await delay(5000);
      // फिर से pairing flow शुरू करें
      req.query.number = num;
      app._router.handle(req, res, () => {});
    }
  });
});

// SMS भेजने का endpoint
app.post("/send-message", upload.single("messageFile"), async (req, res) => {
  if (!isReady) {
    return res.send(`<h2 style="color:red;text-align:center;">Error: Not logged in</h2><a href="/">Back</a>`);
  }

  const { target, targetType, delaySec } = req.body;
  const filePath = req.file?.path;
  if (!target || !filePath || !targetType) {
    return res.send(`<h2 style="color:red;text-align:center;">Error: Missing fields</h2><a href="/">Back</a>`);
  }

  const messages = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((m) => m.trim());

  let idx = 0;
  while (true) {
    const msg = messages[idx];
    const recipient =
      targetType === "group" ? `${target}@g.us` : `${target}@s.whatsapp.net`;
    await waClient.sendMessage(recipient, { text: msg });
    console.log(`Sent: ${msg}`);
    idx = (idx + 1) % messages.length;
    await delay(parseInt(delaySec) * 1000);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
