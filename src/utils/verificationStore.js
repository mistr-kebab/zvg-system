const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'verification.json');

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function getLink(discordId) {
  return loadData().links?.[discordId] ?? null;
}

function findLinkByRobloxId(robloxUserId, excludeDiscordId = null) {
  const links = loadData().links ?? {};
  const entry = Object.entries(links).find(
    ([discordId, link]) => link.robloxUserId === robloxUserId && discordId !== excludeDiscordId,
  );
  return entry ? { discordId: entry[0], ...entry[1] } : null;
}

function profileUrl(userId) {
  return `https://www.roblox.com/users/${userId}/profile`;
}

async function getRobloxUserByUsername(username) {
  try {
    const res = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username] }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0] ?? null;
  } catch {
    return null;
  }
}

async function getRobloxProfile(userId) {
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const crypto = require('node:crypto');
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map();

function generateCode() {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return `ZVG-${code}`;
}

module.exports = {
  DATA_FILE,
  loadData,
  saveData,
  getLink,
  findLinkByRobloxId,
  profileUrl,
  getRobloxUserByUsername,
  getRobloxProfile,
  sessions,
  generateCode,
  SESSION_TTL_MS,
};
