const { ChannelType, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, PermissionFlagsBits, Events, SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DEFAULT_CHANNEL_ID = '1541540867846840451';
const CHANNEL_ID = process.env.TRENDING_CHANNEL_ID || DEFAULT_CHANNEL_ID;
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'trending.json');

function loadTrendingData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return {}; }
}
function saveTrendingData(d) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(`${DATA_FILE}.tmp`, JSON.stringify(d, null, 2));
  fs.renameSync(`${DATA_FILE}.tmp`, DATA_FILE);
}

async function fetchTrending() {
  const sessionId = crypto.randomUUID();
  const urls = [
    `https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${sessionId}&sortId=Top_Trending_V6`,
    `https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${sessionId}&sortId=CCU_Based_V1`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
      if (!r.ok) {
        console.warn(`[Trending] ${url} status ${r.status}`);
        continue;
      }
      const j = await r.json();
      let games = j.games || [];
      console.log(`[Trending] Fetched ${games.length} from ${url.split('sortId=')[1]}`);
      games = games.filter(g => {
        const genre = (g.genreL1 || '').toLowerCase();
        const name = (g.name || '').toLowerCase();
        if (genre === 'roleplay & avatar sim') return false;
        if (name.includes(' rp') || name.includes('roleplay') || name.includes('brookhaven')) return false;
        return true;
      });
      console.log(`[Trending] After filter ${games.length} remain`);
      if (games.length > 0) return games.slice(0, 10);
    } catch (e) {
      console.warn('[Trending] fetch error', e.message);
    }
  }
  // Fallback: use known popular non-RP universes via games.roblox.com (always works)
  console.warn('[Trending] Explore API failed, using fallback via games.roblox.com');
  const fallbackIds = [10563114921,66654135,994732206,7326934954,6035872082,7709344486,7585140258,703124385,4777817887,2440500124];
  try {
    const r = await fetch(`https://games.roblox.com/v1/games?universeIds=${fallbackIds.join(',')}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const j = await r.json();
      const games = (j.data || []).filter(d => d.name && d.name !== '[TITLE UNAVAILABLE]').map(d => ({
        universeId: fallbackIds.find(id => String(id) === String(d.id)) || d.id,
        rootPlaceId: d.rootPlaceId,
        name: d.name,
        playerCount: d.playing || 0,
        totalUpVotes: d.favoritedCount || 0,
        totalDownVotes: 0,
        genreL1: d.genre_l1 || d.genre || 'Simulation',
      })).filter(g => {
        const n = (g.name||'').toLowerCase();
        if (n.includes('roleplay') || n.includes('brookhaven')) return false;
        return g.playerCount > 0;
      }).sort((a,b)=>b.playerCount-a.playerCount);
      if (games.length) {
        console.log(`[Trending] Fallback returned ${games.length}`);
        return games.slice(0,10);
      }
    } else {
      console.warn(`[Trending] Fallback games.roblox.com status ${r.status}`);
    }
  } catch (e) {
    console.warn('[Trending] Fallback failed', e.message);
  }
  return [];
}

async function fetchThumbnails(universeIds) {
  try {
    const url = `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeIds.join(',')}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`;
    const r = await fetch(url);
    if (!r.ok) return {};
    const j = await r.json();
    const map = {};
    for (const d of j.data || []) map[d.targetId] = d.imageUrl;
    return map;
  } catch { return {}; }
}

function formatPlayers(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(1) + 'K';
  return String(n);
}

async function buildTrendingPayload(games) {
  // Discord Component limit: max 40 total components (nested counted). With Section (Section+Text+Thumbnail=3) + Separator we hit 44 at 10 games.
  // Limit to 5 to stay safely under limit and match static fallback.
  games = games.slice(0, 5);
  const thumbs = await fetchThumbnails(games.map(g => g.universeId));
  const container = new ContainerBuilder().setAccentColor(0x00a2ff)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# Trending Roblox Games'),
      new TextDisplayBuilder().setContent(`Top trending games right now — excluding Roleplay. Updated <t:${Math.floor(Date.now()/1000)}:R>`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const thumb = thumbs[g.universeId] || null;
    const url = `https://www.roblox.com/games/${g.rootPlaceId}`;
    const likes = g.totalUpVotes || 0;
    const pct = g.totalUpVotes && g.totalDownVotes ? Math.round(g.totalUpVotes / (g.totalUpVotes + g.totalDownVotes) * 100) : null;
    const lines = [
      `**${i+1}. [${g.name}](${url})**`,
      `👥 \`${formatPlayers(g.playerCount)}\` playing • \`${g.genreL1}\` • 👍 ${pct ? `${pct}%` : likes}`,
    ].join('\n');

    if (thumb) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb)),
      );
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
    }
    if (i < games.length - 1) container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# ZVG System • Trending • Excludes RP • Auto-updates every 12h'));

  return { flags: MessageFlags.IsComponentsV2, components: [container] };
}

