const express = require("express");
const fs = require("fs");
const pino = require("pino");
const multer = require("multer");
const { default: Gifted_Tech, useMultiFileAuthState, delay, makeCacheableSignalKeyStore } = require("maher-zubair-baileys");

const app = express();
const PORT = 5000;

// Create temp folder if it doesn't exist
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
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WhatsApp Auto Sender</title>
      <style>
        body {
          background: linear-gradient(135deg, #ff7e5f, #feb47b);
          color: white;
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          flex-direction: column;
        }
        .sms-box {
          background: rgba(0, 0, 0, 0.6);
          padding: 20px;
          border-radius: 10px;
          width: 80%;
          max-width: 500px;
          margin-top: 50px;
        }
        input, select, button {
          padding: 10px;
          margin: 10px;
          border-radius: 5px;
          width: 100%;
          border: none;
        }
        button {
          background: #ff7e5f;
          color: white;
          cursor: pointer;
          font-size: 16px;
        }
        button:hover {
          background: #feb47b;
        }
        h1 {
          font-size: 2.5em;
        }
      </style>
    </head>
    <body>
      <h1>WhatsApp Auto Sender</h1>
      <form action="/send-message" method="POST" enctype="multipart/form-data" class="sms-box">
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
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Pairing Code</title>
            <style>
              body {
                background: url('https://i.ibb.co/7yBzy7K/sample.jpg') no-repeat center center fixed;
                background-size: cover;
                color: green;
                text-align: center;
                padding-top: 100px;
              }
              .result-box {
                background: rgba(255, 235, 59, 0.85);
                padding: 20px;
                border-radius: 10px;
                display: inline-block;
              }
              a { text-decoration: none; color: blue; }
            </style>
          </head>
          <body>
            <div class="result-box">
              <h2>Pairing Code: ${code}</h2>
              <br><a href="/">Go Back</a>
            </div>
          </body>
          </html>
        `);
      }

      waClient.ev.on("creds.update", saveCreds);
      waClient.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        if (connection === "open") {
          console.log("WhatsApp Connected!");
          await delay(5000);
        } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
          console.log("Reconnecting...");
          await delay(10000);
          GIFTED_MD_PAIR_CODE();
        }
      });
    } catch (err) {
      console.error("Error in pairing:", err);
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body>
          <h2>Error: Service Unavailable</h2>
          <br><a href="/">Go Back</a>
        </body>
        </html>
      `);
    }
  }
  return await GIFTED_MD_PAIR_CODE();
});

app.post("/send-message", upload.single("messageFile"), async (req, res) => {
  if (!waClient) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body>
        <h2>Error: WhatsApp not connected</h2>
        <br><a href="/">Go Back</a>
      </body>
      </html>
    `);
  }

  const { target, targetType, delaySec } = req.body;
  const filePath = req.file ? req.file.path : null;

  if (!target || !filePath || !targetType) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body>
        <h2>Error: Missing required fields</h2>
        <br><a href="/">Go Back</a>
      </body>
      </html>
    `);
  }

  try {
    const messages = fs.readFileSync(filePath, "utf-8").split("\n").filter((msg) => msg.trim() !== "");
    let index = 0;

    while (true) {
      const msg = messages[index];
      const recipient = targetType === "group" ? target + "@g.us" : target + "@s.whatsapp.net";
      await waClient.sendMessage(recipient, { text: msg });
      console.log("Sent: " + msg + " to " + target);
      index = (index + 1) % messages.length;
      await delay(delaySec * 1000);
    }
  } catch (error) {
    console.error("Error while sending messages:", error);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body>
        <h2>Error: Failed to send messages</h2>
        <br><a href="/">Go Back</a>
      </body>
      </html>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
