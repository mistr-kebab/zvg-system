/**
 * /stats — Interactive flow: /stats -> Embed with Game Dropdown -> Continue -> Member picker -> Stats Embed
 * Keeps same DataStore / rank logic, but UI is now dropdown+continue+user-select as requested.
 */
const {
  SlashCommandBuilder,
  EmbedBuilder,
  Events,
  InteractionContextType,
  ApplicationIntegrationType,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { getLink } = require('../../utils/verificationStore');

const GAMES = {
  color_panic: {
    displayName: 'Color Panic',
    emoji: '<:ColorPanic:1542162042138661016>',
    universeId: process.env.ROBLOX_UNIVERSE_ID,
    datastoreName: process.env.ROBLOX_DATASTORE_NAME,
    leaderboardName: process.env.ROBLOX_LEADERBOARD_DATASTORE_NAME,
  },
};

const leaderboardCache = new Map();
const LEADERBOARD_TTL_MS = 5 * 60 * 1000;
const pendingGame = new Map(); // discordId -> { gameKey, expiresAt }
const PENDING_TTL_MS = 15 * 60 * 1000;
function setPendingGame(userId, gameKey) {
  pendingGame.set(String(userId), { gameKey, expiresAt: Date.now() + PENDING_TTL_MS });
}
function getPendingGame(userId) {
  const entry = pendingGame.get(String(userId));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { pendingGame.delete(String(userId)); return null; }
  return entry.gameKey;
}
// periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingGame) if (v.expiresAt < now) pendingGame.delete(k);
}, 60 * 1000).unref?.();

function formatPlaytime(s){ const v=Number(s)||0; const h=Math.floor(v/3600), m=Math.floor((v%3600)/60); if(h>0) return `${h}h ${m}m`; if(m>0) return `${m}m`; return `${v}s`; }

