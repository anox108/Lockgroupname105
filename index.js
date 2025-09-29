import login from "fca-priyansh";
import fs from "fs";
import express from "express";
import fetch from "node-fetch";

const app = express();
app.get("/", (_, res) => res.send("<h2>Messenger Bot Running</h2>"));
app.listen(3000, () => console.log("🌐 Status: http://localhost:3000"));

// 🔑 token.txt se PAGE TOKEN read karna
if (!fs.existsSync("token.txt")) {
  console.error("❌ token.txt not found! File banake usme PAGE ACCESS TOKEN daalo.");
  process.exit(1);
}
const PAGE_ACCESS_TOKEN = fs.readFileSync("token.txt", "utf8").trim();

// ✅ Function: token se group me msg bhejna
async function sendToGroupToken(threadID, message) {
  const url = `https://graph.facebook.com/v17.0/t_${threadID}/messages?access_token=${PAGE_ACCESS_TOKEN}`;
  const payload = { message };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, (err, api) => {
  if (err) return console.error("❌ Login failed:", err);

  api.setOptions({ listenEvents: true });
  console.log("✅ Bot logged in and listening...");

  api.listenMqtt(async (err, event) => {
    try {
      if (err || !event) return;
      if (event.type !== "message" || !event.body) return;

      const { threadID, body, messageID } = event;
      const args = body.trim().split(" ");
      const cmd = args[0].toLowerCase();

      // ✅ Command: /uid → token se group UID + group name bhejna
      if (cmd === "/uid") {
        try {
          const info = await api.getThreadInfo(threadID);
          const groupName = info.threadName || "Unnamed Group";
          const groupUID = `t_${threadID}`;

          const msg = `🆔 Group UID: ${groupUID}\n📝 Group Name: ${groupName}`;
          await sendToGroupToken(threadID, msg);
        } catch (e) {
          api.sendMessage(`❌ Token error: ${e.message}`, threadID, messageID);
        }
      }

      // ✅ /help command
      else if (cmd === "/help") {
        const helpText = `
📌 Commands:
/uid – Is group ka UID + group name token se bhejega
/help – Show this help
`;
        api.sendMessage(helpText.trim(), threadID, messageID);
      }

    } catch (e) {
      console.error("⚠️ Error in handler:", e.message);
    }
  });
});
