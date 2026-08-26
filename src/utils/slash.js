const { Events } = require('discord.js');

const pending = [];
let handlerInstalled = false;

function onReadyRegister(client, data) {
  const json = typeof data.toJSON === 'function' ? data.toJSON() : data;
  // deduplicate by name
  const existingIdx = pending.findIndex(c => c.name === json.name);
  if (existingIdx !== -1) pending[existingIdx] = json;
  else pending.push(json);

  if (!handlerInstalled) {
    handlerInstalled = true;
    client.once(Events.ClientReady, () => sync(client));
  }
  if (client.isReady()) sync(client);
}

async function sync(client) {
  if (pending.length === 0) return;

  // deduplicate
  const unique = [...new Map(pending.map(c => [c.name, c])).values()];
  const allowedNames = new Set(unique.map(c => c.name));

  // Remove all global commands - we use guild-only to avoid duplicates and allow instant updates
  try {
    if (client.application) {
      const globals = await client.application.commands.fetch().catch(() => null);
      if (globals) {
        for (const cmd of globals.values()) {
          await client.application.commands.delete(cmd.id).catch(() => null);
          console.log(`[Slash] Removed global command ${cmd.name}`);
        }
      }
    }
  } catch (e) {
    console.error('[Slash] Failed to cleanup global commands:', e.message);
  }

  // For each guild, set exactly to unique list (removes old + stale)
  for (const guild of client.guilds.cache.values()) {
    try {
      const existing = await guild.commands.fetch().catch(() => null);
      // delete duplicates within guild (same name multiple times - Discord shouldn't allow but guard)
      if (existing) {
        const seen = new Set();
        for (const cmd of [...existing.values()]) {
          if (seen.has(cmd.name)) {
            await guild.commands.delete(cmd.id).catch(() => null);
            console.log(`[Slash] Removed duplicate guild command ${cmd.name} in ${guild.name}`);
          } else {
            seen.add(cmd.name);
          }
        }
      }
      await guild.commands.set(unique);
      console.log(`[Slash] Synced ${unique.length} commands to guild ${guild.name} (${guild.id})`);
    } catch (e) {
      console.error(`[Slash] Failed to sync guild ${guild.id}:`, e.message);
    }
  }
}

module.exports = { onReadyRegister, sync, pending };
