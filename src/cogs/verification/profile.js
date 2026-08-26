const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, Events, SectionBuilder, ThumbnailBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const { getLink, profileUrl } = require('../../utils/verificationStore');

const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Show your Roblox link status')
  .addUserOption(o => o.setName('user').setDescription('Check another user').setRequired(false))
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

module.exports = {
  name: 'verification-profile',
  init(client) {
    const { onReadyRegister } = require('../../utils/slash');
    onReadyRegister(client, data);

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'profile') return;

      const target = interaction.options.getUser('user') ?? interaction.user;
      const link = getLink(target.id);

      if (!link) {
        const c = new ContainerBuilder().setAccentColor(0xfee75c)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('## Not linked'),
            new TextDisplayBuilder().setContent(`${target.id === interaction.user.id ? 'You are' : `${target} is`} not linked yet. Use the verification panel to link your account.`),
          );
        await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] }).catch(() => null);
        return;
      }

      const verifiedAt = link.verifiedAt ? Math.floor(new Date(link.verifiedAt).getTime() / 1000) : null;
      const c = new ContainerBuilder().setAccentColor(0x57f287)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`## ${target.id === interaction.user.id ? 'Your' : `${target.username}'s`} Roblox Link`),
              new TextDisplayBuilder().setContent([
                `[**${link.robloxUsername}**](${profileUrl(link.robloxUserId)}) (\`${link.robloxUserId}\`)`,
                verifiedAt ? `Linked <t:${verifiedAt}:F> (<t:${verifiedAt}:R>)` : '',
              ].filter(Boolean).join('\n')),
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(target.displayAvatarURL({ extension: 'png', size: 256 }))),
        );
      await interaction.reply({ flags: MessageFlags.IsComponentsV2 | (target.id === interaction.user.id ? MessageFlags.Ephemeral : 0), components: [c] }).catch(() => null);
    });
  },
};
