/**
 * index.js тА Single-file Facebook Messenger bot
 * рд╕рднреА commands рдЗрд╕ рдореЗрдВ рд╣реИрдВ (Hindi comments)
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
const logger = require('./utils/log') || console.log; // рдЕрдЧрд░ custom logger рдирд╣реАрдВ рд╣реИ рддреЛ console.log use рд╣реЛрдЧрд╛

// ---------------- Config & Globals ----------------
const PORT = process.env.PORT || 8080;
const APPSTATE_PATH = path.join(process.cwd(), 'appstate.json');

// Owners / admin UIDs тАФ рдЖрдк рдЕрдкрдиреА list рдпрд╣рд╛рдБ рд░рдЦреЗрдВ
const OWNER_UIDS = [
  /*  UIDs -- рдмрджрд▓реЗрдВ рдЕрдкрдиреА IDs рд╕реЗ */
  "100087411382804",
  "100001479670911",
  "100002357867932"
];

// рдлрд╝рд╛рдЗрд▓-рд░рд┐рд▓реЗрдЯреЗрдб lists
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

      if (['presence','typ','read_receipt'].includes(event.type)) return;

      const threadID = event.threadID;
      const senderID = event.senderID;
      const messageID = event.messageID;
      const body = event.body || '';
      const lower = body.toLowerCase();
      
      // ---------------- LOAD GROUP NAME LOCKS FROM group.txt ----------------
const GROUP_FILE = path.join(process.cwd(), 'group.txt');

