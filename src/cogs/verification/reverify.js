const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, Events, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const { loadData, saveData, getLink, profileUrl, getRobloxProfile } = require('../../utils/verificationStore');

const data = new SlashCommandBuilder()
  .setName('reverify')
  .setDescription('Refresh your nickname from your linked Roblox username')
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

module.exports = {
  name: 'verification-reverify',
  init(client) {
    const { onReadyRegister } = require('../../utils/slash');
    onReadyRegister(client, data);

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'reverify') return;

      const link = getLink(interaction.user.id);
      if (!link) {
        await interaction.reply({ content: 'You are not linked.', flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const profile = await getRobloxProfile(link.robloxUserId);
      if (!profile) {
        await interaction.editReply({ content: 'Could not load Roblox profile. Please try again later.' }).catch(() => null);
        return;
      }

      const currentName = profile.name;
      const store = loadData();
      if (store.links?.[interaction.user.id]) {
        store.links[interaction.user.id].robloxUsername = currentName;
        saveData(store);
      }

      let note = '';
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (member) {
          await member.setNickname(currentName);
          note = 'Nickname updated.';
        }
      } catch {
        note = 'Could not update nickname (missing permissions / role hierarchy).';
      }

      const c = new ContainerBuilder().setAccentColor(0x57f287)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('## Reverified'),
          new TextDisplayBuilder().setContent(`Your link: [**${currentName}**](${profileUrl(link.robloxUserId)}).\n${note}`),
        );
      await interaction.editReply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] }).catch(() => null);
    });
  },
};
