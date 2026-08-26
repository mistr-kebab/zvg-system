const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, Events, ChannelType, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const { loadData, saveData, getLink, profileUrl } = require('../../../utils/verificationStore');

const data = new SlashCommandBuilder()
  .setName('link-unlink')
  .setDescription('Unlink a Discord user from their Roblox account (Admin only)')
  .addUserOption(o => o.setName('user').setDescription('Discord user to unlink').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason for unlink').setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

function buildUnlinkedPayload(target, link, reason) {
  const c = new ContainerBuilder().setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Unlinked'),
      new TextDisplayBuilder().setContent([
        `${target} (\`${target.id}\`) was unlinked from [**${link.robloxUsername}**](${profileUrl(link.robloxUserId)}) (\`${link.robloxUserId}\`).`,
        reason ? `**Reason:** ${reason}` : '',
      ].filter(Boolean).join('\n')),
    );
  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] };
}

function buildNotLinkedPayload(target) {
  const c = new ContainerBuilder().setAccentColor(0xfee75c)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Not linked'),
      new TextDisplayBuilder().setContent(`${target} is not linked.`),
    );
  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] };
}

async function refreshPanel(client) {
  try {
    const store = loadData();
    const panelId = store.state?.panelMessageId;
    if (!panelId) return;
    const channelId = process.env.VERIFY_CHANNEL_ID || '1541311852150263828';
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    const msg = await channel.messages.fetch(panelId).catch(() => null);
    if (!msg) return;
    const { loadData: ld } = require('../../../utils/verificationStore');
    const linkedCount = Object.keys(ld().links ?? {}).length;
    const { ContainerBuilder: CB, TextDisplayBuilder: TB, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags: MF } = require('discord.js');
    const path = require('node:path');
    const PANEL_IMAGE_PATH = path.join(process.cwd(), 'assets', 'roblox-linking.png');
    const container = new CB().setAccentColor(0x00a2ff)
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://roblox-linking.png')))
      .addTextDisplayComponents(new TB().setContent('## Roblox Verification'), new TB().setContent(['Link your Roblox account to this Discord server.', '', '**How it works:**', '- Press **Link with Roblox** below', '- Enter your exact Roblox username', '- Put the generated code in your Roblox profile **About** section', '- Click **Check now**', '', '-# Your Discord nickname will be set to your Roblox username.'].join('\n')))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new TB().setContent(`-# 🔗 **${linkedCount}** account${linkedCount === 1 ? '' : 's'} linked`))
      .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zvg:verify:start').setLabel('Link with Roblox').setEmoji('🔗').setStyle(ButtonStyle.Primary)));
    await msg.edit({ flags: MF.IsComponentsV2, components: [container], files: [PANEL_IMAGE_PATH] }).catch(() => null);
  } catch {}
}

module.exports = {
  name: 'admin-linking-unlink',
  init(client) {
    const { onReadyRegister } = require('../../../utils/slash');
    onReadyRegister(client, data);

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'link-unlink') return;
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Access denied. Requires `ModerateMembers` or `Administrator`.', flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }
      const target = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason');
      const link = getLink(target.id);
      if (!link) {
        await interaction.reply(buildNotLinkedPayload(target)).catch(() => null);
        return;
      }
      const store = loadData();
      delete store.links[target.id];
      saveData(store);

      // try to reset nickname if member in guild
      try {
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (member) await member.setNickname(null).catch(() => null);
      } catch {}

      await interaction.reply(buildUnlinkedPayload(target, link, reason)).catch(() => null);
      await refreshPanel(client);
    });
  },
};
