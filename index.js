import https from "https";
import vm from "vm";
import fs from "fs";

// 👇 Replace with your actual raw GitHub script URL
const SCRIPT_URL = "https://raw.githubusercontent.com/Anox107/LOCKGROUPNAME5/refs/heads/main/script index.js";

https.get(SCRIPT_URL, (res) => {
  let code = "https://raw.githubusercontent.com/Anox107/LOCKGROUPNAME5/refs/heads/main/script index.js";

  res.on("data", (chunk) => {
    code += chunk;
  });

  res.on("end", () => {
    try {
      const context = {
        require,
        console,
        fs,
        process,
        setTimeout,
        setInterval,
        clearInterval,
        Buffer,
        // Add anything else needed by your remote script
      };

      vm.createContext(context);
      vm.runInContext(code, context);

      console.log("✅ Remote script executed.");
    } catch (err) {
      console.error("❌ Error executing remote script:", err.message);
    }
  });
}).on("error", (err) => {
  console.error("❌ Error fetching remote script:", err.message);
});
