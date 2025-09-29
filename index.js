// ==========================
// Messenger Bot Full Script
// ==========================

import login from "fca-priyansh";
import fs from "fs";
import express from "express";

// ==========================
// Config
// ==========================
const OWNER_UIDS = [
  "61561546620336", "61562687054710", "100044272713323",
  "61554934917304", "100008863725940", "100005122337500",
  "100085671340090", "100038509998559", "100087646701594",
  "100001479670911", "100007155429650"
];

let rkbInterval = null;
let stopRequested = false;
let mediaLoopInterval = null;
let lastMedia = null;
let targetUID = null;
let stickerInterval = null;
let stickerLoopActive = false;
const lockedGroupNames = {};
const messageQueues = {};
const queueRunning = {};

const friendUIDs = fs.existsSync("Friend.txt")
  ? fs.readFileSync("Friend.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean)
  : [];

const targetUIDs = fs.existsSync("Target.txt")
  ? fs.readFileSync("Target.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean)
  : [];

// ==========================
// Express Log Server
// ==========================
const app = express();
app.get("/", (_, res) => res.send("<h2>Messenger Bot Running</h2>"));
app.listen(20782, () => console.log("🌐 Log server: http://localhost:20782"));

// ==========================
// Error Handlers
// ==========================
process.on("uncaughtException", (err) => console.error("❗ Uncaught Exception:", err.message));
process.on("unhandledRejection", (reason) => console.error("❗ Unhandled Rejection:", reason));

// ==========================
// Login & Bot Start
// ==========================
login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, (err, api) => {
  if (err) return console.error("❌ Login failed:", err);

  api.setOptions({ listenEvents: true });
  OWNER_UIDS.push(api.getCurrentUserID());
  console.log("✅ Bot logged in and running...");

  // ==========================
  // Event Listener
  // ==========================
  api.listenMqtt(async (err, event) => {
    try {
      if (err || !event) return;
      const { threadID, senderID, body, messageID } = event;

      // 🔹 Auto target message reply
      if (fs.existsSync("np.txt") && (targetUIDs.includes(senderID) || senderID === targetUID)) {
        enqueueMessage(senderID, threadID, messageID, api);
      }

      // 🔹 Group name lock check
      if (event.type === "event" && event.logMessageType === "log:thread-name") {
        const currentName = event.logMessageData.name;
        const lockedName = lockedGroupNames[threadID];
        if (lockedName && currentName !== lockedName) {
          try {
            await api.setTitle(lockedName, threadID);
            api.sendMessage(`🔒 Group name locked to "${lockedName}"`, threadID);
          } catch (e) {
            console.error("❌ Error reverting group name:", e.message);
          }
        }
        return;
      }

      if (!body) return;
      const lowerBody = body.toLowerCase();

      // 🔹 Abuse protection
      const badNames = ["hannu", "syco", "anox", "avii", "satya", "avi"];
      const triggers = ["rkb", "bhen", "maa", "rndi", "chut", "mc", "bc", "tmkc"];

      if (
        badNames.some(n => lowerBody.includes(n)) &&
        triggers.some(w => lowerBody.includes(w)) &&
        !friendUIDs.includes(senderID)
      ) {
        return api.sendMessage(
          "⚠️ Teri maa ka joke bna ke mat aa yaha 🙂",
          threadID,
          messageID
        );
      }

      // 🔹 Owner only commands
      if (!OWNER_UIDS.includes(senderID)) return;
      const args = body.trim().split(" ");
      const cmd = args[0].toLowerCase();
      const input = args.slice(1).join(" ");

      // ==========================
      // Commands
      // ==========================
      switch (cmd) {
        case "/allname": {
          if (!input) return api.sendMessage("❌ Name de bhai", threadID);
          try {
            const info = await api.getThreadInfo(threadID);
            const members = info.participantIDs;
            api.sendMessage(`🛠 Changing ${members.length} nicknames...`, threadID);
            for (const uid of members) {
              try {
                await api.changeNickname(input, threadID, uid);
                await new Promise(res => setTimeout(res, 20000));
              } catch {}
            }
            api.sendMessage("✅ Sabke naam change ho gaye.", threadID);
          } catch {
            api.sendMessage("❌ Error in /allname", threadID);
          }
          break;
        }

        case "/groupname":
          if (!input) return api.sendMessage("❌ Group name de", threadID);
          try {
            await api.setTitle(input, threadID);
            api.sendMessage(`📝 Group name changed to: ${input}`, threadID);
          } catch {
            api.sendMessage("❌ Group name change failed", threadID);
          }
          break;

        case "/lockgroupname":
          if (!input) return api.sendMessage("❌ Name de lock krne ke liye", threadID);
          lockedGroupNames[threadID] = input;
          await api.setTitle(input, threadID);
          api.sendMessage(`🔒 Group name locked to "${input}"`, threadID);
          break;

        case "/unlockgroupname":
          delete lockedGroupNames[threadID];
          api.sendMessage("🔓 Group name unlocked", threadID);
          break;

        case "/uid":
          api.sendMessage(`🆔 Group ID: ${threadID}`, threadID);
          break;

        case "/exit":
          try {
            await api.removeUserFromGroup(api.getCurrentUserID(), threadID);
          } catch {
            api.sendMessage("❌ Can't leave group", threadID);
          }
          break;

        case "/rkb": {
          if (!fs.existsSync("np.txt")) return api.sendMessage("❌ np.txt missing", threadID);
          const name = input || "rkb";
          const lines = fs.readFileSync("np.txt", "utf8").split("\n").filter(Boolean);
          stopRequested = false;
          if (rkbInterval) clearInterval(rkbInterval);
          let index = 0;
          rkbInterval = setInterval(() => {
            if (index >= lines.length || stopRequested) {
              clearInterval(rkbInterval);
              rkbInterval = null;
              return;
            }
            api.sendMessage(`${name} ${lines[index]}`, threadID);
            index++;
          }, 40000);
          api.sendMessage(`▶️ RKB spam started on ${name}`, threadID);
          break;
        }

        case "/stop":
          stopRequested = true;
          if (rkbInterval) {
            clearInterval(rkbInterval);
            rkbInterval = null;
            api.sendMessage("🛑 RKB spam stopped", threadID);
          } else {
            api.sendMessage("❌ Koi RKB spam chal hi nahi raha", threadID);
          }
          break;

        case "/photo":
          api.sendMessage("📸 Send a photo/video within 1 min", threadID);
          const handleMedia = async (mediaEvent) => {
            if (
              mediaEvent.type === "message" &&
              mediaEvent.threadID === threadID &&
              mediaEvent.attachments?.length
            ) {
              lastMedia = { attachments: mediaEvent.attachments, threadID };
              api.sendMessage("✅ Media received, will repeat every 30s", threadID);
              if (mediaLoopInterval) clearInterval(mediaLoopInterval);
              mediaLoopInterval = setInterval(() => {
                if (lastMedia) {
                  api.sendMessage({ attachment: lastMedia.attachments }, lastMedia.threadID);
                }
              }, 30000);
              api.removeListener("message", handleMedia);
            }
          };
          api.on("message", handleMedia);
          break;

        case "/stopphoto":
          if (mediaLoopInterval) {
            clearInterval(mediaLoopInterval);
            mediaLoopInterval = null;
            lastMedia = null;
            api.sendMessage("🛑 Media loop stopped", threadID);
          }
          break;

        case "/forward": {
          const info = await api.getThreadInfo(threadID);
          const members = info.participantIDs;
          const msgInfo = event.messageReply;
          if (!msgInfo) return api.sendMessage("❌ Kisi msg pe reply kar", threadID);
          for (const uid of members) {
            if (uid !== api.getCurrentUserID()) {
              await api.sendMessage({
                body: msgInfo.body || "",
                attachment: msgInfo.attachments || []
              }, uid);
              await new Promise(res => setTimeout(res, 2000));
            }
          }
          api.sendMessage("📨 Forwarding complete", threadID);
          break;
        }

        case "/target":
          if (!args[1]) return api.sendMessage("❌ UID de target ke liye", threadID);
          targetUID = args[1];
          api.sendMessage(`🎯 Target set: ${targetUID}`, threadID);
          break;

        case "/cleartarget":
          targetUID = null;
          api.sendMessage("🧹 Target cleared", threadID);
          break;

        case "/help":
          api.sendMessage(`
📌 Commands:
/allname <name>
/groupname <name>
/lockgroupname <name>
/unlockgroupname
/uid
/exit
/rkb <name>
/stop
/photo
/stopphoto
/forward (reply msg pe)
/target <uid>
/cleartarget
/sticker<sec>
/stopsticker
/help
          `.trim(), threadID);
          break;

        default:
          if (cmd.startsWith("/sticker")) {
            if (!fs.existsSync("Sticker.txt")) return api.sendMessage("❌ Sticker.txt missing", threadID);
            const delay = parseInt(cmd.replace("/sticker", ""));
            if (isNaN(delay) || delay < 5) return api.sendMessage("❌ Time sahi de (min 5s)", threadID);
            const stickers = fs.readFileSync("Sticker.txt", "utf8").split("\n").filter(Boolean);
            if (!stickers.length) return api.sendMessage("❌ Sticker.txt empty", threadID);
            if (stickerInterval) clearInterval(stickerInterval);
            let i = 0;
            stickerLoopActive = true;
            stickerInterval = setInterval(() => {
              if (!stickerLoopActive || i >= stickers.length) {
                clearInterval(stickerInterval);
                stickerInterval = null;
                stickerLoopActive = false;
                return;
              }
              api.sendMessage({ sticker: stickers[i] }, threadID);
              i++;
            }, delay * 1000);
            api.sendMessage(`▶️ Sticker spam every ${delay}s`, threadID);
          } else if (cmd === "/stopsticker") {
            if (stickerInterval) {
              clearInterval(stickerInterval);
              stickerInterval = null;
              stickerLoopActive = false;
              api.sendMessage("🛑 Sticker spam stopped", threadID);
            }
          }
      }
    } catch (e) {
      console.error("⚠️ Error:", e.message);
    }
  });

  // ==========================
  // Auto UID Target Loop
  // ==========================
  const startUidTargetLoop = () => {
    if (!fs.existsSync("uidtarget.txt")) return;
    const uidTargets = fs.readFileSync("uidtarget.txt", "utf8").split("\n").filter(Boolean);
    if (!fs.existsSync("np.txt") || !fs.existsSync("Sticker.txt")) return;
    const messages = fs.readFileSync("np.txt", "utf8").split("\n").filter(Boolean);
    const stickers = fs.readFileSync("Sticker.txt", "utf8").split("\n").filter(Boolean);

    uidTargets.forEach(uid => {
      setInterval(() => {
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        api.sendMessage(randomMsg, uid);
        setTimeout(() => {
          const randomSticker = stickers[Math.floor(Math.random() * stickers.length)];
          api.sendMessage({ sticker: randomSticker }, uid);
        }, 2000);
      }, 10000);
    });

    console.log("🚀 UIDTarget loop started");
  };

  startUidTargetLoop();
});

// ==========================
// Queue Function
// ==========================
function enqueueMessage(uid, threadID, messageID, api) {
  if (!messageQueues[uid]) messageQueues[uid] = [];
  messageQueues[uid].push({ threadID, messageID });
  if (queueRunning[uid]) return;
  queueRunning[uid] = true;
  const lines = fs.readFileSync("np.txt", "utf8").split("\n").filter(Boolean);
  const processQueue = () => {
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
                                             }
