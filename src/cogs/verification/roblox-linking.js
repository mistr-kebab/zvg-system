const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  Events,
  LabelBuilder,
  MessageFlags,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  TextInputBuilder,
  TextInputStyle,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const path = require('node:path');

const DEFAULT_CHANNEL_ID = '1541311852150263828';
const DEFAULT_LOG_CHANNEL_ID = '1541345572965851176';
const PANEL_IMAGE_PATH = path.join(process.cwd(), 'assets', 'roblox-linking.png');

const {
  loadData,
  saveData,
  getLink,
  findLinkByRobloxId,
  generateCode,
  getRobloxUserByUsername,
  getRobloxProfile,
  profileUrl,
  sessions,
  SESSION_TTL_MS,
} = require('../../utils/verificationStore');

function buildPanelPayload() {
  const linkedCount = Object.keys(loadData().links ?? {}).length;
  const container = new ContainerBuilder()
    .setAccentColor(0x00a2ff)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://roblox-linking.png'),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Roblox Verification'),
      new TextDisplayBuilder().setContent(
        [
          'Link your Roblox account to this Discord server.',
          '',
          '**How it works:**',
          '- Press **Link with Roblox** below',
          '- Enter your exact Roblox username',
          '- Put the generated code in your Roblox profile **About** section',
          '- Click **Check now**',
          '',
          '-# Your Discord nickname will be set to your Roblox username.',
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# 🔗 **${linkedCount}** account${linkedCount === 1 ? '' : 's'} linked`),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('zvg:verify:start')
          .setLabel('Link with Roblox')
          .setEmoji('🔗')
          .setStyle(ButtonStyle.Primary),
      ),
    );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    files: [PANEL_IMAGE_PATH],
  };
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
  const verifiedAt = link.verifiedAt ? Math.floor(new Date(link.verifiedAt).getTime() / 1000) : null;
  const verifiedLine = verifiedAt
    ? `Linked <t:${verifiedAt}:F> (<t:${verifiedAt}:R>)`
    : 'Verification date unknown';

  const container = new ContainerBuilder()
    .setAccentColor(0x57f287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Already verified'),
      new TextDisplayBuilder().setContent(
        [
          `You are already linked to [**${link.robloxUsername}**](${profileUrl(link.robloxUserId)}) (\`${link.robloxUserId}\`).`,
          verifiedLine,
          '',
          'Open a ticket if you want to relink.',
        ].join('\n'),
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

function buildRobloxTakenPayload(username) {
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Roblox account already linked'),
      new TextDisplayBuilder().setContent(
        [
          `**${username}** is already linked to another Discord account.`,
          '',
          'One Roblox account can only be connected to one Discord account.',
          'Open a ticket if you believe this is a mistake.',
        ].join('\n'),
      ),
    );

  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [container] };
}

async function applyNickname(member, robloxUsername) {
  try {
    await member.setNickname(robloxUsername);
    return 'Your nickname has been updated.';
  } catch (error) {
    console.error(`[RobloxLinking] Failed to set nickname for ${member.id} (${member.user?.username}):`, error);
    return 'I could not update your nickname (missing permissions or role hierarchy). Please contact staff.';
  }
}

function buildLinkLogPayload(member, link) {
  const verifiedAt = Math.floor(new Date(link.verifiedAt).getTime() / 1000);

  const container = new ContainerBuilder()
    .setAccentColor(0x00a2ff)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('## Account Linked'),
          new TextDisplayBuilder().setContent(
            [
              `${member} (\`${member.id}\`) linked their Roblox account:`,
              `[**${link.robloxUsername}**](${profileUrl(link.robloxUserId)}) (\`${link.robloxUserId}\`)`,
            ].join('\n'),
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(member.user.displayAvatarURL({ extension: 'png', size: 256 })),
        ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Verified <t:${verifiedAt}:R>`),
    );

  return { flags: MessageFlags.IsComponentsV2, components: [container] };
}

async function sendLinkLog(client, member, link) {
  const channelId = process.env.VERIFICATION_LOG_CHANNEL_ID || DEFAULT_LOG_CHANNEL_ID;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.warn(`[RobloxLinking] Log channel ${channelId} not found.`);
      return;
    }

    const permissions = channel.permissionsFor(client.user);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      console.warn(`[RobloxLinking] Missing permissions in log channel #${channel.name}.`);
      return;
    }

    await channel.send(buildLinkLogPayload(member, link));
  } catch (error) {
    console.error('[RobloxLinking] Failed to send link log:', error);
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });

  const username = interaction.fields.getTextInputValue('robloxUsername').trim();
  const user = await getRobloxUserByUsername(username);

  if (!user) {
    await interaction.editReply(buildUserNotFoundPayload(username));
    return;
  }

  if (findLinkByRobloxId(user.id)) {
    await interaction.editReply(buildRobloxTakenPayload(user.name));
    sessions.delete(interaction.user.id);
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

  const clash = findLinkByRobloxId(session.robloxUserId, interaction.user.id);
  if (clash) {
    sessions.delete(interaction.user.id);
    await interaction.editReply(buildRobloxTakenPayload(session.robloxUsername));
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

  await sendLinkLog(interaction.client, interaction.member, data.links[interaction.user.id]);
  await refreshPanel(interaction.client);
}

async function refreshPanel(client) {
  try {
    const data = loadData();
    const panelId = data.state?.panelMessageId;
    if (!panelId) return;
    const channelId = process.env.VERIFY_CHANNEL_ID || DEFAULT_CHANNEL_ID;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    const message = await channel.messages.fetch(panelId).catch(() => null);
    if (!message) return;
    await message.edit(buildPanelPayload());
  } catch (error) {
    console.error('[RobloxLinking] Failed to refresh panel:', error);
  }
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
        try {
          await existing.edit(buildPanelPayload());
          console.log('[RobloxLinking] Panel refreshed.');
        } catch (error) {
          console.error('[RobloxLinking] Failed to refresh existing panel:', error);
        }
        return;
      }
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.warn(`[RobloxLinking] Channel ${channelId} not found or not a text channel.`);
      return;
    }

    const permissions = channel.permissionsFor(client.user);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      console.warn(`[RobloxLinking] Missing permissions in channel #${channel.name}.`);
      return;
    }

    const sent = await channel.send(buildPanelPayload());
    data.state.panelMessageId = sent.id;
    saveData(data);
    console.log('[RobloxLinking] Posted verification panel.');
  } catch (error) {
    console.error('[RobloxLinking] Failed to ensure panel:', error);
  }
}

module.exports = {
  name: 'roblox-linking',
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
        console.error('[RobloxLinking]', error);
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
