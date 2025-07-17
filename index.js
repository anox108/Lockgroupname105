import https from "https";

// 🔗 Yahan apni main bot script ka RAW URL daalein (GitHub ya koi aur host se)
const SCRIPT_URL = "https://raw.githubusercontent.com/Anox107/LOCKGROUPNAME5/refs/heads/main/script index.js";

// ✅ Remote script fetch & execute
function fetchAndRunScript(url) {
  https.get(url, (res) => {
    let data = "";

    res.on("data", chunk => data += chunk);
    res.on("end", () => {
      try {
        console.log("✅ Script fetched from URL. Executing...");
        eval(data); // 🚨 Make sure URL is trusted!
      } catch (err) {
        console.error("❌ Error running script:", err.message);
      }
    });
  }).on("error", (err) => {
    console.error("❌ Failed to fetch script:", err.message);
  });
}

fetchAndRunScript(SCRIPT_URL);
