require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const welcome = require('./cogs/welcome');
const rules = require('./cogs/rules');
const verification = require('./cogs/verification');

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

welcome.init(client);
rules.init(client);
verification.init(client);

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Failed to log in:', error);
  process.exit(1);
});
