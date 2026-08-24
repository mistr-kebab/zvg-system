const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  Events,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} = require('discord.js');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CHANNEL_ID = '1541311852150263828';
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'verification.json');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_TTL_MS = 15 * 60 * 1000;

const sessions = new Map();

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

function generateCode() {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return `ZVG-${code}`;
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

function profileUrl(userId) {
  return `https://www.roblox.com/users/${userId}/profile`;
}

function buildPanelPayload() {
  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Roblox Verification'),
      new TextDisplayBuilder().setContent(
        [
          'Link your Roblox account to this Discord server.',
          '',
          '**How it works:**',
          '- Press **Verify with Roblox** below',
          '- Enter your exact Roblox username',
          '- Put the generated code in your Roblox profile **About** section',
          '- Click **Check now**',
          '',
          '-# Your Discord nickname will be set to your Roblox username.',
        ].join('\n'),
      ),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Roblox_Logo_2022.svg/512px-Roblox_Logo_2022.svg.png',
      ),
    );

  const container = new ContainerBuilder()
    .setAccentColor(0x00a2ff)
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('zvg:verify:start')
          .setLabel('Verify with Roblox')
          .setEmoji('🔗')
          .setStyle(ButtonStyle.Primary),
      ),
    );

  return { flags: MessageFlags.IsComponentsV2, components: [container] };
}

function buildCodePayload(session) {
  const expiresAt = Math.floor(session.expiresAt / 1000);

  const container = new ContainerBuilder()
    .setAccentColor(0xfee75c)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Your Verification Code'),
      new TextDisplayBuilder().setContent(`### ${session.code}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `Open [**${session.robloxUsername}**'s profile](${profileUrl(session.robloxUserId)}) and click **About / Edit**:`,
          '',
          '**1.** Paste the code above into the **About** section and save it',
          '**2.** Click **Check now** below',
          '',
          `-# You can remove the code afterwards. Expires <t:${expiresAt}:R>.`,
        ].join('\n'),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('zvg:verify:check').setLabel('Check now').setStyle(ButtonStyle.Success),
      ),
    );

  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [container] };
}

function buildRetryPayload(session) {
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Code not found yet'),
      new TextDisplayBuilder().setContent(
        [
          `The code \`${session.code}\` was not found in the profile of **${session.robloxUsername}**.`,
          '',
          'Please make sure:',
          '- The code is in the **About** section of your profile',
          '- You clicked **Save** on Roblox',
          '- A few seconds have passed since saving',
        ].join('\n'),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('zvg:verify:check').setLabel('Check again').setStyle(ButtonStyle.Success),
      ),
    );

  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [container] };
}

