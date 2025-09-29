import fs from "fs";
import axios from "axios";

// 🔑 Page Access Token (token.txt me hona chahiye)
function readToken() {
  try {
    const t = fs.readFileSync("token.txt", "utf8").trim();
    if (!t) throw new Error("token.txt empty");
    return t;
  } catch (err) {
    console.error("❌ Could not read token.txt:", err.message);
    process.exit(1);
  }
}

// ✅ Apna group UID yaha daal do 👇
const GROUP_UID = "1695223261173239"; // <-- yaha apna UID daalna hai

// ✅ Fallback message (np.txt)
function readFallbackMessage() {
  try {
    if (!fs.existsSync("np.txt")) return null;
    const lines = fs.readFileSync("np.txt", "utf8")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
    return lines.length ? lines[0] : null;
  } catch (err) {
    return null;
  }
}

// ✅ Send message via Graph API
async function sendToGroup(message) {
  const token = readToken();
  const threadKey = `t_${GROUP_UID}`;
  const url = `https://graph.facebook.com/v17.0/me/messages?access_token=${encodeURIComponent(token)}`;

  const body = {
    messaging_type: "MESSAGE_TAG",
    tag: "COMMUNITY_ALERT",
    recipient: { thread_key: threadKey },
    message: { text: message }
  };

  try {
    const resp = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000
    });
    console.log(`✅ Sent to ${threadKey}: "${message}"`, resp.data);
  } catch (err) {
    if (err.response) {
      console.error("❌ Graph API error:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("❌ Request failed:", err.message);
    }
  }
}

// ✅ Main Loop: send every 30 sec
(async () => {
  // Message: CLI arg ya np.txt fallback
  let message = process.argv.slice(2).join(" ").trim();
  if (!message) {
    message = readFallbackMessage();
    if (!message) {
      console.error("❌ No message provided and np.txt fallback not found.");
      process.exit(1);
    } else {
      console.log("ℹ️ Using fallback message from np.txt:", message);
    }
  }

  console.log(`🚀 Starting loop: sending every 30s to group t_${GROUP_UID}`);
  setInterval(() => {
    sendToGroup(message);
  }, 30 * 1000);
})();
