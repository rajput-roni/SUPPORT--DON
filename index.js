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
if (!fs.existsSync("temp")) {
  fs.mkdirSync("temp");
}

const upload = multer({ dest: "uploads/" });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let waClient = null;

// Home page: pairing + SMS forms
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>WhatsApp Auto Sender</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      background: url('https://i.postimg.cc/vB9RYNYd/1c03e985a3c70572a37c32719b356ccb.jpg') no-repeat center center fixed;
      background-size: cover;
      color: #fff;
      text-align: center;
    }
    h1 {
      margin-top: 40px;
      font-size: 2.5em;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.7);
    }
    .box {
      background: rgba(0,0,0,0.6);
      margin: 30px auto;
      padding: 20px;
      border-radius: 12px;
      width: 90%;
      max-width: 400px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.5);
    }
    .box input,
    .box select,
    .box button {
      width: 100%;
      padding: 12px;
      margin: 10px 0;
      border: none;
      border-radius: 6px;
      font-size: 1em;
    }
    .box input, .box select {
      background: #eee;
      color: #333;
    }
    .box button {
      background: #28a745;
      color: #fff;
      font-weight: bold;
      cursor: pointer;
    }
    .box button:hover {
      background: #218838;
    }
  </style>
</head>
<body>
  <h1>WhatsApp Auto Sender</h1>

  <div class="box">
    <h2>Generate Pairing Code</h2>
    <form action="/code" method="GET">
      <input type="text" name="number" placeholder="Enter Your WhatsApp Number" required />
      <button type="submit">Get Code</button>
    </form>
  </div>

  <div class="box">
    <h2>Send SMS</h2>
    <form action="/send-message" method="POST" enctype="multipart/form-data">
      <select name="targetType" required>
        <option value="">-- Select Target Type --</option>
        <option value="number">Target Number</option>
        <option value="group">Group UID</option>
      </select>
      <input type="text" name="target" placeholder="Enter Number / Group UID" required />
      <input type="file" name="messageFile" accept=".txt" required />
      <input type="number" name="delaySec" placeholder="Delay in Seconds" required />
      <button type="submit">Send Message 24×7</button>
    </form>
  </div>
</body>
</html>`);
});

// Pairing code endpoint
app.get("/code", async (req, res) => {
  const id = Math.random().toString(36).substr(2, 8);
  const tempPath = `temp/${id}`;
  if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

  const num = req.query.number.replace(/[^0-9]/g, "");

  const { state, saveCreds } = await useMultiFileAuthState(tempPath);
  waClient = Gifted_Tech({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
    },
    printQRInTerminal: false,
    logger: pino({ level: "fatal" })
  });

  if (!waClient.authState.creds.registered) {
    await delay(1500);
    const code = await waClient.requestPairingCode(num);
    return res.send(`
      <h2>Pairing Code: ${code}</h2>
      <a href="/">Go Back</a>
    `);
  }

  waClient.ev.on("creds.update", saveCreds);
  waClient.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("WhatsApp Connected");
    } else if (
      connection === "close" &&
      lastDisconnect?.error?.output?.statusCode !== 401
    ) {
      console.log("Reconnecting...");
      await delay(10000);
      req.query.number = num;
      await app._router.handle(req, res, () => {});
    }
  });
});

// SMS sending endpoint
app.post("/send-message", upload.single("messageFile"), async (req, res) => {
  if (!waClient) {
    return res.send(`<h2>Error: WhatsApp not connected</h2><a href="/">Go Back</a>`);
  }

  const { target, targetType, delaySec } = req.body;
  const filePath = req.file?.path;
  if (!target || !filePath || !targetType) {
    return res.send(`<h2>Error: Missing fields</h2><a href="/">Go Back</a>`);
  }

  const messages = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((m) => m.trim());

  let idx = 0;
  // infinite loop for 24×7 messages
  while (true) {
    const msg = messages[idx];
    const recipient = targetType === "group" ? `${target}@g.us` : `${target}@s.whatsapp.net`;
    await waClient.sendMessage(recipient, { text: msg });
    console.log(`Sent: ${msg}`);
    idx = (idx + 1) % messages.length;
    await delay(parseInt(delaySec) * 1000);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