function buildSuccessPayload(link, nicknameNote) {
  const container = new ContainerBuilder()
    .setAccentColor(0x57f287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Verified!'),
      new TextDisplayBuilder().setContent(
        `Your account is now linked to [**${link.robloxUsername}**](${profileUrl(link.robloxUserId)}).\n\n${nicknameNote}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# You can now remove the code from your Roblox profile.'),
    );

  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [container] };
}

function buildAlreadyVerifiedPayload(link) {
  const container = new ContainerBuilder()
    .setAccentColor(0x57f287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Already verified'),
      new TextDisplayBuilder().setContent(
        `You are already linked to [**${link.robloxUsername}**](${profileUrl(link.robloxUserId)}).\nOpen a ticket if you want to relink.`,
      ),
    );

  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [container] };
}

function buildExpiredPayload() {
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Session expired'),
      new TextDisplayBuilder().setContent('Press the verify button again to start over.'),
    );

  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [container] };
}

function buildUserNotFoundPayload(username) {
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## User not found'),
      new TextDisplayBuilder().setContent(
        `No Roblox account named **${username}** was found.\nCheck the spelling and press the verify button again.`,
      ),
    );

  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [container] };
}

async function applyNickname(member, robloxUsername) {
  try {
    await member.setNickname(robloxUsername);
    return 'Your nickname has been updated.';
  } catch {
    return 'I could not update your nickname (missing permissions or role hierarchy). Please contact staff.';
  }
}

async function handleStart(interaction) {
  const link = getLink(interaction.user.id);
  if (link) {
    await interaction.reply(buildAlreadyVerifiedPayload(link));
    return;
  }

  const input = new TextInputBuilder()
    .setCustomId('robloxUsername')
    .setLabel('Roblox Username')
    .setPlaceholder('Your exact Roblox username')
    .setStyle(TextInputStyle.Short)
    .setMinLength(3)
    .setMaxLength(20)
    .setRequired(true);

  const modal = new ModalBuilder()
    .setCustomId('zvg:verify:submit')
    .setTitle('Roblox Verification')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Roblox Username')
        .setDescription('The exact username of your Roblox account')
        .setTextInputComponent(input),
    );

  await interaction.showModal(modal);
}

async function handleSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const username = interaction.fields.getTextInputValue('robloxUsername').trim();
  const user = await getRobloxUserByUsername(username);

  if (!user) {
    await interaction.editReply(buildUserNotFoundPayload(username));
    return;
  }

  const session = {
    robloxUserId: user.id,
    robloxUsername: user.name,
    code: generateCode(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(interaction.user.id, session);

  await interaction.editReply(buildCodePayload(session));
}

async function handleCheck(interaction) {
  await interaction.deferUpdate();

  const session = sessions.get(interaction.user.id);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(interaction.user.id);
    await interaction.editReply(buildExpiredPayload());
    return;
  }

  const profile = await getRobloxProfile(session.robloxUserId);
  const description = profile?.description ?? '';

  if (!description.toUpperCase().includes(session.code.toUpperCase())) {
    await interaction.editReply(buildRetryPayload(session));
    return;
  }

  const data = loadData();
  data.links ??= {};
  data.links[interaction.user.id] = {
    robloxUserId: session.robloxUserId,
    robloxUsername: session.robloxUsername,
    verifiedAt: new Date().toISOString(),
  };
  saveData(data);
  sessions.delete(interaction.user.id);

  const nicknameNote = await applyNickname(interaction.member, session.robloxUsername);
  await interaction.editReply(buildSuccessPayload(data.links[interaction.user.id], nicknameNote));
}

async function ensurePanel(client) {
  const channelId = process.env.VERIFY_CHANNEL_ID || DEFAULT_CHANNEL_ID;

  try {
    const data = loadData();
    data.state ??= {};

    if (data.state.panelMessageId) {
      const existing = await client.channels
        .fetch(channelId)
        .then((channel) => channel.messages.fetch(data.state.panelMessageId))
        .catch(() => null);
      if (existing) {
        console.log('[Verification] Panel already present.');
        return;
      }
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.warn(`[Verification] Channel ${channelId} not found or not a text channel.`);
      return;
    }

    const permissions = channel.permissionsFor(client.user);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      console.warn(`[Verification] Missing permissions in channel #${channel.name}.`);
      return;
    }

    const sent = await channel.send(buildPanelPayload());
    data.state.panelMessageId = sent.id;
    saveData(data);
    console.log('[Verification] Posted verification panel.');
  } catch (error) {
    console.error('[Verification] Failed to ensure panel:', error);
  }
}

module.exports = {
  name: 'verification',
  init(client) {
    client.once(Events.ClientReady, () => ensurePanel(client));

    client.on(Events.InteractionCreate, async (interaction) => {
      const relevant =
        (interaction.isButton() && interaction.customId.startsWith('zvg:verify')) ||
        (interaction.isModalSubmit() && interaction.customId === 'zvg:verify:submit');
      if (!relevant) return;

      try {
        if (interaction.customId === 'zvg:verify:start') await handleStart(interaction);
        else if (interaction.customId === 'zvg:verify:submit') await handleSubmit(interaction);
        else if (interaction.customId === 'zvg:verify:check') await handleCheck(interaction);
      } catch (error) {
        console.error('[Verification]', error);
        const fallback = { content: 'Something went wrong. Please try again.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(fallback).catch(() => null);
        } else {
          await interaction.reply(fallback).catch(() => null);
        }
      }
    });

    client.on(Events.GuildMemberAdd, async (member) => {
      const link = getLink(member.id);
      if (!link) return;
      await applyNickname(member, link.robloxUsername);
    });
  },
};
