const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, Events, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const { loadData, saveData, findLinkByRobloxId, profileUrl, getRobloxUserByUsername } = require('../../../utils/verificationStore');

const data = new SlashCommandBuilder()
  .setName('link-forcelink')
  .setDescription('Force-link a Discord user to a Roblox account (Admin only)')
  .addUserOption(o => o.setName('user').setDescription('Discord user to link').setRequired(true))
  .addStringOption(o => o.setName('roblox_username').setDescription('Exact Roblox username').setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

function buildSuccess(target, robloxUser) {
  const c = new ContainerBuilder().setAccentColor(0x57f287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Force-linked'),
      new TextDisplayBuilder().setContent(`${target} (\`${target.id}\`) was linked to [**${robloxUser.name}**](${profileUrl(robloxUser.id)}) (\`${robloxUser.id}\`).`),
    );
  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] };
}

module.exports = {
  name: 'admin-linking-forcelink',
  init(client) {
    const { onReadyRegister } = require('../../../utils/slash');
    onReadyRegister(client, data);

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'link-forcelink') return;
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Access denied.', flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const target = interaction.options.getUser('user', true);
      const robloxName = interaction.options.getString('roblox_username', true).trim();

      const robloxUser = await getRobloxUserByUsername(robloxName);
      if (!robloxUser) {
        await interaction.editReply({ content: `Roblox user **${robloxName}** not found.`, flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }

      const clash = findLinkByRobloxId(robloxUser.id, target.id);
      if (clash) {
        await interaction.editReply({ content: `**${robloxUser.name}** is already linked to <@${clash.discordId}>.`, flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }

      const store = loadData();
      store.links ??= {};
      store.links[target.id] = {
        robloxUserId: robloxUser.id,
        robloxUsername: robloxUser.name,
        verifiedAt: new Date().toISOString(),
        forcedBy: interaction.user.id,
      };
      saveData(store);

      try {
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (member) await member.setNickname(robloxUser.name).catch(() => null);
      } catch {}

      await interaction.editReply(buildSuccess(target, robloxUser)).catch(() => null);

      // refresh panel
      try {
        const { loadData: ld } = require('../../../utils/verificationStore');
        const panelId = ld().state?.panelMessageId;
        if (panelId) {
          const channelId = process.env.VERIFY_CHANNEL_ID || '1541311852150263828';
          const channel = await client.channels.fetch(channelId).catch(() => null);
          const msg = channel ? await channel.messages.fetch(panelId).catch(() => null) : null;
          if (msg) {
            const { ContainerBuilder: CB, TextDisplayBuilder: TB, MediaGalleryBuilder, MediaGalleryItemBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags: MF } = require('discord.js');
            const path = require('node:path');
            const linkedCount = Object.keys(ld().links ?? {}).length;
            const container = new CB().setAccentColor(0x00a2ff)
              .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://roblox-linking.png')))
              .addTextDisplayComponents(new TB().setContent('## Roblox Verification'), new TB().setContent(['Link your Roblox account to this Discord server.', '', '**How it works:**', '- Press **Link with Roblox** below', '- Enter your exact Roblox username', '- Put the generated code in your Roblox profile **About** section', '- Click **Check now**', '', '-# Your Discord nickname will be set to your Roblox username.'].join('\n')))
              .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
              .addTextDisplayComponents(new TB().setContent(`-# 🔗 **${linkedCount}** account${linkedCount === 1 ? '' : 's'} linked`))
              .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zvg:verify:start').setLabel('Link with Roblox').setEmoji('🔗').setStyle(ButtonStyle.Primary)));
            await msg.edit({ flags: MF.IsComponentsV2, components: [container], files: [path.join(process.cwd(), 'assets', 'roblox-linking.png')] }).catch(() => null);
          }
        }
      } catch {}
    });
  },
};
