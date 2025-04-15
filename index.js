const express = require("express");
const fs = require("fs");
const pino = require("pino");
const multer = require("multer");
const {
  default: Gifted_Tech,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
} = require("maher-zubair-baileys");

const app = express();
const PORT = 5000;

if (!fs.existsSync("temp")) fs.mkdirSync("temp");
const upload = multer({ dest: "uploads/" });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let waClient = null;
let connectedNumber = null;

app.get("/", (req, res) => {
  res.send(`
    <html>
    <head>
      <title>WhatsApp Message Sender</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-image: url('https://i.ibb.co/RGF1WQ1v/background.jpg');
          background-size: cover;
          background-position: center;
          font-family: Arial, sans-serif;
          color: #fff;
          text-align: center;
        }
        h2 {
          margin-top: 40px;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.7);
        }
        .box {
          max-width: 400px;
          margin: 20px auto;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
        .code-box { background: rgba(255, 255, 0, 0.8); }
        .send-box { background: rgba(0, 128, 255, 0.8); }
        input, button, select {
          width: 100%;
          margin: 10px 0;
          padding: 10px;
          font-size: 16px;
          border: none;
          border-radius: 5px;
        }
        button { cursor: pointer; font-weight: bold; }
      </style>
    </head>
    <body>
      <h2>WhatsApp Auto Sender</h2>
      <div class="box code-box">
        <form action="/code" method="GET">
          <input type="text" name="number" placeholder="Enter Your WhatsApp Number" required>
          <button type="submit">Generate Pairing Code</button>
        </form>
      </div>
      <div class="box send-box">
        <form action="/send-message" method="POST" enctype="multipart/form-data">
          <select name="targetType" required>
            <option value="">-- Select Target Type --</option>
            <option value="number">Target Number</option>
            <option value="group">Group UID</option>
          </select>
          <input type="text" name="target" placeholder="Enter Target Number / Group UID" required>
          <input type="file" name="messageFile" accept=".txt" required>
          <input type="number" name="delaySec" placeholder="Delay in Seconds" required>
          <button type="submit">Send Message</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.get("/code", async (req, res) => {
  const id = Math.random().toString(36).substr(2, 8);
  const tempPath = `temp/${id}`;
  const number = req.query.number.replace(/[^0-9]/g, "");

  if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

  try {
    const { state, saveCreds } = await useMultiFileAuthState(tempPath);

    waClient = Gifted_Tech({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
      },
      printQRInTerminal: false,
      logger: pino({ level: "fatal" }),
      browser: ["Chrome (Linux)", "", ""],
    });

    if (!waClient.authState.creds.registered) {
      await delay(1500);
      const code = await waClient.requestPairingCode(number);
      connectedNumber = number;
      res.send(`<h2>Pairing Code: ${code}</h2><br><a href="/">Go Back</a>`);
    } else {
      res.send(`<h2>Already Registered</h2><br><a href="/">Go Back</a>`);
    }

    waClient.ev.on("creds.update", saveCreds);
    waClient.ev.on("connection.update", async (s) => {
      const { connection, lastDisconnect } = s;
      if (connection == "open") {
        console.log("WhatsApp Connected!");
      } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
        console.log("Reconnecting...");
        await delay(10000); // Wait before retrying
      }
    });
  } catch (err) {
    console.error(err);
    res.send(`<h2>Error: Service Unavailable</h2><br><a href="/">Go Back</a>`);
  }
});

app.post("/send-message", upload.single("messageFile"), async (req, res) => {
  if (!waClient) {
    return res.send(`<h2>Error: WhatsApp not connected</h2><br><a href="/">Go Back</a>`);
  }

  const { target, targetType, delaySec } = req.body;
  const filePath = req.file?.path;

  if (!target || !filePath || !targetType) {
    return res.send(`<h2>Error: Missing required fields</h2><br><a href="/">Go Back</a>`);
  }

  try {
    const messages = fs.readFileSync(filePath, "utf-8")
      .split("\n")
      .map(m => m.trim())
      .filter(Boolean);

    let index = 0;

    const sendLoop = async () => {
      while (index < messages.length) {
        const msg = messages[index];
        const recipient = targetType === "group" ? `${target}@g.us` : `${target}@s.whatsapp.net`;

        await waClient.sendMessage(recipient, { text: msg });
        console.log(`Sent: ${msg} to ${recipient}`);

        index++;
        if (index >= messages.length) index = 0; // Reset to start
        await delay(delaySec * 1000);
      }
    };

    sendLoop(); // fire-and-forget
    res.send(`<h2>Message sending started in background</h2><br><a href="/">Go Back</a>`);
  } catch (error) {
    console.error(error);
    res.send(`<h2>Error: Failed to send messages</h2><br><a href="/">Go Back</a>`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
