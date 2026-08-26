const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, Events, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const { loadData } = require('../../../utils/verificationStore');

const data = new SlashCommandBuilder()
  .setName('link-stats')
  .setDescription('Show verification statistics (Admin)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

module.exports = {
  name: 'admin-linking-stats',
  init(client) {
    const { onReadyRegister } = require('../../../utils/slash');
    onReadyRegister(client, data);

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'link-stats') return;
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Access denied.', flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }

      const store = loadData();
      const links = store.links ?? {};
      const total = Object.keys(links).length;
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const week = Object.values(links).filter(l => l.verifiedAt && now - new Date(l.verifiedAt).getTime() < 7 * day).length;
      const month = Object.values(links).filter(l => l.verifiedAt && now - new Date(l.verifiedAt).getTime() < 30 * day).length;

      const guildMemberCount = interaction.guild?.memberCount ?? 'n/a';
      const unverified = typeof guildMemberCount === 'number' ? Math.max(0, guildMemberCount - total) : 'n/a';

      const c = new ContainerBuilder().setAccentColor(0x00a2ff)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('## Linking Stats'),
          new TextDisplayBuilder().setContent([
            `**Total linked:** \`${total}\``,
            `**Last 7 days:** \`${week}\``,
            `**Last 30 days:** \`${month}\``,
            `**Server Members:** \`${guildMemberCount}\` → unverified approx. \`${unverified}\``,
          ].join('\n')),
        );
      await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] }).catch(() => null);
    });
  },
};
