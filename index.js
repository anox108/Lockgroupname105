  /**
 * index.js — Single-file Facebook Messenger bot
 * सभी commands इस में हैं (Hindi comments)
 *
 * Requirements:
 *  - npm i fca-smart-shankar axios express fs-extra moment-timezone
 *  - Files in same folder: appstate.json, np.txt, Target.txt, uidtarget.txt, Sticker.txt (optional), Friend.txt (optional), index.html (optional)
 */

const fs = require('fs-extra');
const path = require('path');
const express = require('express');
const moment = require('moment-timezone');
const axios = require('axios');
const login = require('fca-smart-shankar'); // make sure installed
const logger = require('./utils/log') || console.log; // अगर custom logger नहीं है तो console.log use होगा

// ---------------- Config & Globals ----------------
const PORT = process.env.PORT || 8080;
const APPSTATE_PATH = path.join(process.cwd(), 'appstate.json');

// Owners / admin UIDs — आप अपनी list यहाँ रखें
const OWNER_UIDS = [
  /* example UIDs -- बदलें अपनी IDs से */
  "100067335306511",
  "100001479670911"
];

// फ़ाइल-रिलेटेड lists
const NP_FILE = path.join(process.cwd(), 'np.txt');          // random messages
const TARGET_FILE = path.join(process.cwd(), 'Target.txt'); // single-line targets (legacy)
const UID_TARGET_FILE = path.join(process.cwd(), 'uidtarget.txt'); // uid loops
const STICKER_FILE = path.join(process.cwd(), 'Sticker.txt');
const FRIEND_FILE = path.join(process.cwd(), 'Friend.txt');

// Runtime state
let lockedGroupNames = {}; // { threadID: lockedName }
let rkbInterval = null;
let rkbStop = false;
let mediaLoopInterval = null;
let lastMedia = null;
let stickerInterval = null;
let stickerLoopActive = false;
let currentTarget = null; // /target set via command

// message queue for auto-reply to targets (to avoid smash)
const messageQueues = {}; // { uid: [{threadID, messageID}, ...] }
const queueRunning = {};  // { uid: boolean }

// ---------------- Express uptime server ----------------
const app = express();
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'), err => {
    if (err) res.send('<h2>Bot running</h2>');
  });
});
app.listen(PORT, () => logger.loader ? logger.loader(`Server running on port ${PORT}`, 'load') : console.log(`Server running on ${PORT}`));

// ---------------- Helpers ----------------
function readList(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  } catch (e) { return []; }
}

function randFrom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function enqueueMessage(uid, threadID, messageID, api) {
  if (!messageQueues[uid]) messageQueues[uid] = [];
  messageQueues[uid].push({ threadID, messageID });

  if (queueRunning[uid]) return;
  queueRunning[uid] = true;

  const lines = readList(NP_FILE);
  if (!lines.length) {
    queueRunning[uid] = false;
    return;
  }

  const processQueue = async () => {
    if (!messageQueues[uid] || !messageQueues[uid].length) {
      queueRunning[uid] = false;
      return;
    }
    const msg = messageQueues[uid].shift();
    const randomLine = randFrom(lines) || "hello";
    try {
      await api.sendMessage(randomLine, msg.threadID, msg.messageID);
    } catch (e) {
      logger(`Auto-reply failed: ${e && e.message ? e.message : e}`, 'warn');
    }
    setTimeout(processQueue, 8000); // 8s gap between replies
  };

  processQueue();
}

// ---------------- Login using appstate ----------------
if (!fs.existsSync(APPSTATE_PATH)) {
  logger.loader ? logger.loader('appstate.json not found! Place appstate.json in project root.', 'error') : console.error('appstate.json not found!');
  process.exit(1);
}

let appState;
try {
  appState = JSON.parse(fs.readFileSync(APPSTATE_PATH, 'utf8'));
} catch (err) {
  logger(`Failed to parse appstate.json: ${err}`, 'error');
  process.exit(1);
}

logger.loader ? logger.loader('Logging in using appstate...', 'load') : console.log('Logging in...');

