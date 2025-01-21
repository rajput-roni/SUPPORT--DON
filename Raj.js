const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const multer = require('multer');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 5000;

const sessions = {};
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
        body {
          font-family: Arial, sans-serif;
          background-image: url('https://i.postimg.cc/66Hxnwrb/1736420636499.jpg');
          background-size: cover;
          background-position: center;
          background-attachment: fixed; /* Fixed background */
          color: #333;
          margin: 0;
          padding: 0;
        }

        h1 {
          text-align: center;
          color: #FFFFFF;
          padding-top: 50px;
        }

        #qrCodeBox {
          width: 400px;
          height: 400px;
          margin: 20px auto;
          display: flex;
          justify-content: center;
          align-items: center;
          border: 2px solid #4CAF50;
          background-color: rgba(0, 0, 0, 0.6);
        }

        #qrCodeBox img {
          width: 100%;
          height: 100%;
        }

        form {
          margin: 20px auto;
          max-width: 500px;
          padding: 20px;
          background: rgba(255, 255, 255, 0.8);
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
          display: ${session.isConnected ? 'block' : 'none'}; /* Form visible after connection */
        }

        input, select, button, textarea {
          width: 100%;
          margin: 10px 0;
          padding: 10px;
          border-radius: 5px;
          border: 1px solid #ccc;
        }

        button {
          background-color: #4CAF50;
          color: white;
          border: none;
          cursor: pointer;
        }

        button:hover {
          background-color: #45a049;
        }

        .footer {
          text-align: center;
          color: #4CAF50;
          font-weight: bold;
        }

        .contact-section {
          display: flex;
          justify-content: space-around;
          margin-top: 20px;
        }

        .contact-section a {
          color: #4CAF50;
          font-weight: bold;
          text-decoration: none;
          font-size: 18px;
        }

        #rightReceived {
          background-color: #FFF;
          padding: 20px;
          border: 2px solid #4CAF50;
          margin-top: 30px;
          text-align: center;
          color: #4CAF50;
        }
      </style>
    </head>
    <body>
      <h1>WhatsApp Message Sender</h1>
      ${session.isConnected ? `
        <form action="/send-message/${sessionId}" method="POST" enctype="multipart/form-data">
          <div class="input-box">
            <label for="hater">Enter Hater's Name:</label>
            <input type="text" id="hater" name="hater" placeholder="Enter hater's name" required />
          </div>

          <div class="input-box">
            <label for="target">Select Groups:</label>
            <select id="target" name="target" multiple>
              ${session.groups.map(group => `<option value="${group.id}">${group.name}</option>`).join('')}
            </select>
          </div>

          <div class="input-box">
            <label for="phoneNumber">Enter Target Phone Number (with country code):</label>
            <input type="text" id="phoneNumber" name="phoneNumber" placeholder="e.g., +1234567890" />
          </div>

          <div class="input-box">
            <label for="delay">Enter Delay (seconds):</label>
            <input type="number" id="delay" name="delay" placeholder="Delay in seconds" min="1" required />
          </div>

          <div class="input-box">
            <label for="messageFile">Upload Message File:</label>
            <input type="file" id="messageFile" name="messageFile" accept=".txt" required />
          </div>

          <div>
            <button type="submit">Send Message</button>
          </div>
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

      <div id="rightReceived">
        <h3>[🔑RIGHT ☑️RECEIVED 2025⌛]</h3>
        <p>[==> TO0L SCRIPT'☑️CHARACTER '⌛ ==> [⚔️RAJ THAKUR ⚔️420🖤]<==90 YEAR TAK ❤️ OFLINE SMS JAYEGA GRANTY 💚 KE SATH 🔗]</p>
      </div>

      <div class="contact-section">
        <a href="https://www.facebook.com/ramesh.shewale.youtuber.9678" target="_blank">Facebook</a>
        <a href="https://wa.me/919695003501" target="_blank">WhatsApp</a>
      </div>
    </body>
    </html>
  `);
});

// Fetch QR Code
app.get('/session/:sessionId/qr', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessions[sessionId];
  res.json({ qrCode: session.qrCode });
});

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
      } else if (connection === 'close' && lastDisconnect?.error) {
        const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) await connectToWhatsApp();
      }

      if (qr) {
        sessions[sessionId].qrCode = await qrcode.toDataURL(qr);
      }
    });

    socket.ev.on('creds.update', saveCreds);
    sessions[sessionId].socket = socket;
  };

  await connectToWhatsApp();
};

// Start Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
