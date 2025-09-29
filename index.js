import login from "fca-priyansh";
import fs from "fs";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Bot is Running..."));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ================== CONFIG ==================
const OWNER_UIDS = [
  "61561546620336",
  "61562687054710",
  "100044272713323",
  "61554934917304",
  "100008863725940",
  "100005122337500",
  "100085671340090",
  "100038509998559"
];

// ================== UTILS ==================
function safeSend(api, msg, threadID, delay = 2000) {
  if (!threadID.toString().startsWith("t_")) {
    threadID = "t_" + threadID;
  }
  setTimeout(() => {
    api.sendMessage(msg, threadID, (err) => {
      if (err) {
        console.log(
          `⚠️ Send Error [${threadID}]:`,
          err.errorSummary || err.error || "unknown",
          err.errorDescription || ""
        );
      }
    });
  }, delay);
}

// ================== LOGIN ==================
login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, (err, api) => {
  if (err) return console.error("Login error:", err);

  api.setOptions({ listenEvents: true, selfListen: true });
  console.log("✅ Bot started successfully!");

  let lockedGroupName = null;
  let rkbInterval = null;
  let targetUID = null;
  let photoLoop = false;
  let stickerLoop = false;

  api.listenMqtt(async (err, event) => {
    if (err) return console.error("Listen error:", err);

    try {
      // =========== MESSAGE EVENT ===========
      if (event.type === "message" && event.body) {
        const sender = event.senderID;
        const threadID = event.threadID;
        const message = event.body.trim();

        // Only OWNER allowed
        if (!OWNER_UIDS.includes(sender)) return;

        // ======= Commands =======

        if (message.startsWith("/allname ")) {
          const name = message.replace("/allname ", "");
          api.getThreadInfo(threadID, (err, info) => {
            if (err) return;
            info.participantIDs.forEach((uid, i) => {
              setTimeout(() => {
                api.changeNickname(name, threadID, uid, (e) => {
                  if (e) console.log("Nickname error:", e.errorSummary);
                });
              }, i * 2000);
            });
          });
        }

        if (message.startsWith("/groupname ")) {
          const gname = message.replace("/groupname ", "");
          api.setTitle(gname, threadID, (err) => {
            if (err) console.log("Groupname error:", err.errorSummary);
          });
        }

        if (message.startsWith("/lockgroupname ")) {
          lockedGroupName = message.replace("/lockgroupname ", "");
          safeSend(api, "🔒 Group name locked to: " + lockedGroupName, threadID);
        }

        if (message === "/unlockgroupname") {
          lockedGroupName = null;
          safeSend(api, "✅ Group name unlocked", threadID);
        }

        if (message === "/uid") {
          safeSend(api, "Group UID: " + threadID, threadID);
        }

        if (message === "/exit") {
          safeSend(api, "👋 Leaving group...", threadID);
          api.removeUserFromGroup(api.getCurrentUserID(), threadID);
        }

        if (message.startsWith("/rkb ")) {
          const name = message.replace("/rkb ", "");
          if (rkbInterval) clearInterval(rkbInterval);
          rkbInterval = setInterval(() => {
            let gaali = fs.readFileSync("np.txt", "utf8").split("\n");
            let msg = gaali[Math.floor(Math.random() * gaali.length)];
            safeSend(api, `${name} ${msg}`, threadID);
          }, 40000);
          safeSend(api, "🔥 RKB started on " + name, threadID);
        }

        if (message === "/stop") {
          clearInterval(rkbInterval);
          rkbInterval = null;
          safeSend(api, "⛔ RKB stopped", threadID);
        }

        if (message.startsWith("/target ")) {
          targetUID = message.replace("/target ", "");
          safeSend(api, "🎯 Target set: " + targetUID, threadID);
        }

        if (message === "/cleartarget") {
          targetUID = null;
          safeSend(api, "✅ Target cleared", threadID);
        }

        if (message === "/photo") {
          photoLoop = true;
          safeSend(api, "📸 Photo repeat enabled", threadID);
        }

        if (message === "/stopphoto") {
          photoLoop = false;
          safeSend(api, "⛔ Photo repeat stopped", threadID);
        }

        if (message.startsWith("/sticker")) {
          const sec = parseInt(message.replace("/sticker", "")) || 10;
          stickerLoop = setInterval(() => {
            let stickers = fs.readFileSync("Sticker.txt", "utf8").split("\n");
            let stk = stickers[Math.floor(Math.random() * stickers.length)];
            safeSend(api, { sticker: stk }, threadID);
          }, sec * 1000);
          safeSend(api, "🔥 Sticker spam started", threadID);
        }

        if (message === "/stopsticker") {
          clearInterval(stickerLoop);
          stickerLoop = null;
          safeSend(api, "⛔ Sticker spam stopped", threadID);
        }

        if (message === "/help") {
          let helpText = `
📌 COMMAND LIST:
👥 Group
  /allname <name>
  /groupname <name>
  /lockgroupname <name>
  /unlockgroupname
  /uid
  /exit

🎯 Target / RKB
  /rkb <name>
  /stop
  /target <uid>
  /cleartarget

🖼 Media
  /photo
  /stopphoto

😜 Sticker
  /sticker<sec>
  /stopsticker

🆘 /help
          `;
          safeSend(api, helpText, threadID);
        }
      }

      // =========== PHOTO REPEAT ===========
      if (event.type === "message" && event.attachments.length > 0 && photoLoop) {
        let att = event.attachments[0];
        setInterval(() => {
          api.sendMessage({ attachment: api.getStreamFromURL(att.url) }, event.threadID, (err) => {
            if (err) console.log("Photo loop error:", err.errorSummary);
          });
        }, 30000);
      }

      // =========== GROUP NAME LOCK ===========
      if (event.type === "event" && lockedGroupName && event.logMessageType === "log:thread-name") {
        api.setTitle(lockedGroupName, event.threadID, (err) => {
          if (err) console.log("Lock rename error:", err.errorSummary);
        });
      }
    } catch (e) {
      console.log("⚠️ Handler Error:", e.message);
    }
  });
});
