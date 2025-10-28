// server.js — Multi-Bot Manager Dashboard
const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const { fork } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

const botsDir = path.join(__dirname, "bots");
fs.ensureDirSync(botsDir);
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer setup for appstate upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, botsDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-appstate.json")
});
const upload = multer({ storage });

// Serve dashboard
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

// Run bot from uploaded appstate
app.post("/runbot", upload.single("appstate"), async (req, res) => {
  try {
    const appstatePath = req.file.path;
    const ownerUIDs = (req.body.owners || "").split(",").map(x => x.trim()).filter(Boolean);

    const botId = Date.now().toString();
    const botFolder = path.join(botsDir, botId);
    fs.ensureDirSync(botFolder);

    // Copy main bot code into this bot folder
    const botIndex = path.join(botFolder, "index.js");
    fs.copyFileSync(path.join(__dirname, "index.js"), botIndex);
    fs.copyFileSync(appstatePath, path.join(botFolder, "appstate.json"));

    // Write owners.json for that bot
    fs.writeFileSync(path.join(botFolder, "owners.json"), JSON.stringify(ownerUIDs, null, 2));

    // Run child process
    const child = fork(botIndex, [], { cwd: botFolder });
    child.on("exit", (code) => {
      console.log(`[Bot ${botId}] exited with code ${code}`);
    });

    res.send(`<h3>✅ Bot started successfully!</h3><p>ID: ${botId}</p>`);
  } catch (err) {
    console.error(err);
    res.status(500).send(`<h3>❌ Error: ${err.message}</h3>`);
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Multi-Bot Dashboard running at http://localhost:${PORT}`)
);