// LOGIN
login({ appState }, (loginError, api) => {
  if (loginError) {
    logger(`Login error: ${JSON.stringify(loginError)}`, 'error');
    process.exit(1);
  }

  api.setOptions({ listenEvents: true });
  logger.loader ? logger.loader('Bot logged in successfully', 'success') : console.log('Bot logged in');

  // save updated appstate periodically (and once now)
  try {
    fs.writeFileSync(APPSTATE_PATH, JSON.stringify(api.getAppState(), null, 2), 'utf8');
    logger('Saved appstate.json after login', 'info');
  } catch (e) {
    logger(`Failed to save appstate: ${e}`, 'warn');
  }

  // Start listening events
  api.listenMqtt(async (err, event) => {
    try {
      if (err || !event) {
        if (err) logger(`listenMqtt error: ${err}`, 'error');
        return;
      }

      // ignore some event types
      if (['presence','typ','read_receipt'].includes(event.type)) return;

      // THREAD / MESSAGE data
      const threadID = event.threadID;
      const senderID = event.senderID;
      const messageID = event.messageID;
      const body = event.body || '';
      const lower = body.toLowerCase();

      // ---- handle thread-name change events (lock group name) ----
      if (event.type === 'event' && event.logMessageType === 'log:thread-name') {
        const currentName = event.logMessageData && event.logMessageData.name;
        const locked = lockedGroupNames[threadID];
        if (locked && currentName !== locked) {
          try {
            await api.setTitle(locked, threadID);
            await api.sendMessage(`🔒 Group name reverted to: "${locked}"`, threadID);
          } catch (e) {
            logger(`Failed revert group title: ${e}`, 'warn');
          }
        }
        return;
      }

      // ---- auto-reply for target(s) ----
      const targetList = readList(TARGET_FILE);
      if ((targetList.includes(senderID) || senderID === currentTarget) && fs.existsSync(NP_FILE)) {
        enqueueMessage(senderID, threadID, messageID, api);
      }

      // ---- basic bad-word filter (example) ----
      const friendList = readList(FRIEND_FILE);
      const badNames = ['hannu','syco','anox','avii','satya','avi'];
      const triggers = ['rkb','bhen','maa','rndi','chut','randi','madhrchodh','mc','bc','didi','tmkc'];
      if (badNames.some(n => lower.includes(n)) && triggers.some(t => lower.includes(t)) && !friendList.includes(senderID)) {
        try {
          await api.sendMessage('⚠️ Message blocked by filter.', threadID, messageID);
        } catch (e) {}
        return;
      }

      // ---- ignore non-text messages for commands (but still handle attachments for /photo flow) ----
      if (!body && !(event.attachments && event.attachments.length)) return;

      // ---- only owners can use commands ----
      const args = body.trim().split(/\s+/);
      const cmd = (args[0] || '').toLowerCase();
      const input = args.slice(1).join(' ');

      // If sender is not owner and message starts with '/' then ignore (owner-only)
      const isOwner = OWNER_UIDS.includes(senderID);
      if (!isOwner && cmd.startsWith('/')) return;

      // ---------- COMMANDS ----------
      // /help
      if (cmd === '/help') {
        const helpText = `
📌 Commands:
/allname <name> - Change nicknames for all members (slow)
/groupname <name> - Change group title
/lockgroupname <name> - Lock group name (revert on change)
/unlockgroupname - Unlock group name
/uid - Show group ID
/exit - Remove bot from group
/rkb <name> - Send lines from np.txt repeatedly prefixed with <name>
/stop - Stop rkb
/photo - Next photo/video you send will be repeated every 30s
/stopphoto - Stop repeating media
/sticker<seconds> - Start sticker spam from Sticker.txt every <seconds>
/stopsticker - Stop sticker spam
/target <uid> - Set a single target uid for auto-reply
/cleartarget - Clear current /target
/forward - Reply to a message with /forward to forward that reply to all members
/help - Show this help
        `;
        return api.sendMessage(helpText.trim(), threadID, messageID);
      }

      // /uid
      if (cmd === '/uid') {
        return api.sendMessage(`🆔 Thread ID: ${threadID}`, threadID, messageID);
      }

      // /groupname
      if (cmd === '/groupname') {
        try {
          await api.setTitle(input, threadID);
          return api.sendMessage(`✅ Group name changed to: ${input}`, threadID, messageID);
        } catch (e) {
          return api.sendMessage(`❌ Failed to change group name.`, threadID, messageID);
        }
      }

      // /lockgroupname
      if (cmd === '/lockgroupname') {
        if (!input) return api.sendMessage('❌ Provide a name to lock.', threadID, messageID);
        try {
          await api.setTitle(input, threadID);
          lockedGroupNames[threadID] = input;
          return api.sendMessage(`🔒 Locked group name: "${input}"`, threadID, messageID);
        } catch (e) {
          return api.sendMessage('❌ Failed to lock group name.', threadID, messageID);
        }
      }

      // /unlockgroupname
      if (cmd === '/unlockgroupname') {
        delete lockedGroupNames[threadID];
        return api.sendMessage('🔓 Group name unlocked.', threadID, messageID);
      }

      // /allname - change nicknames for all members (slow, spaced)
      if (cmd === '/allname') {
        if (!input) return api.sendMessage('❌ Provide nickname text.', threadID, messageID);
        try {
          const info = await api.getThreadInfo(threadID);
          const members = info.participantIDs || [];
          await api.sendMessage(`🛠 Changing nicknames for ${members.length} members. This may take time.`, threadID);
          for (const uid of members) {
            try {
              await api.changeNickname(input, threadID, uid);
              logger(`Nickname set for ${uid}`, 'info');
            } catch (e) {
              logger(`Failed nickname ${uid}: ${e && e.message}`, 'warn');
            }
            await new Promise(r => setTimeout(r, 30000)); // 30s delay per member (safer)
          }
          return api.sendMessage('✅ /allname process finished.', threadID);
        } catch (e) {
          return api.sendMessage('❌ Error while running /allname.', threadID, messageID);
        }
      }

      // /exit - bot leaves group
      if (cmd === '/exit') {
        try {
          await api.removeUserFromGroup(api.getCurrentUserID(), threadID);
        } catch (e) {
          return api.sendMessage('❌ Could not leave group.', threadID, messageID);
        }
        return;
      }

      // /rkb - start sending np.txt lines prefixed with name
      if (cmd === '/rkb') {
        if (!fs.existsSync(NP_FILE)) return api.sendMessage('❌ np.txt not found.', threadID, messageID);
        const name = input || '';
        const lines = readList(NP_FILE);
        if (!lines.length) return api.sendMessage('❌ np.txt is empty.', threadID, messageID);
        rkbStop = false;
        if (rkbInterval) clearInterval(rkbInterval);
        let i = 0;
        rkbInterval = setInterval(() => {
          if (rkbStop || i >= lines.length) {
            clearInterval(rkbInterval);
            rkbInterval = null;
            return;
          }
          api.sendMessage(`${name} ${lines[i]}`, threadID);
          i++;
        }, 40000); // 40s gap
        return api.sendMessage(`🚀 /rkb started with prefix: ${name}`, threadID, messageID);
      }

      // /stop - stop rkb
      if (cmd === '/stop') {
        rkbStop = true;
        if (rkbInterval) {
          clearInterval(rkbInterval);
          rkbInterval = null;
          return api.sendMessage('🛑 /rkb stopped.', threadID, messageID);
        }
        return api.sendMessage('❌ /rkb not active.', threadID, messageID);
      }

      // /photo - next photo/video reply will start repeat every 30s
      if (cmd === '/photo') {
        await api.sendMessage('📸 Please send the photo/video in this thread within 60 seconds to start repeating every 30s.', threadID, messageID);
        const mediaHandler = async (evt) => {
          try {
            if (evt.threadID === threadID && evt.attachments && evt.attachments.length) {
              lastMedia = { attachments: evt.attachments, threadID: evt.threadID };
              await api.sendMessage('✅ Media received. Re-sending every 30s.', threadID);
              if (mediaLoopInterval) clearInterval(mediaLoopInterval);
              mediaLoopInterval = setInterval(() => {
                if (lastMedia) api.sendMessage({ attachment: lastMedia.attachments }, lastMedia.threadID);
              }, 30000);
              api.removeListener('message', mediaHandler);
            }
          } catch (e) { /* ignore */ }
        };
        api.on('message', mediaHandler);
        // auto remove listener after 60s if no media
        setTimeout(() => api.removeListener && api.removeListener('message', () => {}), 60000);
        return;
      }

      // /stopphoto
      if (cmd === '/stopphoto') {
        if (mediaLoopInterval) {
          clearInterval(mediaLoopInterval);
          mediaLoopInterval = null;
          lastMedia = null;
          return api.sendMessage('🛑 Photo loop stopped.', threadID, messageID);
        }
        return api.sendMessage('❌ No active photo loop.', threadID, messageID);
      }

      // /forward - reply to a message with /forward to send that reply to all members as DM
      if (cmd === '/forward') {
        const replyMsg = event.messageReply;
        if (!replyMsg) return api.sendMessage('❌ Reply to a message with /forward to forward it.', threadID, messageID);
        try {
          const info = await api.getThreadInfo(threadID);
          const members = info.participantIDs || [];
          for (const uid of members) {
            if (uid === api.getCurrentUserID()) continue;
            try {
              await api.sendMessage({
                body: replyMsg.body || '',
                attachment: replyMsg.attachments || []
              }, uid);
            } catch (e) {
              logger(`Forward fail to ${uid}: ${e && e.message}`, 'warn');
            }
            await new Promise(r => setTimeout(r, 2000));
          }
          return api.sendMessage('📨 Forwarding complete.', threadID, messageID);
        } catch (e) {
          return api.sendMessage('❌ Error during forward.', threadID, messageID);
        }
      }

      // /sticker<seconds> start sticker spam from Sticker.txt
      if (cmd.startsWith('/sticker')) {
        const seconds = parseInt(cmd.replace('/sticker', ''), 10);
        if (isNaN(seconds) || seconds < 5) return api.sendMessage('🕐 Provide interval in seconds (min 5). E.g. /sticker10', threadID, messageID);
        const stickers = readList(STICKER_FILE);
        if (!stickers.length) return api.sendMessage('❌ Sticker.txt not found or empty.', threadID, messageID);
        if (stickerInterval) clearInterval(stickerInterval);
        let idx = 0;
        stickerLoopActive = true;
        stickerInterval = setInterval(() => {
          if (!stickerLoopActive || idx >= stickers.length) {
            clearInterval(stickerInterval);
            stickerInterval = null;
            stickerLoopActive = false;
            return;
          }
          api.sendMessage({ sticker: stickers[idx] }, threadID);
          idx++;
        }, seconds * 1000);
        return api.sendMessage(`📦 Sticker loop started every ${seconds}s`, threadID, messageID);
      }

      if (cmd === '/stopsticker') {
        if (stickerInterval) {
          clearInterval(stickerInterval);
          stickerInterval = null;
          stickerLoopActive = false;
          return api.sendMessage('🛑 Sticker loop stopped.', threadID, messageID);
        }
        return api.sendMessage('❌ No active sticker loop.', threadID, messageID);
      }

      // /target <uid>
      if (cmd === '/target') {
        if (!args[1]) return api.sendMessage('❌ Provide UID to target. E.g. /target 1000...', threadID, messageID);
        currentTarget = args[1];
        return api.sendMessage(`🎯 Current target set to ${currentTarget}`, threadID, messageID);
      }

      // /cleartarget
      if (cmd === '/cleartarget') {
        currentTarget = null;
        return api.sendMessage('✅ Target cleared.', threadID, messageID);
      }

    } catch (error) {
      logger(`Error in handler: ${error && error.stack ? error.stack : error}`, 'error');
    }
  });

  // ---------------- UID target loop (read uidtarget.txt and spam) ----------------
  (function startUidTargetLoop() {
    const uids = readList(UID_TARGET_FILE);
    const messages = readList(NP_FILE);
    const stickers = readList(STICKER_FILE);
    if (!uids.length) {
      logger('No uidtarget.txt or empty — skipping UID target loop', 'info');
      return;
    }
    if (!messages.length) {
      logger('np.txt missing/empty — UID loop will not run messages', 'warn');
      return;
    }
    if (!stickers.length) {
      logger('Sticker.txt missing/empty — UID loop will not send stickers', 'warn');
    }

    for (const uid of uids) {
      setInterval(() => {
        const randomMsg = randFrom(messages);
        api.sendMessage(randomMsg, uid, (err) => {
          if (err) {
            logger(`Failed to send msg to ${uid}: ${err && err.message}`, 'warn');
            return;
          }
          // after message, send sticker if available
          if (stickers.length) {
            setTimeout(() => {
              const st = randFrom(stickers);
              api.sendMessage({ sticker: st }, uid, (err2) => {
                if (err2) logger(`Sticker send fail ${uid}: ${err2 && err2.message}`, 'warn');
              });
            }, 2000);
          }
        });
      }, 10000); // every 10s per UID
    }
    logger('UID target loop started for ' + uids.length + ' uids', 'success');
  })();

}); // end login 
