const express = require("express");
const fs = require("fs");
const pino = require("pino");
const multer = require("multer");
const {
  default: Gifted_Tech,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
} = require("maher-zubair-baileys");

const app = express();
const PORT = 5000;

if (!fs.existsSync("temp")) {
  fs.mkdirSync("temp");
}

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
        body { background: #ff69b4; color: green; text-align: center; font-size: 20px; }
        input, button, select { display: block; margin: 10px auto; padding: 10px; font-size: 16px; }
        .box { background: yellow; padding: 20px; border-radius: 10px; }
      </style>
    </head>
    <body>
      <h2>WhatsApp Auto Sender</h2>
      <div class="box">
        <form action="/code" method="GET">
          <input type="text" name="number" placeholder="Enter Your WhatsApp Number" required>
          <button type="submit">Generate Pairing Code</button>
        </form>
      </div>

      <div class="box">
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

  if (!fs.existsSync(tempPath)) {
    fs.mkdirSync(tempPath, { recursive: true });
  }

  let num = req.query.number;

  async function GIFTED_MD_PAIR_CODE() {
    const { state, saveCreds } = await useMultiFileAuthState(tempPath);
    try {
      waClient = Gifted_Tech({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: ["Chrome (Linux)", "", ""],
      });

      if (!waClient.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, "");
        const code = await waClient.requestPairingCode(num);
        connectedNumber = num;
        res.send(`<h2>Pairing Code: ${code}</h2><br><a href="/">Go Back</a>`);
      }

      waClient.ev.on("creds.update", saveCreds);
      waClient.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        if (connection == "open") {
          console.log("WhatsApp Connected!");
          await delay(5000);
        } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
          console.log("Reconnecting...");
          await delay(10000);
          GIFTED_MD_PAIR_CODE();
        }
      });
    } catch (err) {
      console.log("Service restarted");
      res.send(`<h2>Error: Service Unavailable</h2><br><a href="/">Go Back</a>`);
    }
  }
  return await GIFTED_MD_PAIR_CODE();
});

app.post("/send-message", upload.single("messageFile"), async (req, res) => {
  if (!waClient) {
    return res.send(`<h2>Error: WhatsApp not connected</h2><br><a href="/">Go Back</a>`);
  }

  const { target, targetType, delaySec } = req.body;
  const filePath = req.file ? req.file.path : null;

  if (!target || !filePath || !targetType) {
    return res.send(`<h2>Error: Missing required fields</h2><br><a href="/">Go Back</a>`);
  }

  try {
    const messages = fs.readFileSync(filePath, "utf-8").split("\n").filter((msg) => msg.trim() !== "");
    let index = 0;

    while (true) {
      const msg = messages[index];
      const recipient = targetType === "group" ? target + "@g.us" : target + "@s.whatsapp.net";

      await waClient.sendMessage(recipient, { text: msg });
      console.log(`Sent: ${msg} to ${target}`);

      index = (index + 1) % messages.length; // Loop back to start if messages end
      await delay(delaySec * 1000);
    }
  } catch (error) {
    console.error(error);
    res.send(`<h2>Error: Failed to send messages</h2><br><a href="/">Go Back</a>`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
