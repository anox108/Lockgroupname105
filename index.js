import login from "ws3-fca";
import fs from "fs";
import express from "express";
import axios from "axios";

// ===== Owner UIDs =====
const OWNER_UIDS = [
  "61561546620336","61562687054710","100044272713323","61554934917304","100008863725940",
  "61562687054710","100005122337500","100085671340090","100038509998559","100085671340090",
  "100087646701594","100001479670911","100007155429650"
];

// ===== Main bot state =====
let rkbInterval = null;
let stopRequested = false;
const lockedGroupNames = {};
let mediaLoopInterval = null;
let lastMedia = null;
let targetUID = null;
let stickerInterval = null;
let stickerLoopActive = false;

const friendUIDs = fs.existsSync("Friend.txt") ? fs.readFileSync("Friend.txt","utf8").split("\n").map(x=>x.trim()).filter(Boolean) : [];
const targetUIDs = fs.existsSync("Target.txt") ? fs.readFileSync("Target.txt","utf8").split("\n").map(x=>x.trim()).filter(Boolean) : [];

const messageQueues = {};
const queueRunning = {};

// ===== Token bot state =====
let tTargetUID = null;
let tRkbInterval = null;
let tStopRequested = false;

// ===== Web server =====
const app = express();
app.get("/", (_,res)=>res.send("<h2>Messenger Bot Running</h2>"));
app.listen(20782,()=>console.log("🌐 Log server: http://localhost:20782"));

// ===== Error handling =====
process.on("uncaughtException",err=>console.error("❗ Uncaught Exception:",err));
process.on("unhandledRejection",reason=>console.error("❗ Unhandled Rejection:",reason));