async function resolveRobloxUser(input){
  if(!input) return null;
  const mentionMatch = input.match(/^<@!?(\d+)>$/);
  if(mentionMatch){
    const link=getLink(mentionMatch[1]);
    if(!link) throw {userMsg:'This user has not linked their Roblox account yet. Use `/verify` to link.'};
    try{ const r=await fetch(`https://users.roblox.com/v1/users/${link.robloxUserId}`); const j=await r.json(); return {userId:String(link.robloxUserId), username:j.name||link.robloxUsername}; }catch{ return {userId:String(link.robloxUserId), username:link.robloxUsername}; }
  }
  if(/^\d{17,19}$/.test(input.trim())){
    const link=getLink(input.trim());
    if(!link) throw {userMsg:'This user has not linked their Roblox account yet. Use `/verify` to link.'};
    return {userId:String(link.robloxUserId), username:link.robloxUsername};
  }
  const username=input.trim();
  const res=await fetch('https://users.roblox.com/v1/usernames/users',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usernames:[username]})});
  if(!res.ok) throw new Error(`users ${res.status}`);
  const data=await res.json();
  const user=data.data?.[0];
  if(!user) throw {userMsg:'Roblox user not found.'};
  return {userId:String(user.id), username:user.name};
}
async function fetchDataStoreEntry(game, robloxUserId){
  const universeId=game.universeId, datastoreName=game.datastoreName, apiKey=process.env.ROBLOX_OPEN_CLOUD_KEY;
  if(!universeId||!datastoreName||!apiKey) throw new Error('Missing ROBLOX env');
  const keysToTry=[`${robloxUserId}`,`Player_${robloxUserId}`];
  for(const entryKey of keysToTry){
    const url=`https://apis.roblox.com/cloud/v2/universes/${universeId}/data-stores/${encodeURIComponent(datastoreName)}/entries/${encodeURIComponent(entryKey)}`;
    const res=await fetch(url,{headers:{'x-api-key':apiKey}});
    if(res.status===404) {
      const legacyUrl=`https://apis.roblox.com/datastore/v1/universes/${universeId}/standard-datastores/datastore/entries/entry?datastoreName=${encodeURIComponent(datastoreName)}&entryKey=${encodeURIComponent(entryKey)}`;
      const legacyRes=await fetch(legacyUrl,{headers:{'x-api-key':apiKey}}).catch(()=>null);
      if(legacyRes && legacyRes.ok){
        const json=await legacyRes.json().catch(()=>null);
        if(json){
          let p=json;
          if(typeof json==='string'){ try{ p=JSON.parse(json); }catch{} }
          else if(json.data) { p=json.data; }
          if(typeof p==='string'){ try{ p=JSON.parse(p); }catch{} }
          if(p && typeof p.value==='string'){ try{ p=JSON.parse(p.value); }catch{} }
          if(p) return p;
        }
      }
      continue;
    }
    if(!res.ok){ const txt=await res.text().catch(()=> ''); throw new Error(`DataStore ${res.status}: ${txt.slice(0,300)}`); }
    const json=await res.json();
    let payload=json.value ?? json.data ?? json;
    if(typeof payload==='string'){ try{payload=JSON.parse(payload);}catch{} }
    if(payload && typeof payload.value==='string'){ try{payload=JSON.parse(payload.value);}catch{} }
    if(payload && typeof payload==='string' && payload.length>20) { try { const decoded=Buffer.from(payload,'base64').toString('utf8'); const parsed=JSON.parse(decoded); if(parsed && typeof parsed==='object') payload=parsed; } catch {} }
    if(payload && typeof payload==='object') return payload;
    if(payload) return payload;
  }
  return null;
}
async function fetchAvatarHeadshot(robloxUserId){
  try{ const r=await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxUserId}&size=150x150&format=Png&isCircular=false`); if(!r.ok) return null; const j=await r.json(); return j.data?.[0]?.imageUrl||null; }catch{ return null; }
}
async function getRankCached(game, robloxUserId){
  const key=game.displayName; const now=Date.now(); let entry=leaderboardCache.get(key);
  if(!entry||now-entry.updatedAt>LEADERBOARD_TTL_MS){ entry=await refreshLeaderboard(game); leaderboardCache.set(key,entry); }
  const rank=entry.rankMap.get(String(robloxUserId)); return rank?`#${rank}`:'Unranked';
}
async function refreshLeaderboard(game){
  const universeId=game.universeId, datastoreName=game.leaderboardName, apiKey=process.env.ROBLOX_OPEN_CLOUD_KEY;
  const rankMap=new Map();
  if(!universeId||!datastoreName||!apiKey){ return {rankMap, updatedAt:Date.now()}; }
  try{
    let cursor=''; let rank=1;
    for(let page=0;page<10;page++){
      // try v2 ordered data stores first
      let url=`https://apis.roblox.com/cloud/v2/universes/${universeId}/ordered-data-stores/${encodeURIComponent(datastoreName)}/entries?maxPageSize=100&orderBy=desc${cursor?`&pageToken=${encodeURIComponent(cursor)}`:''}`;
      let r=await fetch(url,{headers:{'x-api-key':apiKey}});
      if(!r.ok){
        // fallback to v1
        url=`https://apis.roblox.com/datastore/v1/universes/${universeId}/ordered-datastores/datastore/entries?datastoreName=${encodeURIComponent(datastoreName)}&maxPageSize=100&orderBy=Descending${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`;
        r=await fetch(url,{headers:{'x-api-key':apiKey}});
      }
      if(!r.ok) break;
      const j=await r.json(); const entries=j.entries||j.data||j.orderedDataStoreEntries||[];
      for(const e of entries){ const rawKey=e.id||e.entryKey||e.key||e.path?.split('/').pop()||''; const uid=String(rawKey).replace(/^Player_/,''); if(uid) rankMap.set(uid,rank++); }
      cursor=j.nextPageToken||j.nextPageCursor||''; if(!cursor) break;
    }
    if(rankMap.size) console.log(`[Stats] Cached ${game.displayName}: ${rankMap.size}`);
  }catch(e){ /* silent — Pterodactyl often ECONNREFUSED, rank stays Unranked */ }
  return {rankMap, updatedAt:Date.now()};
}
function startLeaderboardAutoRefresh(){
  setInterval(async()=>{
    for(const game of Object.values(GAMES)){
      if(!game.universeId||!game.leaderboardName) continue;
      try{ leaderboardCache.set(game.displayName, await refreshLeaderboard(game)); }catch{}
    }
  }, LEADERBOARD_TTL_MS);
}

