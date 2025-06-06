// bot.js
import login from "fca-priyansh";
import fs from "fs";
import path from "path";

const targetUID = "100031011381551"; // 🧿 Target UID daal yahan
const delay = 30000; // 🕒 30 seconds

// Helper: Delay function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Load np.txt
function loadMessages() {
  const filePath = path.resolve("np.txt");
  if (!fs.existsSync(filePath)) {
    console.error("❌ np.txt file nahi mila. Bana pehle.");
    process.exit(1);
  }

  const lines = fs.readFileSync(filePath, "utf8")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    console.error("❌ np.txt khaali hai. Kuch to likh bkl 😭");
    process.exit(1);
  }

  return lines;
}

// Main Login + Loop
login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, async (err, api) => {
  if (err) {
    console.error("❌ Login failed:", err);
    return;
  }

  console.log("✅ Bot logged in successfully.");
  const messages = loadMessages();
  let index = 0;

  while (true) {
    const msg = messages[index];
    try {
      await api.sendMessage(msg, targetUID);
      console.log(`📤 Sent to ${targetUID}: "${msg}"`);
    } catch (e) {
      console.error(`❌ Error sending to ${targetUID}: ${e.message || e}`);
    }

    index = (index + 1) % messages.length;
    await sleep(delay);
  }
});
