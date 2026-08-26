const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const { findLinkByRobloxId, getRobloxUserByUsername, profileUrl, sessions, generateCode, SESSION_TTL_MS } = require('../../utils/verificationStore');

function buildCodePayload(session) {
  const expiresAt = Math.floor(session.expiresAt / 1000);
  const container = new ContainerBuilder()
    .setAccentColor(0xfee75c)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Your Verification Code'), new TextDisplayBuilder().setContent(`### ${session.code}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([`Open [**${session.robloxUsername}**'s profile](${profileUrl(session.robloxUserId)}) and click **About / Edit**:`, '', '**1.** Paste the code above into the **About** section and save it', '**2.** Click **Check now** below', '', `-# You can remove the code afterwards. Expires <t:${expiresAt}:R>.`].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zvg:verify:check').setLabel('Check now').setStyle(ButtonStyle.Success)));
  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [container] };
}

const data = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Verify your Roblox account')
  .addStringOption(o => o.setName('roblox_username').setDescription('Your exact Roblox username').setRequired(true).setMinLength(3).setMaxLength(20))
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

module.exports = {
  name: 'verification-verify',
  init(client) {
    const { onReadyRegister } = require('../../utils/slash');
    onReadyRegister(client, data);

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'verify') return;

      const { getLink } = require('../../utils/verificationStore');
      const link = getLink(interaction.user.id);
      if (link) {
        const verifiedAt = link.verifiedAt ? Math.floor(new Date(link.verifiedAt).getTime() / 1000) : null;
        const c = new ContainerBuilder().setAccentColor(0x57f287)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('## Already verified'),
            new TextDisplayBuilder().setContent([`You are already linked to [**${link.robloxUsername}**](${profileUrl(link.robloxUserId)}) (\`${link.robloxUserId}\`).`, verifiedAt ? `Linked <t:${verifiedAt}:F> (<t:${verifiedAt}:R>)` : '', '', 'Open a ticket if you want to relink.'].filter(Boolean).join('\n')),
          );
        await interaction.reply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] }).catch(() => null);
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });

      const username = interaction.options.getString('roblox_username', true).trim();
      const user = await getRobloxUserByUsername(username);
      if (!user) {
        const c = new ContainerBuilder().setAccentColor(0xed4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('## User not found'), new TextDisplayBuilder().setContent(`No Roblox account named **${username}** was found.`));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] }).catch(() => null);
        return;
      }

      if (findLinkByRobloxId(user.id)) {
        const c = new ContainerBuilder().setAccentColor(0xed4245)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Roblox account already linked'), new TextDisplayBuilder().setContent(`**${user.name}** is already linked to another Discord account.`));
        await interaction.editReply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] }).catch(() => null);
        return;
      }

      const session = { robloxUserId: user.id, robloxUsername: user.name, code: generateCode(), expiresAt: Date.now() + SESSION_TTL_MS };
      sessions.set(interaction.user.id, session);

      await interaction.editReply(buildCodePayload(session)).catch(() => null);
    });
  },
};
