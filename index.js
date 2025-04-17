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

// Ensure directories exist
if (!fs.existsSync("temp")) fs.mkdirSync("temp");
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

const upload = multer({ dest: "uploads/" });

let waClient = null;
let connectedNumber = null;
let availableGroups = [];

// Serve main page
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WhatsApp Auto Sender</title>
  <style>
    body {
      margin: 0; padding: 0;
      font-family: Arial, sans-serif;
      background: url('https://source.unsplash.com/1600x900/?whatsapp') no-repeat center center fixed;
      background-size: cover;
      background-color: #000;
      background-blend-mode: multiply;
    }
    .container {
      background: rgba(255,255,255,0.9);
      max-width: 700px;
      margin: 40px auto;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    }
    h1 { text-align: center; color: #333; }
    .section { margin-top: 30px; }
    label { display: block; margin-top: 10px; color: #555; }
    input, select, textarea, button {
      width: 100%;
      padding: 10px;
      margin-top: 5px;
      border-radius: 6px;
      border: 1px solid #ccc;
      font-size: 1rem;
      box-sizing: border-box;
    }
    button {
      background-color: #25D366;
      color: #fff;
      border: none;
      cursor: pointer;
      font-weight: bold;
      margin-top: 20px;
    }
    button:hover { background-color: #128C7E; }
    #groupContainer, #numberContainer { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>WhatsApp Auto Sender</h1>
    <div class="section">
      <h2>1. Connect WhatsApp</h2>
      <form action="/code" method="get" id="connectForm">
        <label for="number">Your WhatsApp Number (with country code):</label>
        <input type="text" id="number" name="number" placeholder="e.g. 911234567890" required />
        <button type="submit">Generate &amp; Show Pairing Code</button>
      </form>
    </div>
    <div class="section">
      <h2>2. Send Messages</h2>
      <form action="/send-message" method="post" enctype="multipart/form-data" id="sendForm">
        <label for="targetType">Select Target Type:</label>
        <select id="targetType" name="targetType" required>
          <option value="">-- choose --</option>
          <option value="individual">Individual Numbers</option>
          <option value="group">WhatsApp Groups</option>
        </select>
        <div id="groupContainer">
          <label>Select Groups:</label>
          <button type="button" onclick="loadGroups()">Load Groups</button>
          <select id="groupSelect" multiple size="5"></select>
        </div>
        <div id="numberContainer">
          <label>Enter Numbers (comma-separated):</label>
          <textarea id="numbers" placeholder="911234567890,919876543210,..."></textarea>
        </div>
        <label for="messageFile">Upload Message File (.txt):</label>
        <input type="file" id="messageFile" name="messageFile" accept=".txt" required />
        <label for="delaySec">Delay between messages (seconds):</label>
        <input type="number" id="delaySec" name="delaySec" value="1" min="0" required />
        <input type="hidden" name="targets" id="targetsInput" />
        <button type="submit">Start Sending</button>
      </form>
    </div>
  </div>
  <script>
    const targetType = document.getElementById('targetType');
    const groupContainer = document.getElementById('groupContainer');
    const numberContainer = document.getElementById('numberContainer');
    const groupSelect = document.getElementById('groupSelect');
    const numbers = document.getElementById('numbers');
    const targetsInput = document.getElementById('targetsInput');

    targetType.addEventListener('change', () => {
      if(targetType.value === 'group') {
        groupContainer.style.display = 'block';
        numberContainer.style.display = 'none';
      } else if(targetType.value === 'individual') {
        groupContainer.style.display = 'none';
        numberContainer.style.display = 'block';
      } else {
        groupContainer.style.display = 'none';
        numberContainer.style.display = 'none';
      }
    });

    function loadGroups() {
      fetch('/groups').then(r => r.json()).then(list => {
        groupSelect.innerHTML = '';
        list.forEach(g => {
          const opt = document.createElement('option');
          opt.value = g.id;
          opt.textContent = g.name;
          groupSelect.appendChild(opt);
        });
      });
    }

    document.getElementById('sendForm').addEventListener('submit', () => {
      let targets = [];
      if(targetType.value === 'group') {
        targets = Array.from(groupSelect.selectedOptions).map(o=>o.value);
      } else if(targetType.value === 'individual') {
        targets = numbers.value.split(',').map(s=>s.trim()).filter(s=>s);
      }
      targetsInput.value = targets.join(',');
    });
  </script>
</body>
</html>
  `);
});

// Generate pairing code
app.get("/code", async (req, res) => {
  const id = Math.random().toString(36).slice(2);
  const tempPath = path.join(__dirname, "temp", id);
  if(!fs.existsSync(tempPath)) fs.mkdirSync(tempPath, { recursive: true });

  const number = req.query.number.replace(/\D/g, "");
  const { state, saveCreds } = await useMultiFileAuthState(tempPath);
  try {
    waClient = Gifted_Tech({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({level:'fatal'}).child({level:'fatal'})) },
      printQRInTerminal: false,
      logger: pino({level:'fatal'}).child({level:'fatal'}),
      browser: ["Chrome", "Linux", ""],
    });
    if(!waClient.authState.creds.registered) {
      await delay(100);
      const code = await waClient.requestPairingCode(number);
      connectedNumber = number;
      return res.send(`<p style="text-align:center; font-family:Arial; margin-top:50px;"><strong>Pairing Code:</strong> ${code}</p><p style="text-align:center;"><a href="/">Back</a></p>`);
    }
    waClient.ev.on('creds.update', saveCreds);
    waClient.ev.on('connection.update', async update => {
      const { connection, lastDisconnect } = update;
      if(connection === 'open') {
        // fetch groups once connected
        const groups = await waClient.groupFetchAllParticipating();
        availableGroups = Object.values(groups).map(g=>({id:g.id,name:g.subject}));
      } else if(connection === 'close' && lastDisconnect.error.output.statusCode!==401) {
        await delay(1000);
        waClient = null;
      }
    });
  } catch(e) {
    return res.send(`<p style="color:red; text-align:center; margin-top:50px;">Connection error</p><p style="text-align:center;"><a href="/">Back</a></p>`);
  }
});

// Provide group list
app.get('/groups', (req,res) => res.json(availableGroups));

// Send messages
app.post('/send-message', upload.single('messageFile'), async (req,res) => {
  if(!waClient) return res.send(`<p style="color:red; text-align:center; margin-top:50px;">Not connected</p><p style="text-align:center;"><a href="/">Back</a></p>`);
  const { targetType, delaySec } = req.body;
  const targets = (req.body.targets||"").split(',').filter(s=>s);
  const filePath = req.file?.path;
  if(!targets.length || !filePath) return res.send(`<p style="color:red; text-align:center; margin-top:50px;">Missing inputs</p><p style="text-align:center;"><a href="/">Back</a></p>`);
  const msgs = fs.readFileSync(filePath,'utf-8').split("\n").filter(m=>m.trim());
  (async()=>{
    for(const t of targets) {
      const recipient = targetType==='group'? `${t}@g.us` : `${t}@s.whatsapp.net`;
      for(const m of msgs) {
        await waClient.sendMessage(recipient,{text:m});
        await delay(Math.max(0,parseInt(delaySec)||1)*1000);
      }
    }
  })();
  res.send(`<p style="text-align:center; margin-top:50px;">Started sending to ${targets.length} targets.</p><p style="text-align:center;"><a href="/">Back</a></p>`);
});

app.listen(PORT,()=>console.log(`Server on http://localhost:${PORT}`));
