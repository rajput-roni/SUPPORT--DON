const express = require("express");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const multer = require("multer");
const {
  default: Gifted_Tech,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
} = require("maher-zubair-baileys");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Corrected multer usage
const upload = multer({ dest: "uploads/" });

let waClient = null;
let connectedNumber = null;

// Home page
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Auto Sender</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      background: url('https://source.unsplash.com/1600x900/?whatsapp,technology') no-repeat center center fixed;
      background-size: cover;
    }
    .container {
      background: rgba(255,255,255,0.85);
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      border-radius: 2xl;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    }
    h1 {
      text-align: center;
      color: #333;
      margin-bottom: 20px;
    }
    form {
      display: flex;
      flex-direction: column;
    }
    label {
      margin-top: 10px;
      color: #555;
    }
    input, select, button {
      padding: 10px;
      margin-top: 5px;
      border-radius: 8px;
      border: 1px solid #ccc;
      font-size: 1rem;
    }
    button {
      background-color: #25D366;
      color: white;
      border: none;
      cursor: pointer;
      font-weight: bold;
      margin-top: 15px;
    }
    button:hover {
      background-color: #128C7E;
    }
    hr { margin: 30px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>WhatsApp Auto Sender</h1>
    <form action="/code" method="get">
      <label for="number">Your WhatsApp Number (with country code):</label>
      <input type="text" id="number" name="number" placeholder="e.g. 911234567890" required />
      <button type="submit">Generate Pairing Code</button>
    </form>
    <hr />
    <form action="/send-message" method="post" enctype="multipart/form-data">
      <label for="targetType">Select Target Type:</label>
      <select id="targetType" name="targetType" required>
        <option value="individual">Individual</option>
        <option value="group">Group</option>
      </select>
      <label for="target">Target Number / Group UID:</label>
      <input type="text" id="target" name="target" placeholder="e.g. 911234567890 or 12345-67890@g.us" required />
      <label for="messageFile">Upload Message File (.txt):</label>
      <input type="file" id="messageFile" name="messageFile" accept=".txt" required />
      <label for="delaySec">Delay between messages (seconds):</label>
      <input type="number" id="delaySec" name="delaySec" value="5" min="1" required />
      <button type="submit">Start Sending</button>
    </form>
  </div>
</body>
</html>
  `);
});

// Generate pairing code
app.get("/code", async (req, res) => {
  const id = Math.random().toString(36).substr(2, 8);
  const tempPath = path.join(__dirname, "temp", id);
  if (!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

  let num = req.query.number;
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
      return res.send(`
        <p style="font-family:Arial; text-align:center; margin-top:50px;">
          <strong>Pairing Code:</strong> ${code}
        </p>
        <p style="text-align:center;"><a href="/">Go Back</a></p>
      `);
    }

    waClient.ev.on("creds.update", saveCreds);
    waClient.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "open") {
        console.log("WhatsApp Connected!");
        await delay(5000);
      } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
        console.log("Reconnecting...");
        await delay(10000);
        app.get(":/code");
      }
    });
  } catch (err) {
    console.error("Error in pairing:", err);
    return res.send(`
      <p style="color:red; text-align:center; margin-top:50px;"><strong>Error:</strong> Service Unavailable</p>
      <p style="text-align:center;"><a href="/">Go Back</a></p>
    `);
  }
});

// Send message
app.post("/send-message", upload.single("messageFile"), async (req, res) => {
  if (!waClient) {
    return res.send(`
      <p style="color:red; text-align:center; margin-top:50px;"><strong>Error:</strong> WhatsApp not connected</p>
      <p style="text-align:center;"><a href="/">Go Back</a></p>
    `);
  }

  const { target, targetType, delaySec } = req.body;
  const filePath = req.file ? req.file.path : null;

  if (!target || !filePath || !targetType) {
    return res.send(`
      <p style="color:red; text-align:center; margin-top:50px;"><strong>Error:</strong> Missing required fields</p>
      <p style="text-align:center;"><a href="/">Go Back</a></p>
    `);
  }

  try {
    const messages = fs.readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((msg) => msg.trim() !== "");

    let index = 0;
    (async function sendLoop() {
      while (true) {
        const msg = messages[index];
        const recipient =
          targetType === "group"
            ? `${target}@g.us`
            : `${target}@s.whatsapp.net`;

        await waClient.sendMessage(recipient, { text: msg });
        console.log(`Sent: ${msg} to ${recipient}`);

        index = (index + 1) % messages.length;
        await delay(delaySec * 1000);
      }
    })();

    res.send(`
      <p style="font-family:Arial; text-align:center; margin-top:50px;"><strong>Sending started!</strong> Check console logs.</p>
      <p style="text-align:center;"><a href="/">Back to Home</a></p>
    `);
  } catch (error) {
    console.error("Error while sending messages:", error);
    return res.send(`
      <p style="color:red; text-align:center; margin-top:50px;"><strong>Error:</strong> Failed to send messages</p>
      <p style="text-align:center;"><a href="/">Go Back</a></p>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
