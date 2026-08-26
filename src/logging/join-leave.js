const {
  ChannelType,
  ContainerBuilder,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');

const DEFAULT_CHANNEL_ID = '1541004573085536276';
const MAX_ROLES_SHOWN = 15;

const inviteCache = new Map();

async function snapshotInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const uses = new Map();
    for (const invite of invites.values()) {
      uses.set(invite.code, invite.uses ?? 0);
    }
    if (guild.vanityURLCode) {
      try {
        const vanity = await guild.fetchVanityData();
        uses.set(vanity.code, vanity.uses ?? 0);
      } catch {
        // vanity not accessible
      }
    }
    return { invites, uses };
  } catch {
    return null;
  }
}

async function resolveInviter(member) {
  const guild = member.guild;
  const previous = inviteCache.get(guild.id);
  const snapshot = await snapshotInvites(guild);

  if (!snapshot) return null;
  inviteCache.set(guild.id, snapshot);

  if (!previous) return null;

  let matchedCode = null;
  for (const [code, uses] of snapshot.uses) {
    if (uses > (previous.uses.get(code) ?? 0)) {
      matchedCode = code;
      break;
    }
  }
  if (!matchedCode) return null;

  if (guild.vanityURLCode && matchedCode === guild.vanityURLCode) {
    return { text: `**Invited by:** Vanity URL (discord.gg/${matchedCode})` };
  }

  const inviter = snapshot.invites.get(matchedCode)?.inviter;
  if (!inviter) return null;

  return { text: `**Invited by:** ${inviter} (\`${inviter.id}\`)` };
}

function buildJoinContainer(member, inviterLine) {
  const createdAt = Math.floor(member.user.createdTimestamp / 1000);

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Member Joined'),
      new TextDisplayBuilder().setContent(
        [
          `${member} just joined the server!`,
          '',
          inviterLine ?? '-# Inviter could not be determined',
          `-# Account created: <t:${createdAt}:R>`,
        ].join('\n'),
      ),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(member.user.displayAvatarURL({ extension: 'png', size: 256 })),
    );

  return new ContainerBuilder()
    .setAccentColor(0x57f287)
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${member.guild.memberCount} members | ID: ${member.id}`),
    );
}

function buildLeaveContainer(member) {
  const roles = [...member.roles.cache.values()].filter((role) => role.id !== member.guild.id);
  const roleText = roles.length
    ? `${roles.slice(0, MAX_ROLES_SHOWN).map((role) => role.toString()).join(' ')}${roles.length > MAX_ROLES_SHOWN ? ` (+${roles.length - MAX_ROLES_SHOWN})` : ''}`
    : 'None';

  const joinedLine = member.joinedTimestamp
    ? ` | Joined: <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
    : '';

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Member Left'),
      new TextDisplayBuilder().setContent(
        [`**${member.user.username}** (${member})`, `-# Roles: ${roleText}`].join('\n'),
      ),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(member.user.displayAvatarURL({ extension: 'png', size: 256 })),
    );

  return new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${member.guild.memberCount} members | ID: ${member.id}${joinedLine}`,
      ),
    );
}

async function sendLog(client, container) {
  const channelId = process.env.JOIN_LEAVE_LOG_CHANNEL_ID || DEFAULT_CHANNEL_ID;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.warn(`[JoinLeave] Channel ${channelId} not found or not a text channel.`);
      return;
    }

    const permissions = channel.permissionsFor(client.user);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      console.warn(`[JoinLeave] Missing permissions in channel #${channel.name}.`);
      return;
    }

    await channel.send({ flags: MessageFlags.IsComponentsV2, components: [container] });
  } catch (error) {
    console.error('[JoinLeave] Failed to send log:', error);
  }
}

module.exports = {
  name: 'join-leave',
  init(client) {
    client.once(Events.ClientReady, () => {
      for (const guild of client.guilds.cache.values()) {
        snapshotInvites(guild).then((snapshot) => {
          if (snapshot) inviteCache.set(guild.id, snapshot);
        });
      }
    });

    client.on(Events.GuildMemberAdd, async (member) => {
      const inviterLine = await resolveInviter(member);
      sendLog(client, buildJoinContainer(member, inviterLine?.text));
    });

    client.on(Events.GuildMemberRemove, (member) => {
      if (!member.user) return;
      sendLog(client, buildLeaveContainer(member));
    });
  },
};
