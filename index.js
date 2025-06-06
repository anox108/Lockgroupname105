import login from "fca-priyansh";
import fs from "fs";

const targetUID = "100031011381551"; // ✅ Yahan UID daal
const delay = 30000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getMessages() {
  if (!fs.existsSync("np.txt")) {
    console.error("❌ np.txt file not found.");
    process.exit(1);
  }
  const lines = fs.readFileSync("np.txt", "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    console.error("❌ np.txt is empty.");
    process.exit(1);
  }
  return lines;
}

login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, async (err, api) => {
  if (err) return console.error("❌ Login failed:", err);

  console.log("✅ Logged in.");

  const messages = getMessages();
  let index = 0;

  while (true) {
    const msg = messages[index];

    try {
      await api.sendMessage(msg, targetUID);
      console.log(`✅ Sent: "${msg}"`);
    } catch (error) {
      console.error(`❌ Error sending to UID ${targetUID}:`, error?.message || error);
    }

    index = (index + 1) % messages.length;
    await sleep(delay);
  }
});
