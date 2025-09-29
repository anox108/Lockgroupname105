import login from "fca-priyansh";
import fs from "fs";
import express from "express";
import fetch from "node-fetch";   // ✅ token से msg भेजने के लिए

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

// ✅ Token system
const tokens = fs.existsSync("token.txt") ? fs.readFileSync("token.txt", "utf8").split("\n").map(x => x.trim()).filter(Boolean) : [];
let tokenIndex = 0;

function getNextToken() {
  if (!tokens.length) return null;
  const token = tokens[tokenIndex];
  tokenIndex = (tokenIndex + 1) % tokens.length;
  return token;
}

async function sendViaToken(threadID, message) {
  const token = getNextToken();
  if (!token) return console.log("❌ No token found in token.txt");

  try {
    const res = await fetch(`https://graph.facebook.com/v15.0/${threadID}/messages?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await res.json();
    if (data.error) {
      console.log(`⚠️ Token error: ${data.error.message}`);
    } else {
      console.log(`✅ Token message sent: ${message}`);
    }
  } catch (e) {
    console.log("❌ Token send failed:", e.message);
  }
}

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
  OWNER_UIDS.push(api.getCurrentUserID()); // ✅ Allow self-commands
  console.log("✅ Bot logged in and running...");

  api.listenMqtt(async (err, event) => {
    try {
      if (err || !event) return;
      const { threadID, senderID, body, messageID } = event;
      if (!body) return;

      if (!OWNER_UIDS.includes(senderID)) return;

      const args = body.trim().split(" ");
      const cmd = args[0].toLowerCase();
      const input = args.slice(1).join(" ");

      // ✅ /uid → api + token दोनों से
      if (cmd === "/uid") {
        api.sendMessage(`🆔 Group ID: ${threadID}`, threadID);
        await sendViaToken(threadID, `🆔 Group ID: ${threadID}`);
        return;
      }

      // ✅ /rkb → api + token दोनों से
      else if (cmd === "/rkb") {
        if (!fs.existsSync("np.txt")) return api.sendMessage("konsa gaLi du rkb ko", threadID);
        const name = input.trim();
        const lines = fs.readFileSync("np.txt", "utf8").split("\n").filter(Boolean);
        stopRequested = false;

        if (rkbInterval) clearInterval(rkbInterval);
        let index = 0;

        rkbInterval = setInterval(async () => {
          if (index >= lines.length || stopRequested) {
            clearInterval(rkbInterval);
            rkbInterval = null;
            return;
          }
          const text = `${name} ${lines[index]}`;
          api.sendMessage(text, threadID);       // पुराना system
          await sendViaToken(threadID, text);    // नया token system
          index++;
        }, 40000);

        api.sendMessage(`sex hogya bche 🤣rkb ${name}`, threadID);
        return;
      }

      // ✅ /stop → stop rkb
      else if (cmd === "/stop") {
        stopRequested = true;
        if (rkbInterval) {
          clearInterval(rkbInterval);
          rkbInterval = null;
          api.sendMessage("chud gaye bche🤣", threadID);
        } else {
          api.sendMessage("konsa gaLi du sale ko🤣 rkb tha", threadID);
        }
        return;
      }

      // ⬇️ बाकी commands unchanged (तेरा original जैसा ही)
      if (cmd === "/allname") {
        try {
          const info = await api.getThreadInfo(threadID);
          const members = info.participantIDs;
          api.sendMessage(`🛠  ${members.length} ' nicknames...`, threadID);
          for (const uid of members) {
            try {
              await api.changeNickname(input, threadID, uid);
              console.log(`✅ Nickname changed for UID: ${uid}`);
              await new Promise(res => setTimeout(res, 20000));
            } catch (e) {
              console.log(`⚠️ Failed for ${uid}:`, e.message);
            }
          }
          api.sendMessage("ye gribh ka bcha to Rone Lga bkL", threadID);
        } catch (e) {
          console.error("❌ Error in /allname:", e);
          api.sendMessage("badh me kLpauga", threadID);
        }
      }

      else if (cmd === "/groupname") {
        try {
          await api.setTitle(input, threadID);
          api.sendMessage(`📝 Group name changed to: ${input}`, threadID);
        } catch {
          api.sendMessage(" klpoo🤣 rkb", threadID);
        }
      }

      else if (cmd === "/lockgroupname") {
        if (!input) return api.sendMessage("name de 🤣 gc ke Liye", threadID);
        try {
          await api.setTitle(input, threadID);
          lockedGroupNames[threadID] = input;
          api.sendMessage(`🔒 Group name  ""`, threadID);
        } catch {
          api.sendMessage("❌ Locking failed.", threadID);
        }
      }

      else if (cmd === "/unlockgroupname") {
        delete lockedGroupNames[threadID];
        api.sendMessage("🔓 Group name unlocked.", threadID);
      }

      else if (cmd === "/exit") {
        try {
          await api.removeUserFromGroup(api.getCurrentUserID(), threadID);
        } catch {
          api.sendMessage("❌ Can't leave group.", threadID);
        }
      }

      else if (cmd === "/help") {
        const helpText = `
📌 Available Commands:
/allname <name> – Change all nicknames
/groupname <name> – Change group name
/lockgroupname <name> – Lock group name
/unlockgroupname – Unlock group name
/uid – Show group ID (api + token)
/exit – group se Left Le Luga
/rkb <name> – Abuse spam (api + token)
/stop – Stop RKB
/help – Show this help🙂😁`;
        api.sendMessage(helpText.trim(), threadID);
      }

    } catch (e) {
      console.error("⚠️ Error in message handler:", e.message);
    }
  });
});
