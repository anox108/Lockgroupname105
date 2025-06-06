import login from "fca-priyansh";
import fs from "fs";

const targetUID = "100031011381551"; // ⬅️ YAHAN TARGET UID DAAL
const delay = 30000; // 30 seconds

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, async (err, api) => {
  if (err) return console.error("❌ Login failed:", err);

  console.log("✅ Logged in successfully");

  const lines = fs.readFileSync("np.txt", "utf8").split("\n").filter(Boolean);
  if (lines.length === 0) {
    console.error("❌ np.txt khaali hai.");
    return;
  }

  let index = 0;

  while (true) {
    const message = lines[index];
    try {
      await api.sendMessage(message, targetUID);
      console.log(`✅ Sent: ${message}`);
    } catch (e) {
      console.error("❌ Send error:", e.message);
    }

    index = (index + 1) % lines.length; // loop back to start
    await sleep(delay);
  }
});