function loadGroupLocks() {
  if (!fs.existsSync(GROUP_FILE)) return {};
  const lines = fs.readFileSync(GROUP_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  const locks = {};
  for (const line of lines) {
    const [uid, ...rest] = line.split('|');
    const name = rest.join('|').trim();
    if (uid && name) locks[uid.trim()] = name;
  }
  return locks;
}

// Load once on start
lockedGroupNames = loadGroupLocks();
if (Object.keys(lockedGroupNames).length) {
  logger(`Loaded ${Object.keys(lockedGroupNames).length} locked group names from group.txt`, 'info');
} else {
  logger('No locked groups found in group.txt (ignored)', 'info');
}

// Apply locks to ensure current group names match
(async () => {
  for (const [gid, gname] of Object.entries(lockedGroupNames)) {
    try {
      await api.setTitle(gname, gid);
      logger(` ${gid} to name: ${gname}`, 'success');
    } catch (e) {
      logger(` ${gid}: ${e.message}`, 'warn');
    }
    await new Promise(r => setTimeout(r, 3000));
  }
})();

      // ---- handle thread-name change events (lock group name) ----
      if (event.type === 'event' && event.logMessageType === 'log:thread-name') {
        const currentName = event.logMessageData && event.logMessageData.name;
        const locked = lockedGroupNames[threadID];
        if (locked && currentName !== locked) {
          try {
            await api.setTitle(locked, threadID);
            await api.sendMessage(`"${locked}"`, threadID);
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
          await api.sendMessage('jana bhen ke Lowde.', threadID, messageID);
        } catch (e) {}
        return;
      }

      if (!body && !(event.attachments && event.attachments.length)) return;

      const args = body.trim().split(/\s+/);
      const cmd = (args[0] || '').toLowerCase();
      const input = args.slice(1).join(' ');

      const isOwner = OWNER_UIDS.includes(senderID);
      if (!isOwner && cmd.startsWith('/')) return;

      // ---------- COMMANDS ----------
      if (cmd === '/help') {
        const helpText = `
ЁЯУМ Commands:
/allname <name>
/groupname <name>
/lockgroupname <name>
/unlockgroupname
/uid
/exit
/rkb <name>
/stop
/photo
/stopphoto
/sticker<seconds>
/stopsticker
/target <uid>
/cleartarget
/mkl @mention   new
/rkbm <uid>     new
/autoadding uid,uid,uid
/addadmin uid (new owner add)
/forward
/help
        `;
        return api.sendMessage(helpText.trim(), threadID, messageID);
      }

      if (cmd === '/uid') {
        return api.sendMessage(` GROUP ID: ${threadID}`, threadID, messageID);
      }

      if (cmd === '/groupname') {
        try {
          await api.setTitle(input, threadID);
          return api.sendMessage(`${input}`, threadID, messageID);
        } catch (e) {
          return api.sendMessage(` byy bkL`, threadID, messageID);
        }
      }

      if (cmd === '/lockgroupname') {
        if (!input) return api.sendMessage('😂😂.', threadID, messageID);
        try {
          await api.setTitle(input, threadID);
          lockedGroupNames[threadID] = input;
          return api.sendMessage(` 😂 "${input}"`, threadID, messageID);
        } catch (e) {
          return api.sendMessage(' 🤣bichara jhattu.', threadID, messageID);
        }
      }

      if (cmd === '/unlockgroupname') {
        delete lockedGroupNames[threadID];
        return api.sendMessage(' kidz 🤣.', threadID, messageID);
      }

      if (cmd === '/allname') {
        if (!input) return api.sendMessage('', threadID, messageID);
        try {
          const info = await api.getThreadInfo(threadID);
          const members = info.participantIDs || [];
          await api.sendMessage(` ${members.length}bosdi ke.`, threadID);
          for (const uid of members) {
            try {
              await api.changeNickname(input, threadID, uid);
              logger(`Nickname set for ${uid}`, 'info');
            } catch (e) {
              logger(`Failed nickname ${uid}: ${e && e.message}`, 'warn');
            }
            await new Promise(r => setTimeout(r, 30000));
          }
          return api.sendMessage('', threadID);
        } catch (e) {
          return api.sendMessage('', threadID, messageID);
        }
      }

      if (cmd === '/exit') {
        try {
          await api.removeUserFromGroup(api.getCurrentUserID(), threadID);
        } catch (e) {
          return api.sendMessage('.', threadID, messageID);
        }
        return;
      }

      if (cmd === '/rkb') {
        if (!fs.existsSync(NP_FILE)) return api.sendMessage(' np.txt not found.', threadID, messageID);
        const name = input || '';
        const lines = readList(NP_FILE);
        if (!lines.length) return api.sendMessage(' np.txt is empty.', threadID, messageID);
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
        }, 40000);
        return api.sendMessage(`ЁЯЪА /rkb started with prefix: ${name}`, threadID, messageID);
      }

      if (cmd === '/stop') {
        rkbStop = true;
        if (rkbInterval) {
          clearInterval(rkbInterval);
          rkbInterval = null;
          return api.sendMessage(' /rkb stopped.', threadID, messageID);
        }
        return api.sendMessage(' /rkb not active.', threadID, messageID);
      }

      if (cmd === '/photo') {
        await api.sendMessage('╕ Send photo/video within 60s.', threadID, messageID);
        const mediaHandler = async (evt) => {
          try {
            if (evt.threadID === threadID && evt.attachments && evt.attachments.length) {
              lastMedia = { attachments: evt.attachments, threadID: evt.threadID };
              await api.sendMessage(' Media received. Re-sending every 30s.', threadID);
              if (mediaLoopInterval) clearInterval(mediaLoopInterval);
              mediaLoopInterval = setInterval(() => {
                if (lastMedia) api.sendMessage({ attachment: lastMedia.attachments }, lastMedia.threadID);
              }, 30000);
              api.removeListener('message', mediaHandler);
            }
          } catch {}
        };
        api.on('message', mediaHandler);
        setTimeout(() => api.removeListener && api.removeListener('message', () => {}), 60000);
        return;
      }

      if (cmd === '/stopphoto') {
        if (mediaLoopInterval) {
          clearInterval(mediaLoopInterval);
          mediaLoopInterval = null;
          lastMedia = null;
          return api.sendMessage(' Photo loop stopped.', threadID, messageID);
        }
        return api.sendMessage(' No active photo loop.', threadID, messageID);
      }

      if (cmd === '/forward') {
        const replyMsg = event.messageReply;
        if (!replyMsg) return api.sendMessage(' Reply to a message with /forward to forward it.', threadID, messageID);
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
          return api.sendMessage('ЁЯУи Forwarding complete.', threadID, messageID);
        } catch (e) {
          return api.sendMessage('тЭМ Error during forward.', threadID, messageID);
        }
      }

      if (cmd.startsWith('/sticker')) {
        const seconds = parseInt(cmd.replace('/sticker', ''), 10);
        if (isNaN(seconds) || seconds < 5) return api.sendMessage('ЁЯХР Provide interval in seconds (min 5).', threadID, messageID);
        const stickers = readList(STICKER_FILE);
        if (!stickers.length) return api.sendMessage(' Sticker.txt not found or empty.', threadID, messageID);
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
        return api.sendMessage(`ЁЯУж Sticker loop started every ${seconds}s`, threadID, messageID);
      }

      if (cmd === '/stopsticker') {
        if (stickerInterval) {
          clearInterval(stickerInterval);
          stickerInterval = null;
          stickerLoopActive = false;
          return api.sendMessage(' Sticker loop stopped.', threadID, messageID);
        }
        return api.sendMessage(' No active sticker loop.', threadID, messageID);
      }

      if (cmd === '/target') {
        if (!args[1]) return api.sendMessage(' Provide UID to target.', threadID, messageID);
        currentTarget = args[1];
        return api.sendMessage(` Current target set to ${currentTarget}`, threadID, messageID);
      }

      if (cmd === '/cleartarget') {
        currentTarget = null;
        return api.sendMessage(' chud gya😂.', threadID, messageID);
      }

      // ---------------- NEW COMMANDS ----------------
      // ---------------- NEW COMMANDS ADDED BY GARIMA ----------------

      // /autoadding uid1,uid2,uid3    current group  add  
      if (cmd === '/autoadding') {
        if (!input) return api.sendMessage(' UIDs  comma  -: /autoadding 1000,1001,1002', threadID, messageID);
        const uidList = input.split(',').map(u => u.trim()).filter(Boolean);
        if (!uidList.length) return api.sendMessage('  UID list .', threadID, messageID);

        api.sendMessage(` ${uidList.length}       ...`, threadID, messageID);
        for (const uid of uidList) {
          try {
            await api.addUserToGroup(uid, threadID);
            await new Promise(r => setTimeout(r, 3000));
          } catch (err) {
            logger(`Add fail ${uid}: ${err.message}`, 'warn');
          }
        }
        return api.sendMessage('', threadID, messageID);
      }

      // /addadmin uid    UID  admin    OWNER_UIDS    
      if (cmd === '/addadmin') {
        if (!isOwner) return api.sendMessage('  owner  admin add   .', threadID, messageID);
        if (!args[1]) return api.sendMessage(' UID : /addadmin 1000...', threadID, messageID);

        const newAdmin = args[1];
        try {
          // Try to promote in current group
          await api.changeAdminStatus(threadID, newAdmin, true);
          api.sendMessage(` ${newAdmin}  group admin   .`, threadID);

          // Add to OWNER_UIDS
          if (!OWNER_UIDS.includes(newAdmin)) {
            OWNER_UIDS.push(newAdmin);
            fs.writeFileSync(path.join(process.cwd(), 'owners.json'), JSON.stringify(OWNER_UIDS, null, 2));
            api.sendMessage(` ${newAdmin}  permanent owner list     .`, threadID);
          }
        } catch (err) {
          api.sendMessage(`${err.message}`, threadID, messageID);
        }
        return;
      }
      
      // /mkl - mention рд╡рд╛рд▓рд╛ target рдмрдирд╛рдирд╛
      if (cmd === '/mkl') {
        if (!event.mentions || Object.keys(event.mentions).length === 0) {
          return api.sendMessage(': /mkl @name', threadID, messageID);
        }
        const mentionUID = Object.keys(event.mentions)[0];
        currentTarget = mentionUID;
        return api.sendMessage(` Target set to ${event.mentions[mentionUID]} (${mentionUID})`, threadID, messageID);
      }

      // /rkbm - reply auto gali mode (uid mention ke sath)
      if (cmd === '/rkbm') {
        const uid = args[1];
        if (!uid) return api.sendMessage(' UID  /rkbm 1000...', threadID, messageID);
        const lines = readList(NP_FILE);
        if (!lines.length) return api.sendMessage(' np.txt рдЦрд╛рд▓реА рдпрд╛ missing рд╣реИ.', threadID, messageID);

        api.sendMessage(` UID: ${uid}`, threadID, messageID);

        api.listenMqtt(async (err2, evt2) => {
          try {
            if (err2 || !evt2) return;
            if (evt2.type !== 'message' || !evt2.body) return;
            if (evt2.senderID === uid) {
              const randomLine = randFrom(lines);
              const nameMention = `@${evt2.senderName || 'User'}`;
              api.sendMessage({
                body: `${nameMention} ${randomLine}`,
                mentions: [{ tag: nameMention, id: uid }]
              }, evt2.threadID, evt2.messageID);
            }
          } catch (errx) {
            logger(`RKBM error: ${errx.message}`, 'warn');
          }
        });
        return;
      }

    } catch (error) {
      logger(`Error in handler: ${error}`, 'error');
    }
  });

  //--------------- UID TARGET LOOP HANDLER (optional legacy support) ----------------
  const uidTargets = readList(UID_TARGET_FILE);
  if (uidTargets.length) {
    logger(`Loaded ${uidTargets.length} UID targets from uidtarget.txt`, 'info');
    api.listenMqtt(async (err3, evt3) => {
      try {
        if (err3 || !evt3) return;
        if (evt3.type !== 'message' || !evt3.body) return;
        if (uidTargets.includes(evt3.senderID)) {
          const lines = readList(NP_FILE);
          if (!lines.length) return;
          const randomLine = randFrom(lines);
          api.sendMessage(randomLine, evt3.threadID, evt3.messageID);
        }
      } catch (errx) {
        logger(`UID target error: ${errx.message}`, 'warn');
      }
    });
  }

  // ---------------- CLEAN EXIT HANDLER ----------------
  process.on('SIGINT', () => {
    logger('ЁЯЫС Gracefully shutting down...', 'warn');
    if (rkbInterval) clearInterval(rkbInterval);
    if (mediaLoopInterval) clearInterval(mediaLoopInterval);
    if (stickerInterval) clearInterval(stickerInterval);
    process.exit(0);
  });

}); // <-- login callback рдмрдВрдж

// ---------------- END OF FILE ----------------
