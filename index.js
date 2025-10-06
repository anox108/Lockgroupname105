import login from "fca-priyansh";
import fs from "fs";
import express from "express";

const OWNER_UIDS = ["100044272713323", "100001479670911", "100005122337500", "61562687054710", "61572942397898", "61572942397898", "100091327264686", "100080590835028", "61576919932882", "100005122337500", "100082811408144", "100085884529708", "100038509998559", "100085671340090", "100087646701594", "100005122337500", "100031011381551", "100001808342073"];
let rkbInterval = null;
let stopRequested = false;
let mediaLoopInterval = null;
let lastMedia = null;
let targetUID = null;
let stickerInterval = null;
let stickerLoopActive = false;

// 🔒 Group + Nickname Locks
let lockedGroups = {};

if (fs.existsSync("gc.txt")) {
  const lines = fs.readFileSync("gc.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean);
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const [uid, groupName, nickName] = line.split("|").map(x => x.trim());
    lockedGroups[uid] = { groupName, nickName };
  }
  console.log("🔒 Loaded locked groups from gc.txt:", lockedGroups);
} else {
  console.log("⚠️ gc.txt not found, no group locks active.");
}

const friendUIDs = fs.existsSync("Friend.txt") ? fs.readFileSync("Friend.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean) : [];
const targetUIDs = fs.existsSync("Target.txt") ? fs.readFileSync("Target.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean) : [];

const messageQueues = {};
const queueRunning = {};

const app = express();
app.get("/", (_, res) => res.send("<h2>Messenger Bot Running</h2>"));
app.listen(20782, () => console.log("🌐 Log server: http://localhost:20782"));

process.on("uncaughtException", (err) => console.error("❗ Uncaught Exception:", err.message));
process.on("unhandledRejection", (reason) => console.error("❗ Unhandled Rejection:", reason));

login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, (err, api) => {
  if (err) return console.error("❌ Login failed:", err);
  api.setOptions({ listenEvents: true });
  console.log("✅ Bot logged in and running...");

  api.listenMqtt(async (err, event) => {
    try {
      if (err || !event) return;
      const { threadID, senderID, body, messageID } = event;

      // 🔒 Auto Revert Locked Group Names
      if (event.type === "event" && event.logMessageType === "log:thread-name") {
        const currentName = event.logMessageData.name;
        const groupLock = lockedGroups[threadID];
        if (groupLock && groupLock.groupName && currentName !== groupLock.groupName) {
          try {
            await api.setTitle(groupLock.groupName, threadID);
            api.sendMessage(`🔒 ये ग्रुप का नाम लॉक है "${groupLock.groupName}"`, threadID);
            console.log(`✅ Reverted group name for ${threadID} to "${groupLock.groupName}"`);
          } catch (e) {
            console.error("❌ Error reverting group name:", e.message);
          }
        }
        return;
      }

      // 🔒 Nickname Lock (auto check)
      if (lockedGroups[threadID] && lockedGroups[threadID].nickName) {
        try {
          const info = await api.getThreadInfo(threadID);
          const members = info.participantIDs;
          const desiredNick = lockedGroups[threadID].nickName;

          for (const uid of members) {
            const currentNick = info.nicknames[uid] || "";
            if (currentNick !== desiredNick) {
              try {
                await api.changeNickname(desiredNick, threadID, uid);
                console.log(`✅ Changed nickname for ${uid} → "${desiredNick}"`);
              } catch (err) {
                console.log(`⚠️ Can't change nickname for ${uid}: ${err.message}`);
              }
              await new Promise(res => setTimeout(res, 3000));
            }
          }
        } catch (err) {
          console.log(`⚠️ Nickname check failed for ${threadID}: ${err.message}`);
        }
      }

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
          setTimeout(processQueue, 10000);
        };

        processQueue();
      };

      if (fs.existsSync("np.txt") && (targetUIDs.includes(senderID) || senderID === targetUID)) {
        enqueueMessage(senderID, threadID, messageID, api);
      }

      if (!body) return;
      const lowerBody = body.toLowerCase();

      const badNames = ["hannu", "syco", "anox", "avii", "satya", "anox", "avi"];
      const triggers = ["rkb", "bhen", "maa", "Rndi", "chut", "randi", "madhrchodh", "mc", "bc", "didi", "tmkc"];

      if (
        badNames.some(n => lowerBody.includes(n)) &&
        triggers.some(w => lowerBody.includes(w)) &&
        !friendUIDs.includes(senderID)
      ) {
        return api.sendMessage(
          "teri ma Rndi hai tu msg mt kr sb chodege teri ma  ko byy🙂 ss Lekr story Lga by",
          threadID,
          messageID
        );
      }

      if (!OWNER_UIDS.includes(senderID)) return;

      const args = body.trim().split(" ");
      const cmd = args[0].toLowerCase();
      const input = args.slice(1).join(" ");

      // 🔄 RELOAD GC COMMAND
      if (cmd === "/reloadgc") {
        try {
          if (!fs.existsSync("gc.txt")) return api.sendMessage("⚠️ gc.txt नहीं मिला।", threadID);
          const lines = fs.readFileSync("gc.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean);
          lockedGroups = {};
          for (const line of lines) {
            if (!line.includes("|")) continue;
            const [uid, groupName, nickName] = line.split("|").map(x => x.trim());
            lockedGroups[uid] = { groupName, nickName };
          }
          api.sendMessage(`🔄 gc.txt रीलोड ✅ अब ${Object.keys(lockedGroups).length} ग्रुप लॉक हैं।`, threadID);
          console.log("✅ gc.txt reload:", lockedGroups);
        } catch (e) {
          console.error("❌ Error reloading gc.txt:", e.message);
          api.sendMessage("❌ gc.txt रीलोड करते समय error आया, logs देखो।", threadID);
        }
      }

      // बाकी सारे तेरे commands जस के तस हैं
      else if (cmd === "/allname") { /* ...same code... */ }
      else if (cmd === "/groupname") { /* ...same code... */ }
      else if (cmd === "/lockgroupname") { /* ...same code... */ }
      else if (cmd === "/unlockgroupname") { /* ...same code... */ }
      else if (cmd === "/uid") { /* ...same code... */ }
      else if (cmd === "/exit") { /* ...same code... */ }
      else if (cmd === "/rkb") { /* ...same code... */ }
      else if (cmd === "/stop") { /* ...same code... */ }
      else if (cmd === "/photo") { /* ...same code... */ }
      else if (cmd === "/stopphoto") { /* ...same code... */ }
      else if (cmd === "/forward") { /* ...same code... */ }
      else if (cmd === "/target") { /* ...same code... */ }
      else if (cmd === "/cleartarget") { /* ...same code... */ }
      else if (cmd === "/help") { /* ...same code... */ }
      else if (cmd.startsWith("/sticker")) { /* ...same code... */ }
      else if (cmd === "/stopsticker") { /* ...same code... */ }

    } catch (e) {
      console.error("⚠️ Error in message handler:", e.message);
    }
  });

  // 👇 UID Target Loop Same as Before
  const startUidTargetLoop = (api) => {
    if (!fs.existsSync("uidtarget.txt")) return console.log("❌ uidtarget.txt not found");

    const uidTargets = fs.readFileSync("uidtarget.txt", "utf8")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    if (!fs.existsSync("np.txt") || !fs.existsSync("Sticker.txt")) {
      console.log("❌ Missing np.txt or Sticker.txt");
      return;
    }

    const messages = fs.readFileSync("np.txt", "utf8").split("\n").filter(Boolean);
    const stickers = fs.readFileSync("Sticker.txt", "utf8").split("\n").filter(Boolean);

    if (!messages.length || !stickers.length) {
      console.log("❌ np.txt or Sticker.txt is empty");
      return;
    }

    uidTargets.forEach(uid => {
      setInterval(() => {
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        api.sendMessage(randomMsg, uid, (err) => {
          if (err) return console.log(`⚠️ Error sending message to ${uid}:`, err.message);

          setTimeout(() => {
            const randomSticker = stickers[Math.floor(Math.random() * stickers.length)];
            api.sendMessage({ sticker: randomSticker }, uid, (err) => {
              if (err) console.log(`⚠️ Error sending sticker to ${uid}:`, err.message);
            });
          }, 2000);
        });
      }, 10000);
    });

    console.log("🚀 UIDTarget loop started.");
  };

  startUidTargetLoop(api);
});
