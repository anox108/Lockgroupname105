import login from "fca-priyansh";
import fs from "fs";

const TARGET_UID = "YAHAN_APKA_TARGET_UID_DALEIN"; // Jis UID par msg bhejna hai
const APPSTATE_PATH = "./appstate.json"; // Aapki appstate file ka path

async function start() {
  let appState;
  try {
    appState = JSON.parse(fs.readFileSync(APPSTATE_PATH, "utf8"));
  } catch (e) {
    console.error("Appstate file load nahi ho paya:", e.message);
    return;
  }

  login({ appState }, async (err, api) => {
    if (err) {
      console.error("Login failed:", err.message || err);
      return;
    }
    console.log("Login successful!");

    const messages = [
      "Hello!",
      "Yeh message bot se aa raha hai.",
      "Nonstop messages chal rahe hain.",
    ];

    let i = 0;

    setInterval(async () => {
      try {
        await api.sendMessage(messages[i], TARGET_UID);
        console.log(`Message sent to ${TARGET_UID}: ${messages[i]}`);
        i = (i + 1) % messages.length;
      } catch (sendErr) {
        console.error("Message send karte waqt error:", sendErr.message || sendErr);
      }
    }, 30000); // Har 30 second me message bheje
  });
}

start();
