require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
client.setMaxListeners(0);

client.once('clientReady', (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN is missing! Create a .env file (see .env.example).');
  process.exit(1);
}

const moduleDirs = ['cogs', 'logging'];

function loadModulesRecursive(baseDir, dirLabel) {
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      loadModulesRecursive(fullPath, dirLabel);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      try {
        const cog = require(fullPath);
        if (typeof cog.init === 'function') cog.init(client);
        const rel = path.relative(path.join(__dirname, dirLabel), fullPath);
        console.log(`[${dirLabel}] Loaded: ${cog.name ?? rel}`);
      } catch (error) {
        console.error(`[${dirLabel}] Failed to load ${fullPath}:`, error);
      }
    }
  }
}

for (const dir of moduleDirs) {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) continue;
  loadModulesRecursive(dirPath, dir);
}

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Failed to log in:', error);
  process.exit(1);
});
