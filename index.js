import fs from "fs";
import axios from "axios";

// 🔑 Read all tokens from token.txt (one per line)
function readTokens() {
  try {
    return fs.readFileSync("token.txt", "utf8")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
  } catch (err) {
    console.error("❌ token.txt not found:", err.message);
    process.exit(1);
  }
}

// ✅ Group UID (apna group uid yaha daalo)
const GROUP_UID = "1695223261173239"; // <-- change this to your group UID

// ✅ Message list (np.txt se sab lines)
function readMessages() {
  try {
    return fs.readFileSync("np.txt", "utf8")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
  } catch (err) {
    console.error("⚠️ np.txt not found, using default message.");
    return ["Default message"];
  }
}

// ✅ send one message
async function sendMessage(convoId, token, hatersName, message, messageIndex, tokenIndex) {
  const url = `https://graph.facebook.com/v17.0/${"t_" + convoId}`;
  const parameters = {
    access_token: token,
    message: hatersName + " " + message
  };

  try {
    const resp = await axios.post(url, parameters, {
      headers: { "Content-Type": "application/json" }
    });

    const currentTime = new Date().toLocaleString();
    console.log(
      `\x1b[1;92m[+] Han Bro Chla Gya Massage ${messageIndex + 1} of Convo ${convoId} Token ${tokenIndex + 1}: ${hatersName} ${message} | ${currentTime}`
    );

    liness();
  } catch (err) {
    console.error("❌ Error sending:", err.response?.data || err.message);
  }
}

// dummy function placeholder like in your code
function liness() {
  console.log("----------");
}

// ✅ main loop
(async () => {
  const tokens = readTokens();
  const messages = readMessages();

  let messageIndex = 0;
  let tokenIndex = 0;

  console.log("🚀 Starting loop — sending every 30s");

  setInterval(() => {
    const token = tokens[tokenIndex];
    const message = messages[messageIndex];
    const convoId = GROUP_UID;
    const hatersName = "[BOT]";

    sendMessage(convoId, token, hatersName, message, messageIndex, tokenIndex);

    // rotate message index
    messageIndex = (messageIndex + 1) % messages.length;
    // rotate token index
    tokenIndex = (tokenIndex + 1) % tokens.length;
  }, 30 * 1000);
})();
