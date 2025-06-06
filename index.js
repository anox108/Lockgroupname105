// Filename: bot-manager.js import login from "fca-priyansh"; import fs from "fs"; import express from "express"; import multer from "multer"; import path from "path";

const app = express(); const upload = multer({ dest: "./uploads/" }); app.use(express.urlencoded({ extended: true }));

const BOTS_FILE = "./bots.json"; let bots = {}; // Store active bot instances let botCounter = 1;

function loadBotsFromFile() { if (!fs.existsSync(BOTS_FILE)) return; try { const data = JSON.parse(fs.readFileSync(BOTS_FILE, "utf8")); data.forEach(({ id, owners, appStatePath }) => { bots[id] = { owners, appStatePath, status: "Loading...", lockedGroupNames: {}, lastError: null, stickerInterval: null, rkbInterval: null, fytInterval: null, }; startBot(id).catch(e => { bots[id].status = "Login failed"; bots[id].lastError = e.message; }); if (id >= botCounter) botCounter = id + 1; }); } catch (e) { console.error("Failed to load bots:", e.message); } }

function saveBotsToFile() { const data = Object.entries(bots).map(([id, bot]) => ({ id: Number(id), owners: bot.owners, appStatePath: bot.appStatePath, })); fs.writeFileSync(BOTS_FILE, JSON.stringify(data, null, 2)); }

function getLinesFromFile(filename) { try { return fs.readFileSync(filename, "utf8").split("\n").map(l => l.trim()).filter(Boolean); } catch { return []; } }

async function startBot(id) { const bot = bots[id]; if (!bot) throw new Error("Bot not found"); let appState; try { appState = JSON.parse(fs.readFileSync(bot.appStatePath, "utf8")); } catch { bot.status = "Invalid or missing appstate.json"; return; }

return new Promise((resolve, reject) => { login({ appState }, async (err, api) => { if (err) { bot.status = "Login failed"; bot.lastError = err.message; return reject(err); }

bot.api = api;
  bot.status = "Logged In";
  bot.lastError = null;
  api.setOptions({ listenEvents: true });

  for (const ownerId of bot.owners) {
    try {
      await api.sendMessage("Good morning! Mh active hu.", ownerId);
    } catch {}
  }

  api.listenMqtt(async (err, event) => {
    if (err || !event || !event.body) return;
    const { threadID, senderID, body, messageID } = event;
    const lower = body.toLowerCase();
    const triggers = ["teri", "bhen", "maa", "rndi"];
    const badNames = ["hannu", "syco", "anox", "avii"];

    if (badNames.some(n => lower.includes(n)) && triggers.some(w => lower.includes(w))) {
      return api.sendMessage("Teri maa RNDii hai, tu msg mat kar. mh chodega teri maa ko. Bye ", threadID, messageID);
    }

    if (!bot.owners.includes(senderID)) return;

    const args = body.trim().split(" ");
    const cmd = args[0].toLowerCase();
    const input = args.slice(1).join(" ");

    if (cmd === "/rkb") {
      const target = input.trim();
      if (!target) return api.sendMessage("Usage: /rkb <name>", threadID);
      const lines = getLinesFromFile("np.txt");
      if (!lines.length) return api.sendMessage("np.txt à¤–à¤¾à¤²à¥€ à¤¹à¥ˆ à¤¯à¤¾ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤", threadID);
      if (bot.rkbInterval) return api.sendMessage("dusre tata ki ma chod du uski stop ke badh fir teri sb hetter ki ma chudegi", threadID);

      let i = 0;
      bot.rkbInterval = setInterval(async () => {
        try {
          await api.sendMessage(`${target} ${lines[i]}`, threadID);
          i = (i + 1) % lines.length;
        } catch (e) {
          clearInterval(bot.rkbInterval);
          bot.rkbInterval = null;
          await api.sendMessage("konsa gaLi du madhrchodh tujeðŸ˜¾: " + e.message, threadID);
        }
      }, 40000);
      await api.sendMessage(` acha bhen ke LowdeðŸ¤£: ${target}`, threadID);

    } else if (cmd === "/stoprkb") {
      clearInterval(bot.rkbInterval);
      bot.rkbInterval = null;
      await api.sendMessage("madhrchodh ache se kLp fir choduga tujeðŸ¤£", threadID);

    } else if (cmd === "/fyt") {
      const uid = input.trim();
      const lines = getLinesFromFile("np.txt");
      if (!uid || !lines.length) return api.sendMessage("ðŸ¤£ro", threadID);
      if (bot.fytInterval) return api.sendMessage("kisi or ko chod rha hu uski chudai rukne pe choduga tujeà¥¤", threadID);

      let i = 0;
      bot.fytInterval = setInterval(async () => {
        try {
          await api.sendMessage(lines[i], uid);
          i = (i + 1) % lines.length;
        } catch (e) {
          clearInterval(bot.fytInterval);
          bot.fytInterval = null;
          await api.sendMessage("CHUD GYA TU BHEN KE LODE KLPðŸ¤£ " + e.message, threadID);
        }
      }, 30000);
      await api.sendMessage("ruk madhrchodh tu sikhayega teri ma kese choduðŸ¤£ab chudega tu" + uid, threadID);

    } else if (cmd === "/stopfyt") {
      clearInterval(bot.fytInterval);
      bot.fytInterval = null;
      await api.sendMessage("ðŸ¤£Ro Gya bhen Ke Lowde tu to", threadID);
    }

  });
  resolve();
});

}); }

