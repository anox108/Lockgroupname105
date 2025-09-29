import login from "fca-priyansh";
import fs from "fs";
import express from "express";
const fetch = (await import("node-fetch")).default;

// ✅ Token load
const TOKENS = fs.existsSync("token.txt")
  ? fs.readFileSync("token.txt", "utf8").split("\n").map(t => t.trim()).filter(Boolean)
  : [];
let tokenIndex = 0;
function getNextToken() {
  if (!TOKENS.length) return null;
  const t = TOKENS[tokenIndex];
  tokenIndex = (tokenIndex + 1) % TOKENS.length;
  return t;
}

const OWNER_UIDS = ["61561546620336", "61562687054710", "100044272713323", "61554934917304", "100008863725940", "61562687054710", "100005122337500", "100085671340090", "100038509998559", "100085671340090", "100087646701594", "100001479670911", "100007155429650"];
let rkbInterval = null;
let stopRequested = false;
const lockedGroupNames = {};
let mediaLoopInterval = null;
let lastMedia = null;
let targetUID = null;
let stickerInterval = null;
let stickerLoopActive = false;

const friendUIDs = fs.existsSync("Friend.txt") ? fs.readFileSync("Friend.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean) : [];
const targetUIDs = fs.existsSync("Target.txt") ? fs.readFileSync("Target.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean) : [];

const messageQueues = {};
const queueRunning = {};

const app = express();
app.get("/", (_, res) => res.send("<h2>Messenger Bot Running</h2>"));
app.listen(20782, () => console.log("🌐 Log server: http://localhost:20782"));

// ✅ Helper: Send message with token
async function sendWithToken(threadID, text) {
  const token = getNextToken();
  if (!token) return console.error("❌ No tokens in token.txt");
  try {
    const url = `https://graph.facebook.com/v17.0/t_${threadID}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: { text } })
    });
    const data = await res.json();
    if (data.error) {
      console.error("❌ Token send error:", data.error.message);
    } else {
      console.log("✅ Token msg sent:", text);
    }
  } catch (e) {
    console.error("⚠️ Token send exception:", e.message);
  }
}

process.on("uncaughtException", async (err) => {
  console.error("❗ Uncaught Exception:", err.message);
  const match = err.message.match(/conversation (\d+)/);
  if (match) {
    const convoId = match[1];
    await sendWithToken(convoId, `🆔 UID: ${convoId}`);
  }
});

process.on("unhandledRejection", async (reason) => {
  console.error("❗ Unhandled Rejection:", reason);
  const msg = reason && reason.message ? reason.message : String(reason);
  const match = msg.match(/conversation (\d+)/);
  if (match) {
    const convoId = match[1];
    await sendWithToken(convoId, `🆔 UID: ${convoId}`);
  }
});

login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, (err, api) => {
  if (err) return console.error("❌ Login failed:", err);

  api.setOptions({ listenEvents: true });
  OWNER_UIDS.push(api.getCurrentUserID()); // ✅ Allow self-commands
  console.log("✅ Bot logged in and running...");

  api.listenMqtt(async (err, event) => {
    try {
      if (err || !event) return;
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
          setTimeout(processQueue, 10000);
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
            api.sendMessage(`  "${lockedName}"`, threadID);
          } catch (e) {
            console.error("❌ Error reverting group name:", e.message);
          }
        }
        return;
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

      // ✅ /uid ab token API se
      if (cmd === "/uid") {
        await sendWithToken(threadID, `🆔 Group ID: ${threadID}`);
      }

      // ✅ /rkb ab token API se
      else if (cmd === "/rkb") {
        if (!fs.existsSync("np.txt")) return api.sendMessage("konsa gaLi du rkb ko", threadID);
        const name = input.trim();
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
          sendWithToken(threadID, `${name} ${lines[index]}`);
          index++;
        }, 40000);

        await sendWithToken(threadID, `sex hogya bche 🤣rkb ${name}`);
      }

      else if (cmd === "/stop") {
        stopRequested = true;
        if (rkbInterval) {
          clearInterval(rkbInterval);
          rkbInterval = null;
          api.sendMessage("chud gaye bche🤣", threadID);
        } else {
          api.sendMessage("konsa gaLi du sale ko🤣 rkb tha", threadID);
        }
      }

      // 🔻🔻 बाकी commands unchanged 🔻🔻
      else if (cmd === "/allname") { /* ... same as tera code ... */ }
      else if (cmd === "/groupname") { /* ... */ }
      else if (cmd === "/lockgroupname") { /* ... */ }
      else if (cmd === "/unlockgroupname") { /* ... */ }
      else if (cmd === "/exit") { /* ... */ }
      else if (cmd === "/photo") { /* ... */ }
      else if (cmd === "/stopphoto") { /* ... */ }
      else if (cmd === "/forward") { /* ... */ }
      else if (cmd === "/target") { /* ... */ }
      else if (cmd === "/cleartarget") { /* ... */ }
      else if (cmd === "/help") { /* ... */ }
      else if (cmd.startsWith("/sticker")) { /* ... */ }
      else if (cmd === "/stopsticker") { /* ... */ }

    } catch (e) {
      console.error("⚠️ Error in message handler:", e.message);
    }
  });

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
