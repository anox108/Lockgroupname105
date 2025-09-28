import login from "fca-priyansh";
import fs from "fs";
import express from "express";

const OWNER_UIDS = ["61561546620336", "61562687054710", "100044272713323", "61554934917304", "100008863725940", "61562687054710", "100005122337500", "100085671340090", "100038509998559", "100085671340090", "100087646701594", "100001479670911", "100007155429650"];
let rkbInterval = null;
let stopRequested = false;
const lockedGroupNames = {};
let mediaLoopInterval = null;
let lastMedia = null;
let targetUID = null;
let stickerInterval = null;
let stickerLoopActive = false;

const friendUIDs = fs.existsSync("Friend.txt")
  ? fs.readFileSync("Friend.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean)
  : [];
const targetUIDs = fs.existsSync("Target.txt")
  ? fs.readFileSync("Target.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean)
  : [];

const messageQueues = {};
const queueRunning = {};

const app = express();
app.get("/", (_, res) => res.send("<h2>Messenger Bot Running</h2>"));
app.listen(20782, () => console.log("🌐 Log server: http://localhost:20782"));

process.on("uncaughtException", (err) => console.error("❗ Uncaught Exception:", err));
process.on("unhandledRejection", (reason) => console.error("❗ Unhandled Rejection:", reason));

login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, (err, api) => {
  if (err) {
    console.error("❌ Login failed:", err);
    return;
  }

  api.setOptions({ listenEvents: true });
  OWNER_UIDS.push(api.getCurrentUserID()); // allow self commands
  console.log("✅ Bot logged in and running...");

  // Wrapper so we always catch errors in sendMessage
  const safeSendMessage = (content, threadID, messageID = null) => {
    api.sendMessage(content, threadID, messageID, (err2) => {
      if (err2) {
        console.error(`❌ Failed to send message to thread ${threadID} (msgID ${messageID}):`, err2.message);
      }
    });
  };

  api.listenMqtt(async (errMqtt, event) => {
    try {
      if (errMqtt || !event) return;
      const { threadID, senderID, body, messageID } = event;

      const enqueueMessage = (uid, threadID, messageID) => {
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
          safeSendMessage(randomLine, msg.threadID, msg.messageID);
          setTimeout(processQueue, 10000);
        };

        processQueue();
      };

      if (fs.existsSync("np.txt") && (targetUIDs.includes(senderID) || senderID === targetUID)) {
        enqueueMessage(senderID, threadID, messageID);
      }

      if (event.type === "event" && event.logMessageType === "log:thread-name") {
        const currentName = event.logMessageData.name;
        const lockedName = lockedGroupNames[threadID];
        if (lockedName && currentName !== lockedName) {
          try {
            await api.setTitle(lockedName, threadID);
            safeSendMessage(`"${lockedName}"`, threadID);
          } catch (e) {
            console.error("❌ Error reverting group name:", e.message);
          }
        }
        return;
      }

      if (!body) return;
      const lowerBody = body.toLowerCase();

      const badNames = ["hannu", "syco", "anox", "avii", "satya", "anox", "avi"];
      const triggers = ["rkb", "bhen", "maa", "rndi", "chut", "randi", "madhrchodh", "mc", "bc", "didi", "tmkc"];

      if (
        badNames.some(n => lowerBody.includes(n)) &&
        triggers.some(w => lowerBody.includes(w)) &&
        !friendUIDs.includes(senderID)
      ) {
        return safeSendMessage(
          "teri ma Rndi hai tu msg mt kr sb chodege teri ma  ko byy🙂 ss Lekr story Lga by",
          threadID,
          messageID
        );
      }

      if (!OWNER_UIDS.includes(senderID)) return;

      const args = body.trim().split(" ");
      const cmd = args[0].toLowerCase();
      const input = args.slice(1).join(" ");

      if (cmd === "/allname") {
        try {
          const info = await api.getThreadInfo(threadID);
          const members = info.participantIDs;
          safeSendMessage(`🛠  ${members.length} ' nicknames...`, threadID);
          for (const uid of members) {
            try {
              await api.changeNickname(input, threadID, uid);
              console.log(`✅ Nickname changed for UID: ${uid}`);
              await new Promise(res => setTimeout(res, 20000));
            } catch (e) {
              console.warn(`⚠️ Failed for ${uid}:`, e.message);
            }
          }
          safeSendMessage("ye gribh ka bcha to Rone Lga bkL", threadID);
        } catch (e) {
          console.error("❌ Error in /allname:", e);
          safeSendMessage("badh me kLpauga", threadID);
        }
      }

      else if (cmd === "/groupname") {
        try {
          await api.setTitle(input, threadID);
          safeSendMessage(`📝 Group name changed to: ${input}`, threadID);
        } catch (e) {
          console.error("❌ /groupname error:", e.message);
          safeSendMessage(" klpoo🤣 rkb", threadID);
        }
      }

      else if (cmd === "/lockgroupname") {
        if (!input) return safeSendMessage("name de 🤣 gc ke Liye", threadID);
        try {
          await api.setTitle(input, threadID);
          lockedGroupNames[threadID] = input;
          safeSendMessage(`🔒 Group name locked as: ${input}`, threadID);
        } catch (e) {
          console.error("❌ /lockgroupname error:", e.message);
          safeSendMessage("❌ Locking failed.", threadID);
        }
      }

      else if (cmd === "/unlockgroupname") {
        delete lockedGroupNames[threadID];
        safeSendMessage("🔓 Group name unlocked.", threadID);
      }

      else if (cmd === "/uid") {
        safeSendMessage(`🆔 Group ID: ${threadID}`, threadID);
      }

      else if (cmd === "/exit") {
        try {
          await api.removeUserFromGroup(api.getCurrentUserID(), threadID);
        } catch (e) {
          console.error("❌ /exit error:", e.message);
          safeSendMessage("❌ Can't leave group.", threadID);
        }
      }

      else if (cmd === "/rkb") {
        if (!fs.existsSync("np.txt")) {
          return safeSendMessage("konsa gaLi du rkb ko", threadID);
        }
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
          safeSendMessage(`${name} ${lines[index]}`, threadID);
          index++;
        }, 40000);

        safeSendMessage(`sex hogya bche 🤣rkb ${name}`, threadID);
      }

      else if (cmd === "/stop") {
        stopRequested = true;
        if (rkbInterval) {
          clearInterval(rkbInterval);
          rkbInterval = null;
          safeSendMessage("chud gaye bche🤣", threadID);
        } else {
          safeSendMessage("konsa gaLi du sale ko🤣 rkb tha", threadID);
        }
      }

      else if (cmd === "/photo") {
        safeSendMessage("📸 Send a photo or video within 1 minute...", threadID);

        const handleMedia = async (mediaEvent) => {
          if (
            mediaEvent.type === "message" &&
            mediaEvent.threadID === threadID &&
            mediaEvent.attachments &&
            mediaEvent.attachments.length > 0
          ) {
            lastMedia = {
              attachments: mediaEvent.attachments,
              threadID: mediaEvent.threadID
            };

            safeSendMessage("✅ Photo/video received. Will resend every 30 seconds.", threadID);

            if (mediaLoopInterval) clearInterval(mediaLoopInterval);
            mediaLoopInterval = setInterval(() => {
              if (lastMedia) {
                api.sendMessage({ attachment: lastMedia.attachments }, lastMedia.threadID, (err3) => {
                  if (err3) {
                    console.error(`❌ Failed to resend media to ${lastMedia.threadID}:`, err3.message);
                  }
                });
              }
            }, 30000);

            api.removeListener("message", handleMedia);
          }
        };

        api.on("message", handleMedia);
      }

      else if (cmd === "/stopphoto") {
        if (mediaLoopInterval) {
          clearInterval(mediaLoopInterval);
          mediaLoopInterval = null;
          lastMedia = null;
          safeSendMessage("chud gaye sb.", threadID);
        } else {
          safeSendMessage("🤣ro sale chnar", threadID);
        }
      }

      else if (cmd === "/forward") {
        try {
          const info = await api.getThreadInfo(threadID);
          const members = info.participantIDs;

          const msgInfo = event.messageReply;
          if (!msgInfo) {
            return safeSendMessage("❌ Kisi message ko reply karo bhai", threadID);
          }

          for (const uid of members) {
            if (uid !== api.getCurrentUserID()) {
              try {
                await api.sendMessage({
                  body: msgInfo.body || "",
                  attachment: msgInfo.attachments || []
                }, uid);
              } catch (e) {
                console.warn(`⚠️ Can't send to ${uid} in /forward:`, e.message);
              }
              await new Promise(res => setTimeout(res, 2000));
            }
          }

          safeSendMessage("📨 Forwarding complete.", threadID);
        } catch (e) {
          console.error("❌ Error in /forward:", e.message);
          safeSendMessage("❌ Error bhai, check logs", threadID);
        }
      }

      else if (cmd === "/target") {
        if (!args[1]) return safeSendMessage("👤 UID de jisko target krna h", threadID);
        targetUID = args[1];
        safeSendMessage(`ye chudega bhen ka Lowda ${targetUID}`, threadID);
      }

      else if (cmd === "/cleartarget") {
        targetUID = null;
        safeSendMessage("ro kr kLp gya bkL🤣", threadID);
      }

      else if (cmd === "/help") {
        const helpText = `
📌 Available Commands:
/allname <name> – Change all nicknames
/groupname <name> – Change group name
/lockgroupname <name> – Lock group name
/unlockgroupname – Unlock group name
/uid – Show group ID
/exit – group se Left Le Luga
/rkb <name> – HETTER NAME DAL
/stop – Stop RKB command
/photo – Send photo/video after this; it will repeat every 30s
/stopphoto – Stop repeating photo/video
/forward – Reply kisi message pe kro, sabko forward ho jaega
/target <uid> – Kisi UID ko target kr, msg pe random gali dega
/cleartarget – Target hata dega
/sticker<seconds> – Sticker.txt se sticker spam (e.g., /sticker20)
/stopsticker – Stop sticker loop
/help – Show this help message🙂😁`;
        safeSendMessage(helpText.trim(), threadID);
      }

      else if (cmd.startsWith("/sticker")) {
        if (!fs.existsSync("Sticker.txt")) {
          return safeSendMessage("❌ Sticker.txt not found", threadID);
        }
        const delay = parseInt(cmd.replace("/sticker", ""));
        if (isNaN(delay) || delay < 5) {
          return safeSendMessage("🕐 Bhai sahi time de (min 5 seconds)", threadID);
        }
        const stickerIDs = fs.readFileSync("Sticker.txt", "utf8")
          .split("\n")
          .map(x => x.trim())
          .filter(Boolean);
        if (!stickerIDs.length) {
          return safeSendMessage("⚠️ Sticker.txt khali hai bhai", threadID);
        }

        if (stickerInterval) clearInterval(stickerInterval);
        let i = 0;
        stickerLoopActive = true;

        safeSendMessage(`📦 Sticker bhejna start: har ${delay} sec`, threadID);

        stickerInterval = setInterval(() => {
          if (!stickerLoopActive || i >= stickerIDs.length) {
            clearInterval(stickerInterval);
            stickerInterval = null;
            stickerLoopActive = false;
            return;
          }
          safeSendMessage({ sticker: stickerIDs[i] }, threadID);
          i++;
        }, delay * 1000);
      }

      else if (cmd === "/stopsticker") {
        if (stickerInterval) {
          clearInterval(stickerInterval);
          stickerInterval = null;
          stickerLoopActive = false;
          safeSendMessage("🛑 Sticker bhejna band", threadID);
        } else {
          safeSendMessage("😒 Bhai kuch bhej bhi rha tha kya?", threadID);
        }
      }

    } catch (e) {
      console.error("⚠️ Error in message handler:", e);
    }
  });

  const startUidTargetLoop = (api) => {
    if (!fs.existsSync("uidtarget.txt")) {
      console.log("❌ uidtarget.txt not found");
      return;
    }

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
        api.sendMessage(randomMsg, uid, (err2) => {
          if (err2) {
            console.error(`❌ Error sending message to ${uid}:`, err2.message);
            return;
          }
          setTimeout(() => {
            const randomSticker = stickers[Math.floor(Math.random() * stickers.length)];
            api.sendMessage({ sticker: randomSticker }, uid, (err3) => {
              if (err3) {
                console.error(`❌ Error sending sticker to ${uid}:`, err3.message);
              }
            });
          }, 2000);
        });
      }, 10000);
    });

    console.log("🚀 UIDTarget loop started.");
  };

  startUidTargetLoop(api);
});