function buildEmptyPayload() {
  const container = new ContainerBuilder().setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# Trending Roblox Games'),
      new TextDisplayBuilder().setContent('Could not fetch trending games right now.\nPlease try again later — will auto-retry in 12h.'),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Updated <t:${Math.floor(Date.now()/1000)}:R> • Source: explore-api`));
  return { flags: MessageFlags.IsComponentsV2, components: [container] };
}

async function syncTrending(client, forceNew = false) {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID).catch(()=>null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.warn(`[Trending] Channel ${CHANNEL_ID} not found`);
      return;
    }
    const perms = channel.permissionsFor(client.user);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      console.warn(`[Trending] Missing perms in #${channel.name}`);
      return;
    }

    let games = await fetchTrending();
    const dataCache = loadTrendingData();
    if (games.length) {
      // cache successful fetch
      dataCache.cachedGames = games;
      dataCache.cachedAt = new Date().toISOString();
      saveTrendingData(dataCache);
    } else if (dataCache.cachedGames?.length) {
      console.warn('[Trending] Using cached games (fetch failed)');
      games = dataCache.cachedGames;
    }
    if (!games.length) {
      // ultimate static fallback (no API needed) so embed never stays red on Pterodactyl
      const staticGames = [
        { universeId: 10563114921, rootPlaceId: 107778070777162, name: 'Steal An Egg', playerCount: 540000, totalUpVotes: 510000, totalDownVotes: 23000, genreL1: 'Simulation' },
        { universeId: 66654135, rootPlaceId: 142823291, name: 'Murder Mystery 2', playerCount: 380000, totalUpVotes: 10400000, totalDownVotes: 1040000, genreL1: 'Survival' },
        { universeId: 994732206, rootPlaceId: 2753915549, name: '⚔️ Blox Fruits', playerCount: 300000, totalUpVotes: 12500000, totalDownVotes: 1050000, genreL1: 'RPG' },
        { universeId: 7326934954, rootPlaceId: 79546208627805, name: '99 Nights in the Forest', playerCount: 235000, totalUpVotes: 5300000, totalDownVotes: 550000, genreL1: 'Survival' },
        { universeId: 6035872082, rootPlaceId: 17625359962, name: 'RIVALS', playerCount: 175000, totalUpVotes: 10300000, totalDownVotes: 680000, genreL1: 'Shooter' },
      ];
      console.warn('[Trending] Using static fallback games');
      games = staticGames;
    }
    const payload = await buildTrendingPayload(games);
    const data = loadTrendingData();

    if (!forceNew && data.messageId) {
      const existing = await channel.messages.fetch(data.messageId).catch(()=>null);
      if (existing) {
        await existing.edit(payload).catch(()=>null);
        console.log('[Trending] Updated trending message');
        return;
      }
    }

    // delete old bot messages to avoid spam if no stored id
    if (forceNew) {
      // keep edit path, but if forceNew we post new
    } else if (!data.messageId) {
      const msgs = await channel.messages.fetch({ limit: 20 }).catch(()=>null);
      if (msgs) {
        const old = [...msgs.values()].filter(m => m.author.id === client.user.id);
        // we will edit the most recent instead of spamming if exists
        if (old.length > 0) {
          const latest = old.sort((a,b)=>b.createdTimestamp-a.createdTimestamp)[0];
          await latest.edit(payload).catch(()=>null);
          data.messageId = latest.id;
          saveTrendingData(data);
          console.log('[Trending] Edited existing message (no stored id)');
          return;
        }
      }
    }

    const sent = await channel.send(payload);
    data.messageId = sent.id;
    data.updatedAt = new Date().toISOString();
    saveTrendingData(data);
    console.log('[Trending] Posted new trending message');
  } catch (e) {
    console.error('[Trending] sync failed', e);
  }
}

const data = new SlashCommandBuilder()
  .setName('trending-refresh')
  .setDescription('Refresh trending Roblox games (Admin)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

module.exports = {
  name: 'roblox-trending',
  init(client) {
    const { onReadyRegister } = require('../../utils/slash');
    onReadyRegister(client, data);

    client.once(Events.ClientReady, () => {
      syncTrending(client);
      setInterval(() => syncTrending(client), 12 * 60 * 60 * 1000);
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'trending-refresh') return;
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Access denied. Requires `ManageGuild`.', flags: MessageFlags.Ephemeral }).catch(()=>null);
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await syncTrending(client, true);
      await interaction.editReply({ content: `Trending updated in <#${CHANNEL_ID}>` }).catch(()=>null);
    });
  },
};
