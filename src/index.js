require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('clientReady', (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN is missing! Create a .env file (see .env.example).');
  process.exit(1);
}

const cogsPath = path.join(__dirname, 'cogs');
for (const file of fs.readdirSync(cogsPath)) {
  if (!file.endsWith('.js')) continue;

  try {
    const cog = require(path.join(cogsPath, file));
    cog.init(client);
    console.log(`[Cogs] Loaded: ${cog.name ?? path.basename(file, '.js')}`);
  } catch (error) {
    console.error(`[Cogs] Failed to load ${file}:`, error);
  }
}

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Failed to log in:', error);
  process.exit(1);
});