function buildGameSelectPayload(selectedKey=null){
  const options = Object.entries(GAMES).map(([value,g])=>{
    const opt = new StringSelectMenuOptionBuilder().setLabel(g.displayName).setValue(value).setDefault(value===selectedKey);
    if (g.emoji) try { opt.setEmoji(g.emoji); } catch {}
    return opt;
  });
  const select = new StringSelectMenuBuilder().setCustomId('zvg:stats:game').setPlaceholder('Select a game').addOptions(options).setMinValues(1).setMaxValues(1);
  const cont = new ContainerBuilder().setAccentColor(0x00a2ff)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Game Stats'), new TextDisplayBuilder().setContent('Select a game to see stats, then choose a member/player.'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(select));
  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components:[cont] };
}
function buildMemberSelectPayload(gameKey){
  const game=GAMES[gameKey];
  const userSelect = new UserSelectMenuBuilder().setCustomId('zvg:stats:user').setPlaceholder('Select a member').setMinValues(1).setMaxValues(1);
  const cont = new ContainerBuilder().setAccentColor(0x00a2ff)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${game.displayName} — Select Player`), new TextDisplayBuilder().setContent('Choose a Discord member (must be linked) or click **Enter Roblox username** for any Roblox user.'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(userSelect))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('zvg:stats:roblox_btn').setLabel('Enter Roblox username').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('zvg:stats:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
    ));
  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components:[cont] };
}

const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Show game stats — interactive')
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

module.exports = {
  name: 'game-stats',
  init(client){
    const { onReadyRegister } = require('../../utils/slash');
    onReadyRegister(client, data);
    client.once(Events.ClientReady, ()=>{
      startLeaderboardAutoRefresh();
      for(const g of Object.values(GAMES)){
        if(g.universeId && g.leaderboardName) refreshLeaderboard(g).then(c=>leaderboardCache.set(g.displayName,c)).catch(()=>null);
      }
    });

    client.on(Events.InteractionCreate, async (interaction)=>{
      try{
        if(interaction.customId?.startsWith('zvg:stats:') && interaction.customId!=='zvg:stats:game' && interaction.customId!=='zvg:stats:user') console.log(`[Stats] ${interaction.customId} by ${interaction.user.id}`);
        if(interaction.isChatInputCommand() && interaction.commandName==='stats'){
          await interaction.reply(buildGameSelectPayload());
          return;
        }
        if(interaction.isStringSelectMenu() && interaction.customId==='zvg:stats:game'){
          const chosen = interaction.values[0];
          setPendingGame(interaction.user.id, chosen);
          await interaction.update(buildMemberSelectPayload(chosen));
          return;
        }
        if(interaction.isButton() && interaction.customId==='zvg:stats:back'){
          const sel = getPendingGame(interaction.user.id) || null;
          await interaction.update(buildGameSelectPayload(sel));
          return;
        }
        if(interaction.isButton() && interaction.customId==='zvg:stats:roblox_btn'){
          const gameKey = getPendingGame(interaction.user.id);
          if(!gameKey){ await interaction.reply({ content:'Select a game first.', flags: MessageFlags.Ephemeral }).catch(()=>null); return; }
          const modal = new ModalBuilder().setCustomId(`zvg:stats:modal:${gameKey}`).setTitle('Roblox username')
            .addLabelComponents(new LabelBuilder().setLabel('Roblox Username').setTextInputComponent(new TextInputBuilder().setCustomId('robloxUsername').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(20)));
          await interaction.showModal(modal);
          return;
        }
        if((interaction.isUserSelectMenu?.() || interaction.isAnySelectMenu?.()) && interaction.customId==='zvg:stats:user'){
          const gameKey = getPendingGame(interaction.user.id);
          const game = GAMES[gameKey];
          if(!game){ await interaction.reply({ content:'Select a game first.', flags: MessageFlags.Ephemeral }).catch(()=>null); return; }
          const selectedUserId = interaction.values[0];
          try { await interaction.deferUpdate(); } catch {}
          // resolve via linked
          let resolved;
          try{
            const link = getLink(selectedUserId);
            if(!link) throw {userMsg:'This user has not linked their Roblox account yet. Use `/verify` to link.'};
            try{ const r=await fetch(`https://users.roblox.com/v1/users/${link.robloxUserId}`); const j=await r.json(); resolved={userId:String(link.robloxUserId), username:j.name||link.robloxUsername}; }catch{ resolved={userId:String(link.robloxUserId), username:link.robloxUsername}; }
          }catch(e){
            console.error('[Stats] resolve failed', e);
            if(e.userMsg){ await interaction.editReply({ content:e.userMsg, components: [], embeds: [] }).catch(async()=> await interaction.followUp({ content:e.userMsg, flags: MessageFlags.Ephemeral }).catch(()=>null)); return; }
            await interaction.editReply({ content:'Something went wrong, please try again later.', components: [], embeds: [] }).catch(async()=> await interaction.followUp({ content:'Something went wrong, please try again later.', flags: MessageFlags.Ephemeral }).catch(()=>null)); return;
          }
          console.log(`[Stats] resolved ${resolved.userId} ${resolved.username}`);
          await sendStats(interaction, game, resolved);
          return;
        }
        if(interaction.isModalSubmit() && interaction.customId.startsWith('zvg:stats:modal:')){
          const gameKey = interaction.customId.split(':').pop();
          const game = GAMES[gameKey];
          if(!game){ await interaction.reply({ content:'Unknown game.', flags: MessageFlags.Ephemeral }).catch(()=>null); return; }
          const username = interaction.fields.getTextInputValue('robloxUsername').trim();
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          let resolved;
          try{
            const res=await fetch('https://users.roblox.com/v1/usernames/users',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usernames:[username]})});
            const data=await res.json(); const user=data.data?.[0];
            if(!user){ await interaction.editReply({ content:'Roblox user not found.' }).catch(()=>null); return; }
            resolved={userId:String(user.id), username:user.name};
          }catch(e){ console.error(e); await interaction.editReply({content:'Something went wrong, please try again later.'}).catch(()=>null); return; }
          await sendStatsModal(interaction, game, resolved);
          return;
        }
      }catch(e){ console.error('[Stats] interaction error',e); }
    });

    async function sendStats(interaction, game, resolved){
      console.log(`[Stats] sendStats start ${resolved.userId} ${game.displayName}`);
      let stats=null, thumb=null, rank='Unranked';
      try{
        const [s,t,r]=await Promise.all([fetchDataStoreEntry(game,resolved.userId), fetchAvatarHeadshot(resolved.userId), getRankCached(game,resolved.userId)]);
        stats=s; thumb=t; rank=r;
        console.log(`[Stats] fetched stats=${!!stats} thumb=${!!thumb} rank=${rank}`);
      }catch(e){
        console.error('[Stats] fetch failed', e.message, e.cause?.code, e.stack);
        const msg = e.message?.includes('Missing ROBLOX env') ? 'Stats not configured — missing ROBLOX_OPEN_CLOUD_KEY / Universe ID on Pterodactyl (.env).' : `Could not fetch stats for **${resolved.username}** — Roblox API unreachable (\`${e.cause?.code || e.message || 'fetch failed'}\`). Try again later.`;
        await interaction.editReply({ content: msg, components: [], embeds: [] }).catch(async()=> await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(()=>null));
        return;
      }
      if(!stats){
        console.log(`[Stats] no stats for ${resolved.username}`);
        const noStatsContainer = new ContainerBuilder().setAccentColor(0xfee75c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('## No stats found'),
            new TextDisplayBuilder().setContent(`No stats found for **${resolved.username}** — this player hasn't played **${game.displayName}** yet.`),
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${game.displayName} • ${resolved.username}`));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [noStatsContainer], embeds: [], content: undefined }).catch(async()=> await interaction.followUp({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [noStatsContainer] }).catch(()=>null)); return;
      }
      const coins=stats.Coins??stats.coins??0, deaths=stats.Deaths??stats.deaths??0, wins=stats.Wins??stats.wins??0, playtime=stats.PlayTime??stats.Playtime??stats.playtime??0;
      const profile = `https://www.roblox.com/users/${resolved.userId}/profile`;
      const statsContainer = new ContainerBuilder().setAccentColor(0x00a2ff)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## [${resolved.username}](${profile})`),
              new TextDisplayBuilder().setContent(
                [
                  `**Coins:** \`${coins}\``,
                  `**Deaths:** \`${deaths}\``,
                  `**Wins:** \`${wins}\``,
                  `**Playtime:** \`${formatPlaytime(playtime)}\``,
                  `**Rank:** \`${rank}\``,
                ].join('\n'),
              ),
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb || 'https://tr.rbxcdn.com/53eb9b17fe143ff365413e30c3a6d32ea/150/150/AvatarHeadshot/Png')),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${game.displayName} • [Profile](${profile})`));
      console.log(`[Stats] sending container for ${resolved.username}`);
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [statsContainer], embeds: [], content: undefined }).catch(async(e)=> { console.error('[Stats] editReply container failed', e); await interaction.followUp({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [statsContainer] }).catch(()=>null); });
      pendingGame.delete(String(interaction.user.id));
    }
    async function sendStatsModal(interaction, game, resolved){
      let stats=null, thumb=null, rank='Unranked';
      try{
        const [s,t,r]=await Promise.all([fetchDataStoreEntry(game,resolved.userId), fetchAvatarHeadshot(resolved.userId), getRankCached(game,resolved.userId)]);
        stats=s; thumb=t; rank=r;
      }catch(e){ console.error(e); await interaction.editReply({ content:'Something went wrong, please try again later.' }).catch(()=>null); return; }
      if(!stats){
        const noStatsContainer = new ContainerBuilder().setAccentColor(0xfee75c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('## No stats found'),
            new TextDisplayBuilder().setContent(`No stats found for **${resolved.username}** — this player hasn't played **${game.displayName}** yet.`),
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${game.displayName} • ${resolved.username}`));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [noStatsContainer], embeds: [], content: undefined }).catch(()=>null); return;
      }
      const coins=stats.Coins??stats.coins??0, deaths=stats.Deaths??stats.deaths??0, wins=stats.Wins??stats.wins??0, playtime=stats.PlayTime??stats.Playtime??stats.playtime??0;
      const profile = `https://www.roblox.com/users/${resolved.userId}/profile`;
      const statsContainer = new ContainerBuilder().setAccentColor(0x00a2ff)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## [${resolved.username}](${profile})`),
              new TextDisplayBuilder().setContent(
                [
                  `**Coins:** \`${coins}\``,
                  `**Deaths:** \`${deaths}\``,
                  `**Wins:** \`${wins}\``,
                  `**Playtime:** \`${formatPlaytime(playtime)}\``,
                  `**Rank:** \`${rank}\``,
                ].join('\n'),
              ),
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumb || 'https://tr.rbxcdn.com/53eb9b17fe143ff365413e30c3a6d32ea/150/150/AvatarHeadshot/Png')),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${game.displayName} • [Profile](${profile})`));
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [statsContainer], embeds: [], content: undefined }).catch(()=>null);
      pendingGame.delete(String(interaction.user.id));
    }
  }
};
