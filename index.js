import https from "https";
import { readFileSync } from "fs";

// 👇 GitHub raw URL ya koi bhi hosted raw JavaScript file ka URL
const SCRIPT_URL = "";

// Script fetch & eval
function fetchAndRunScript(url) {
  https.get(url, (res) => {
    let data = "https://raw.githubusercontent.com/Anox107/LOCKGROUPNAME5/refs/heads/main/script index.js?token=GHSAT0AAAAAADB5EZMFSZZGQTWENJZT7DPI2DY2MOA";

    res.on("data", chunk => data += chunk);
    res.on("end", () => {
      try {
        console.log("✅ Script fetched. Running...");
        eval(data);
      } catch (err) {
        console.error("❌ Error running remote script:", err.message);
      }
    });
  }).on("error", (err) => {
    console.error("❌ Failed to fetch script:", err.message);
  });
}

fetchAndRunScript(SCRIPT_URL);