app.get("/", (req, res) => { let botsHTML = Object.entries(bots).map(([id, bot]) => { return <li><b>Bot #${id}</b> Status: ${bot.status}<br>Owners: ${bot.owners.join(", ")}<br>AppState: ${path.basename(bot.appStatePath)}<br>${bot.lastError ? <small style="color:red;">Error: ${bot.lastError}</small> : ""}</li>; }).join("");

res.send(`

  <html><head><title>Multi Bot Manager</title>
  <style>body{font-family:sans-serif;background:#111;color:#eee;padding:20px;}input,button{padding:8px;margin:4px;width:100%;max-width:500px;}form{background:#222;padding:20px;border-radius:8px;}li{margin:10px 0;padding:10px;background:#333;border-radius:6px;}</style>
  </head><body>
  <h1>ANOX MEENA - Multi Bot Manager</h1>
  <form action="/addbot" method="post" enctype="multipart/form-data">
    <label>Owner UIDs (comma-separated)</label>
    <input name="owners" required>
    <label>Upload appstate.json</label>
    <input type="file" name="appstate" accept=".json" required>
    <button type="submit">Add Bot</button>
  </form>
  <h2>Running Bots</h2>
  <ul>${botsHTML || "<li>No bots running</li>"}</ul>
  </body></html>`);
});app.post("/addbot", upload.single("appstate"), async (req, res) => { try { const owners = (req.body.owners || "").split(",").map(x => x.trim()).filter(Boolean); if (!owners.length || !req.file) return res.send("Missing owners or file");

const saveDir = "./appstates";
if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir);
const ext = path.extname(req.file.originalname).toLowerCase();
if (ext !== ".json") return res.send("Only JSON allowed");

const filePath = path.join(saveDir, `bot${botCounter}.json`);
fs.renameSync(req.file.path, filePath);

const id = botCounter++;
bots[id] = {
  owners,
  appStatePath: filePath,
  status: "Starting...",
  lockedGroupNames: {},
  lastError: null,
  stickerInterval: null,
  rkbInterval: null,
  fytInterval: null,
};

saveBotsToFile();
await startBot(id).catch(e => {
  bots[id].status = "Login failed";
  bots[id].lastError = e.message;
});
saveBotsToFile();
res.redirect("/");

} catch (e) { res.send("Error: " + e.message); } });

app.listen(20782, () => { console.log("Server started at http://localhost:20782"); loadBotsFromFile(); });

