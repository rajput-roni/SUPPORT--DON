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

// Temp folder create karo agar exist nahi karta
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
    <html>
    <head>
      <title>WhatsApp Message Sender</title>
      <style>
        html, body {
          height: 100%;
          margin: 0;
          font-family: Arial, sans-serif;
        }
        body { 
          /* Direct image URL zaroor use karein jiska extension (.jpg/.png) ho */
          background: url('https://i.ibb.co/7yBzy7K/sample.jpg') no-repeat center center fixed;
          background-size: cover;
          color: green;
          text-align: center;
          font-size: 20px;
          position: relative;
        }
        input, button, select { 
          display: block; 
          margin: 10px auto; 
          padding: 10px; 
          font-size: 16px; 
          width: 90%;
          max-width: 600px;
          box-sizing: border-box;
        }
        /* Pairing code box styling */
        .code-box {
          background: rgba(255, 235, 59, 0.85);
          padding: 20px;
          border-radius: 10px;
          width: 300px;
          margin: 30px auto;
        }
        /* SMS sending box ko full screen width dene ke liye update kiya gaya hai */
        .sms-box {
          background: rgba(139, 195, 74, 0.85);
          padding: 20px;
          border-radius: 10px;
          width: 100%;
          box-sizing: border-box;
          position: absolute;
          top: 0;
          left: 0;
        }
        h2 { margin-top: 20px; }
      </style>
    </head>
    <body>
      <h2>WhatsApp Auto Sender</h2>
      <div class="code-box">
        <form action="/code" method="GET">
          <input type="text" name="number" placeholder="Enter Your WhatsApp Number" required>
          <button type="submit">Generate Pairing Code</button>
        </form>
      </div>

      <div class="sms-box">
        <form action="/send-message" method="POST" enctype="multipart/form-data">
          <!-- Naya SMS sender ka naam input field add kiya gaya hai -->
          <input type="text" name="sender" placeholder="Enter SMS Sender Name" required>
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
  // Unique temporary folder generate karne ke liye
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
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
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
                font-family: Arial, sans-serif;
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
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
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
        <head>
          <title>Error</title>
        </head>
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

  // Note: "sender" field ab form se aa raha hai.
  const { sender, target, targetType, delaySec } = req.body;
  const filePath = req.file ? req.file.path : null;

  if (!sender || !target || !filePath || !targetType) {
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
    // File se messages read karna aur empty lines hataana
    const messages = fs.readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((msg) => msg.trim() !== "");
    let index = 0;

    while (true) {
      const msg = messages[index];
      // Recipient determine karna target type ke hisaab se
      const recipient =
        targetType === "group"
          ? target + "@g.us"
          : target + "@s.whatsapp.net";

      // Sender ka naam bhi log mein add kar diya gaya hai
      console.log(\`Sending from: \${sender} | Message: \${msg} to \${target}\`);
      await waClient.sendMessage(recipient, { text: msg });
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
  console.log("Server running on http://localhost:" + PORT);
});