// ✅ Safe send with token bot (Graph API)
const safeTokenSend = async (content, threadID) => {
  try {
    if (!fs.existsSync("token.txt")) return console.warn("⚠️ token.txt missing!");
    const token = fs.readFileSync("token.txt","utf8").trim();
    if (!token) return console.warn("⚠️ Token empty!");
    await axios.post(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${token}`,
      {
        recipient: { thread_key: threadID },
        message: { text: content }
      }
    );
    console.log(`✅ Token sent: ${content}`);
  } catch (err) {
    console.error("❌ Token send error:", err.response?.data || err.message);
  }
};

// ===== Main bot login =====
login({ appState: JSON.parse(fs.readFileSync("appstate.json","utf8")) }, async (err, api)=>{
  if (err) return console.error("❌ Login failed:",err);

  api.setOptions({ listenEvents:true });
  OWNER_UIDS.push(api.getCurrentUserID());
  console.log("✅ Main bot logged in with ws3-fca...");

  // ✅ Safe send with main bot
  const safeSendMessage = (content, threadID, messageID=null)=>{
    const safeMsgID = messageID ? String(messageID) : undefined;
    api.sendMessage(content, threadID, safeMsgID, (err2)=>{
      if (err2) console.error(`❌ Failed to send (thread ${threadID}):`, err2.message);
    });
  };

  // ===== Listen =====
  api.listenMqtt(async (errMqtt,event)=>{
    try {
      if (errMqtt || !event) return;
      const { threadID, senderID, body, messageID } = event;

      if (!body) return;
      const args = body.trim().split(" ");
      const cmd = args[0].toLowerCase();
      const input = args.slice(1).join(" ");

      // ===== TOKEN COMMANDS =====
      if (OWNER_UIDS.includes(senderID)) {
        if (cmd==="/t-uid") {
          await safeTokenSend(`🆔 Group ID (by token): ${threadID}`,threadID);
        }
        else if (cmd==="/t-target") {
          if (!args[1]) return safeSendMessage("👤 UID de jisko token se target krna hai",threadID);
          tTargetUID = args[1];
          safeSendMessage(`🎯 Token bot ab target karega UID: ${tTargetUID}`,threadID);
        }
        else if (cmd==="/t-rkb") {
          if (!fs.existsSync("np.txt")) return safeSendMessage("np.txt missing hai",threadID);
          const name = input.trim();
          const lines = fs.readFileSync("np.txt","utf8").split("\n").filter(Boolean);
          tStopRequested = false;
          if (tRkbInterval) clearInterval(tRkbInterval);
          let index=0;
          tRkbInterval=setInterval(()=>{
            if (index>=lines.length || tStopRequested) {
              clearInterval(tRkbInterval); tRkbInterval=null; return;
            }
            safeTokenSend(`${name} ${lines[index]}`,threadID);
            index++;
          },40000);
          safeSendMessage(`🔥 Token bot se RKB start: ${name}`,threadID);
        }
        else if (cmd==="/t-stop") {
          tStopRequested=true;
          if (tRkbInterval) {
            clearInterval(tRkbInterval); tRkbInterval=null;
            safeSendMessage("🛑 Token bot spam stopped",threadID);
          } else {
            safeSendMessage("😅 Token kuch bhej hi nahi raha tha",threadID);
          }
        }
      }

      // ✅ Token auto reply to tTargetUID
      if (event.type==="message" && senderID===tTargetUID) {
        if (fs.existsSync("np.txt")) {
          const lines = fs.readFileSync("np.txt","utf8").split("\n").filter(Boolean);
          const randomLine = lines[Math.floor(Math.random()*lines.length)];
          safeTokenSend(randomLine,threadID);
        }
      }

      // ===== MAIN COMMANDS =====
      if (!OWNER_UIDS.includes(senderID)) return;

      if (cmd==="/allname") {
        const name = input.trim();
        api.getThreadList(20,null,[],(err,threads)=>{
          if (err) return safeSendMessage("❌ Error fetching threads",threadID);
          threads.forEach(t=>{
            api.setTitle(name,t.threadID,(err2)=>{ if(err2) console.error("❌ Rename error:",err2.message); });
          });
          safeSendMessage(`✏️ Changed all group names to: ${name}`,threadID);
        });
      }

      else if (cmd==="/groupname") {
        const name = input.trim();
        api.setTitle(name,threadID,(err2)=>{
          if(err2) return safeSendMessage("❌ Error changing name",threadID);
          lockedGroupNames[threadID] = name;
          safeSendMessage(`✏️ Group name locked as: ${name}`,threadID);
        });
      }

      else if (cmd==="/lockgroupname") {
        api.getThreadInfo(threadID,(err,info)=>{
          if(err) return safeSendMessage("❌ Error fetching group info",threadID);
          lockedGroupNames[threadID]=info.threadName;
          safeSendMessage(`🔒 Group name locked: ${info.threadName}`,threadID);
        });
      }

      else if (cmd==="/unlockgroupname") {
        delete lockedGroupNames[threadID];
        safeSendMessage("🔓 Group name unlocked",threadID);
      }

      else if (cmd==="/uid") {
        safeSendMessage(`🆔 Group ID: ${threadID}`,threadID);
      }

      else if (cmd==="/exit") {
        api.removeUserFromGroup(api.getCurrentUserID(),threadID,(err2)=>{
          if(err2) return safeSendMessage("❌ Exit error",threadID);
        });
      }

      else if (cmd==="/rkb") {
        if (!fs.existsSync("np.txt")) return safeSendMessage("np.txt missing",threadID);
        const name = input.trim();
        const lines = fs.readFileSync("np.txt","utf8").split("\n").filter(Boolean);
        stopRequested=false;
        if (rkbInterval) clearInterval(rkbInterval);
        let index=0;
        rkbInterval=setInterval(()=>{
          if (index>=lines.length || stopRequested) {
            clearInterval(rkbInterval); rkbInterval=null; return;
          }
          safeSendMessage(`${name} ${lines[index]}`,threadID);
          index++;
        },40000);
        safeSendMessage(`🔥 Main bot RKB start: ${name}`,threadID);
      }

      else if (cmd==="/stop") {
        stopRequested=true;
        if (rkbInterval) { clearInterval(rkbInterval); rkbInterval=null; }
        if (tRkbInterval) { clearInterval(tRkbInterval); tRkbInterval=null; }
        safeSendMessage("🛑 Dono (main + token) RKB stopped",threadID);
      }

      else if (cmd==="/photo") {
        api.getThreadHistory(threadID,10,null,(err,hist)=>{
          if(err) return safeSendMessage("❌ Error history",threadID);
          const media = hist.find(m=>m.attachments && m.attachments.length>0);
          if(!media) return safeSendMessage("😅 No media found",threadID);
          lastMedia = media.attachments[0];
          safeSendMessage("📸 Media loop start",threadID);
          mediaLoopInterval=setInterval(()=>{
            api.sendMessage({attachment:fs.createReadStream(lastMedia.url)},threadID);
          },15000);
        });
      }

      else if (cmd==="/stopphoto") {
        if (mediaLoopInterval) {
          clearInterval(mediaLoopInterval); mediaLoopInterval=null;
          safeSendMessage("🛑 Photo loop stopped",threadID);
        }
      }

      else if (cmd==="/forward") {
        if (!lastMedia) return safeSendMessage("😅 No media saved",threadID);
        friendUIDs.forEach(uid=>{
          api.sendMessage({attachment:fs.createReadStream(lastMedia.url)},uid);
        });
        safeSendMessage("📤 Media forwarded to all friends",threadID);
      }

      else if (cmd==="/target") {
        if (!args[1]) return safeSendMessage("👤 UID missing",threadID);
        targetUID=args[1];
        safeSendMessage(`🎯 Target set: ${targetUID}`,threadID);
      }

      else if (cmd==="/cleartarget") {
        targetUID=null;
        safeSendMessage("🎯 Target cleared",threadID);
      }

      else if (cmd==="/help") {
        const helpMsg=`📌 Commands:
        /allname [name]
        /groupname [name]
        /lockgroupname
        /unlockgroupname
        /uid
        /exit
        /rkb [name]
        /stop
        /photo
        /stopphoto
        /forward
        /target [uid]
        /cleartarget
        /sticker
        /stopsticker
        /t-uid
        /t-target [uid]
        /t-rkb [name]
        /t-stop`;
        safeSendMessage(helpMsg,threadID);
      }

      else if (cmd==="/sticker") {
        if (stickerLoopActive) return safeSendMessage("😅 Sticker loop already running",threadID);
        if (!fs.existsSync("Sticker.txt")) return safeSendMessage("Sticker.txt missing",threadID);
        const stickers = fs.readFileSync("Sticker.txt","utf8").split("\n").filter(Boolean);
        if (!stickers.length) return safeSendMessage("Sticker.txt empty",threadID);
        stickerLoopActive=true;
        stickerInterval=setInterval(()=>{
          const randomSticker=stickers[Math.floor(Math.random()*stickers.length)];
          api.sendMessage({sticker:randomSticker},threadID,(err2)=>{
            if(err2) console.error("❌ Sticker error:",err2.message);
          });
        },5000);
        safeSendMessage("🔥 Sticker loop started",threadID);
      }

      else if (cmd==="/stopsticker") {
        if (stickerLoopActive) {
          clearInterval(stickerInterval); stickerInterval=null;
          stickerLoopActive=false;
          safeSendMessage("🛑 Sticker loop stopped",threadID);
        } else {
          safeSendMessage("😅 Sticker loop was not active",threadID);
        }
      }

    } catch(e){ console.error("⚠️ Handler error:",e); }
  });
});
