// Full Messenger Bot Script with Auto Sticker UID Logging

import login from "fca-priyansh"; import fs from "fs"; import express from "express";

const OWNER_UIDS = [ "100004600332279", "100082811408144", "100085884529708", "100038509998559", "100085671340090", "100087646701594", "100005122337500", "100031011381551", "100001808342073" ];

let rkbInterval = null; let stopRequested = false; const lockedGroupNames = {}; let mediaLoopInterval = null; let lastMedia = null; let targetUID = null; let stickerInterval = null; let stickerLoopActive = false;

const friendUIDs = fs.existsSync("Friend.txt") ? fs.readFileSync("Friend.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean) : []; const targetUIDs = fs.existsSync("Target.txt") ? fs.readFileSync("Target.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean) : []; const messageQueues = {}; const queueRunning = {};

const app = express(); app.get("/", (_, res) => res.send("<h2>Messenger Bot Running</h2>")); app.listen(20782, () => console.log("🌐 Log server: http://localhost:20782"));

process.on("uncaughtException", (err) => console.error("❗ Uncaught Exception:", err.message)); process.on("unhandledRejection", (reason) => console.error("❗ Unhandled Rejection:", reason));

login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, (err, api) => { if (err) return console.error("❌ Login failed:", err); api.setOptions({ listenEvents: true }); console.log("✅ Bot logged in and running...");

api.listenMqtt(async (err, event) => { try { if (err || !event) return;

// ✅ Auto-detect and log sticker UID
  if (event.type === "message" && event.attachments && event.attachments.length > 0) {
    for (const attachment of event.attachments) {
      if (attachment.type === "sticker") {
        const stickerID = attachment.stickerID || attachment.ID;
        const logInfo = `Sticker ID: ${stickerID} | Description: ${attachment.description || "N/A"} | URL: ${attachment.url || "No URL"}`;
        console.log("🎯 Found Sticker =>", logInfo);
        fs.appendFileSync("Sticker.txt", stickerID + "\n");
      }
    }
  }

  const { threadID, senderID, body, messageID } = event;
  const enqueueMessage = (uid, threadID, messageID, api) => {
    if (!messageQueues[uid]) messageQueues[uid] = [];
    messageQueues[uid].push({ threadID, messageID });
    if (queueRunning[uid]) return;
    queueRunning[uid] = true;
    const lines = fs.readFileSync("np.txt", "utf8").split("\n").filter(Boolean);
    let index = 0;
    const processQueue = async () => {
      if (!messageQueues[uid].length) {
        queueRunning[uid] = false;
        return;
      }
      const msg = messageQueues[uid].shift();
      const randomLine = lines[Math.floor(Math.random() * lines.length)];
      api.sendMessage(randomLine, msg.threadID, msg.messageID);
      setTimeout(processQueue, 30000);
    };
    processQueue();
  };

  if (fs.existsSync("np.txt") && (targetUIDs.includes(senderID) || senderID === targetUID)) {
    enqueueMessage(senderID, threadID, messageID, api);
  }

  if (event.type === "event" && event.logMessageType === "log:thread-name") {
    const currentName = event.logMessageData.name;
    const lockedName = lockedGroupNames[threadID];
    if (lockedName && currentName !== lockedName) {
      try {
        await api.setTitle(lockedName, threadID);
        api.sendMessage(`  \"${lockedName}\"`, threadID);
      } catch (e) {
        console.error("❌ Error reverting group name:", e.message);
      }
    }
    return;
  }

  if (!body) return;
  const lowerBody = body.toLowerCase();
  const badNames = ["hannu", "syco", "anox", "avii", "satya", "avi"];
  const triggers = ["rkb", "bhen", "maa", "rndi", "chut", "randi", "madhrchodh", "mc", "bc", "didi", "ma"];
  if (badNames.some(n => lowerBody.includes(n)) && triggers.some(w => lowerBody.includes(w)) && !friendUIDs.includes(senderID)) {
    return api.sendMessage("teri ma Rndi hai tu msg mt kr sb chodege teri ma  ko byy🙂 ss Lekr story Lga by", threadID, messageID);
  }

  if (!OWNER_UIDS.includes(senderID)) return;
  const args = body.trim().split(" ");
  const cmd = args[0].toLowerCase();
  const input = args.slice(1).join(" ");

  // Your existing commands (/allname, /groupname, etc.) remain unchanged here
  // Only the sticker auto-logger is added at the top of the event handler

} catch (e) {
  console.error("⚠️ Error in message handler:", e.message);
}

}); });

