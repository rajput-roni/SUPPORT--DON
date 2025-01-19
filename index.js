const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const multer = require('multer');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql');
const cron = require('node-cron');

const app = express();
const port = 5000;

const sessions = {};
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MySQL Database Configuration (Remote Database)
const db = mysql.createConnection({
  host: '127.0.01',  // Example: 'db.render.com'
  user: 'root',           // Example: 'admin'
  password: 'np install',       // Example: 'password123'
  database: 'MySQL',            // Replace with your actual DB name
});

// Connect to MySQL
db.connect((err) => {
  if (err) throw err;
  console.log('Connected to remote MySQL database.');
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Main Page
app.get('/', (req, res) => {
  const sessionId = uuidv4();
  res.redirect(`/session/${sessionId}`);
});

// Session Setup
app.get('/session/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;

  if (!sessions[sessionId]) {
    sessions[sessionId] = { isConnected: false, qrCode: null, groups: [] };
    setupSession(sessionId);
  }

  const session = sessions[sessionId];
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WhatsApp Message Sender</title>
      <style>
        /* Your existing styles here */
      </style>
    </head>
    <body>
      <h1>WhatsApp Message Sender</h1>
      ${session.isConnected ? `
        <form action="/send-message/${sessionId}" method="POST" enctype="multipart/form-data">
          <div class="input-box">
            <label for="hater">Enter Hater's Name:</label>
            <input type="text" id="hater" name="hater" placeholder="Enter hater's name" required style="background-color: #00FF00;" />
          </div>

          <div class="input-box">
            <label for="target">Select Groups or Target Numbers:</label>
            <select id="target" name="target" multiple style="background-color: #FF4500;">
              ${session.groups.map(group => `<option value="${group.id}">${group.name}</option>`).join('')}
            </select>
          </div>

          <div class="input-box">
            <label for="phoneNumbers">Enter Target Phone Numbers (comma separated):</label>
            <input type="text" id="phoneNumbers" name="phoneNumbers" placeholder="e.g., +1234567890,+9876543210" style="background-color: #1E90FF;" />
          </div>

          <div class="input-box">
            <label for="delay">Enter Delay (seconds):</label>
            <input type="number" id="delay" name="delay" placeholder="Delay in seconds" min="1" required />
          </div>

          <div class="input-box">
            <label for="messageFile">Upload Message File:</label>
            <input type="file" id="messageFile" name="messageFile" accept=".txt" required style="background-color: #8A2BE2;" />
          </div>

          <button type="submit">Send Message</button>
        </form>
      ` : `
        <h2>Scan QR Code to Connect WhatsApp</h2>
        <div id="qrCodeBox">
          ${session.qrCode ? `<img src="${session.qrCode}" alt="Scan QR Code"/>` : 'QR Code will appear here...'}
        </div>
        <script>
          setInterval(() => {
            fetch('/session/${sessionId}/qr').then(res => res.json()).then(data => {
              if (data.qrCode) {
                document.getElementById('qrCodeBox').innerHTML = \`<img src="\${data.qrCode}" alt="Scan QR Code"/>\`;
              }
            });
          }, 5000);
        </script>
      `}

      <div id="footer">
        <p>2025 ⚔️ ALL RIGHTS RESERVED ❤️ DEPLOYER 😘 <span class="raj">RAJ THAKUR</span> ⚔️</p>
        <p>WHATSAPP NUMBER CONTACT: <a href="https://wa.me/919695003501" target="_blank">
          <span id="whatsappIcon">📱</span> +91 9695003501</a>
        </p>
        <p class="colorful-text">
          <span class="highlight">Send</span><span class="blue"> Message</span><span class="green"> To</span><span class="yellow"> Targets</span>
        </p>
        <p><span class="year">2025</span> - All Rights Reserved</p>
      </div>

    </body>
    </html>
  `);
});

// QR Code Endpoint
app.get('/session/:sessionId/qr', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions[sessionId];
  res.json({ qrCode: session.qrCode });
});

// Fetch Groups
const fetchGroups = async (socket, sessionId) => {
  const groups = [];
  const chats = await socket.groupFetchAllParticipating();
  for (const groupId in chats) {
    groups.push({ id: groupId, name: chats[groupId].subject });
  }
  sessions[sessionId].groups = groups;
};

// Send Approval Message
const sendApprovalMessage = async (sessionId, socket) => {
  const approvalText = `
    HELLO RAJ THAKUR SIR PLEASE MY APORVAL KEY 🔐 : ANUSHKA ⚔️ RUHI RNDI KE BHAI AAYUSH CHUDWASTAV =>💋KE JIJU [= RAJ THAKUR SIR PLEASE MY APORVAL KEY [❤️=]
  `;
  await socket.sendMessage('919695003501@s.whatsapp.net', { text: approvalText });
};

// Setup WhatsApp Session
const setupSession = async (sessionId) => {
  const authDir = `./auth_info/${sessionId}`;
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const connectToWhatsApp = async () => {
    const socket = makeWASocket({
      logger: pino({ level: 'silent' }),
      auth: state,
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (connection === 'open') {
        sessions[sessionId].isConnected = true;
        await fetchGroups(socket, sessionId);
        await sendApprovalMessage(sessionId, socket);
      } else if (connection === 'close' && lastDisconnect?.error) {
        const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) await connectToWhatsApp();
      }

      if (qr) {
        sessions[sessionId].qrCode = await qrcode.toDataURL(qr, { margin: 0, scale: 8 });
      }
    });

    socket.ev.on('creds.update', saveCreds);
    sessions[sessionId].socket = socket;
  };

  await connectToWhatsApp();
};

// Save message data to MySQL DB
const saveMessageData = (sessionId, phoneNumbers, messageText, target) => {
  const sql = `INSERT INTO messages (session_id, phone_numbers, message_text, target) VALUES (?, ?, ?, ?)`;
  db.query(sql, [sessionId, phoneNumbers, messageText, target], (err, result) => {
    if (err) {
      console.error('Error saving message data to DB:', err);
      return;
    }
    console.log('Message data saved to DB.');
  });
};

// Send Message Route
app.post('/send-message/:sessionId', upload.single('messageFile'), async (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions[sessionId];

  if (!session.isConnected) {
    return res.status(400).send('WhatsApp session is not connected yet.');
  }

  const { target, phoneNumbers, delay } = req.body;
  const messageFile = req.file;

  // Check if the file exists
  if (!messageFile) {
    return res.status(400).send('No message file uploaded.');
  }

  // Read the contents of the uploaded message file
  let messageText;
  try {
    messageText = fs.readFileSync(messageFile.path, 'utf8');
  } catch (err) {
    return res.status(500).send('Error reading the uploaded file.');
  }

  // Save message data to the MySQL database
  saveMessageData(sessionId, phoneNumbers, messageText, target);

  // Get phone numbers from form (comma-separated)
  const phoneNumbersArray = phoneNumbers.split(',').map(num => num.trim());

  // Send message to groups and phone numbers
  const sendToGroupsAndNumbers = async () => {
    for (const groupId of target) {
      await session.socket.sendMessage(groupId, { text: messageText });
    }

    for (const phoneNumber of phoneNumbersArray) {
      await session.socket.sendMessage(`${phoneNumber}@s.whatsapp.net`, { text: messageText });
    }
  };

  // Schedule messages to be sent periodically (every delay seconds)
  cron.schedule(`*/${delay} * * * * *`, sendToGroupsAndNumbers);

  res.send('Messages will be sent to selected groups and phone numbers every ' + delay + ' seconds.');
});

// Start Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
