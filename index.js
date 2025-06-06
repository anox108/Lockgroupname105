import login from "fca-priyansh";
import fs from "fs";

const TARGET_UID = "100031011381551";  // Yahan apna target UID daalein
const APPSTATE_PATH = "./appstate.json"; // Aapka appstate file ka path

async function start() {
  let appState;
  try {
    appState = JSON.parse(fs.readFileSync(APPSTATE_PATH, "utf8"));
  } catch (e) {
    console.error("Appstate file load nahi hui:", e.message);
    return;
  }

  login({ appState }, async (err, api) => {
    if (err) {
      console.error("Login failed:", err.message);
      return;
    }

    console.log("Logged in successfully!");

    const messages = [
      "Hello!",
      "This is a nonstop message.",
      "Sending messages nonstop.",
      "Hope you like this spam!",
    ]; // Aap apne messages yahan change kar sakte hain

    let i = 0;

    setInterval(async () => {
      try {
        await api.sendMessage(messages[i], TARGET_UID);
        console.log(`Message sent to ${TARGET_UID}: ${messages[i]}`);
        i = (i + 1) % messages.length;
      } catch (e) {
        console.error("Message send error:", e.message);
      }
    }, 30000); // Har 30 second me message bheje
  });
}

start();
