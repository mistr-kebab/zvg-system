const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, Events, ChannelType, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const { loadData } = require('../../../utils/verificationStore');
const path = require('node:path');

const PANEL_IMAGE_PATH = path.join(process.cwd(), 'assets', 'roblox-linking.png');
const DEFAULT_CHANNEL_ID = '1541311852150263828';

function buildPanelPayload() {
  const linkedCount = Object.keys(loadData().links ?? {}).length;
  const container = new ContainerBuilder()
    .setAccentColor(0x00a2ff)
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://roblox-linking.png')))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Roblox Verification'),
      new TextDisplayBuilder().setContent(['Link your Roblox account to this Discord server.', '', '**How it works:**', '- Press **Link with Roblox** below', '- Enter your exact Roblox username', '- Put the generated code in your Roblox profile **About** section', '- Click **Check now**', '', '-# Your Discord nickname will be set to your Roblox username.'].join('\n')),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# 🔗 **${linkedCount}** account${linkedCount === 1 ? '' : 's'} linked`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zvg:verify:start').setLabel('Link with Roblox').setEmoji('🔗').setStyle(ButtonStyle.Primary)));
  return { flags: MessageFlags.IsComponentsV2, components: [container], files: [PANEL_IMAGE_PATH] };
}

const data = new SlashCommandBuilder()
  .setName('link-panel-refresh')
  .setDescription('Refresh or repost the verification panel (Admin)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

module.exports = {
  name: 'admin-linking-panel-refresh',
  init(client) {
    const { onReadyRegister } = require('../../../utils/slash');
    onReadyRegister(client, data);

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'link-panel-refresh') return;
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Access denied. Requires `ManageGuild`.', flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const channelId = process.env.VERIFY_CHANNEL_ID || DEFAULT_CHANNEL_ID;
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.editReply({ content: `Channel ${channelId} not found.` }).catch(() => null);
        return;
      }

      const store = loadData();
      if (store.state?.panelMessageId) {
        const existing = await channel.messages.fetch(store.state.panelMessageId).catch(() => null);
        if (existing) {
          await existing.edit(buildPanelPayload()).catch(() => null);
          await interaction.editReply({ content: `Panel updated: ${existing.url}` }).catch(() => null);
          return;
        }
      }

      const sent = await channel.send(buildPanelPayload()).catch(() => null);
      if (sent) {
        store.state ??= {};
        store.state.panelMessageId = sent.id;
        const { saveData } = require('../../../utils/verificationStore');
        saveData(store);
        await interaction.editReply({ content: `Panel reposted: ${sent.url}` }).catch(() => null);
      } else {
        await interaction.editReply({ content: 'Could not send panel.' }).catch(() => null);
      }
    });
  },
};
