// server.js
const express = require("express");
const fs = require("fs");
const login = require("fca-priyansh");
const bodyParser = require("body-parser");
const app = express();
const PORT = 3000;

let api = null;
let spamInterval = null;
let isSpamming = false;

app.use(express.static("public"));
app.use(bodyParser.json());

const APPSTATE = JSON.parse(fs.readFileSync("appstate.json", "utf8"));

login({ appState: APPSTATE }, (err, _api) => {
  if (err) {
    console.error("Login failed:", err);
    return;
  }
  api = _api;
  api.setOptions({ listenEvents: false });
  console.log("✅ Logged in.");
});

app.post("/start", (req, res) => {
  const { uid, message, interval } = req.body;
  if (!api || isSpamming) return res.json({ status: "Already running or not logged in" });

  let i = 0;
  isSpamming = true;
  const messages = message.split("\n").map(m => m.trim()).filter(Boolean);

  spamInterval = setInterval(() => {
    if (!isSpamming || !messages.length) return;
    const msg = messages[i % messages.length];
    api.sendMessage(msg, uid, err => {
      if (err) console.error("Send Error:", err.message);
      else console.log("✅ Sent:", msg);
    });
    i++;
  }, parseInt(interval) || 30000);

  res.json({ status: "Started" });
});

app.post("/stop", (_req, res) => {
  clearInterval(spamInterval);
  isSpamming = false;
  res.json({ status: "Stopped" });
});

app.listen(PORT, () => console.log(`🌐 Running on http://localhost:${PORT}`));
