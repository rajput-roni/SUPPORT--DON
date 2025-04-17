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
        <html>
        <head>
            <title>WhatsApp Auto Sender</title>
            <style>
                body {
                    background-image: url('https://i.postimg.cc/vB9RYNYd/1c03e985a3c70572a37c32719b356ccb.jpg');
                    background-size: cover;
                    color: white;
                    font-family: Arial, sans-serif;
                    text-align: center;
                    padding-top: 50px;
                }
                .sms-box {
                    margin-top: 50px;
                    background: rgba(0, 0, 0, 0.6);
                    padding: 20px;
                    border-radius: 10px;
                    width: 40%;
                    margin: auto;
                }
                input, select, button {
                    width: 100%;
                    padding: 10px;
                    margin: 10px 0;
                    border-radius: 5px;
                    border: none;
                }
                button {
                    background-color: #4CAF50;
                    color: white;
                    font-size: 16px;
                }
            </style>
        </head>
        <body>
            <h1>WhatsApp Auto Sender</h1>
            <div class="sms-box">
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
                auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })) },
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
                    <h2>Pairing Code</h2>
                    <p>Pairing Code: ${code}</p>
                    <a href="/">Go Back</a>
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
                <h2>Error</h2>
                <p>Error: Service Unavailable</p>
                <a href="/">Go Back</a>
            `);
        }
    }
    return await GIFTED_MD_PAIR_CODE();
});

app.post("/send-message", upload.single("messageFile"), async (req, res) => {
    if (!waClient) {
        return res.send(`
            <html>
            <head><title>Error</title></head>
            <body><h2>Error: WhatsApp not connected</h2><br><a href="/">Go Back</a></body>
            </html>
        `);
    }

    const { target, targetType, delaySec } = req.body;
    const filePath = req.file ? req.file.path : null;

    if (!target || !filePath || !targetType) {
        return res.send(`
            <html>
            <head><title>Error</title></head>
            <body><h2>Error: Missing required fields</h2><br><a href="/">Go Back</a></body>
            </html>
        `);
    }

    try {
        const messages = fs.readFileSync(filePath, "utf-8")
            .split("\n")
            .filter((msg) => msg.trim() !== "");

        let index = 0;
        while (true) {
            const msg = messages[index];
            const recipient =
                targetType === "group" ? target + "@g.us" : target + "@s.whatsapp.net";
            await waClient.sendMessage(recipient, { text: msg });
            console.log("Sent: " + msg + " to " + target);
            index = (index + 1) % messages.length;
            await delay(delaySec * 1000);
        }
    } catch (error) {
        console.error("Error while sending messages:", error);
        res.send(`
            <html>
            <head><title>Error</title></head>
            <body><h2>Error: Failed to send messages</h2><br><a href="/">Go Back</a></body>
            </html>
        `);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
