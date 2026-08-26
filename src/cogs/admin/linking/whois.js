const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags, Events, SectionBuilder, ThumbnailBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const { loadData, getLink, findLinkByRobloxId, profileUrl, getRobloxUserByUsername } = require('../../../utils/verificationStore');

const data = new SlashCommandBuilder()
  .setName('link-whois')
  .setDescription('Lookup link status by Discord user or Roblox account (Admin)')
  .addUserOption(o => o.setName('discord_user').setDescription('Discord user to lookup').setRequired(false))
  .addStringOption(o => o.setName('roblox_username').setDescription('Roblox username to lookup').setRequired(false))
  .addStringOption(o => o.setName('roblox_id').setDescription('Roblox user ID to lookup').setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(InteractionContextType.Guild)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);

function buildDiscordLookup(target, link) {
  if (!link) {
    const c = new ContainerBuilder().setAccentColor(0xfee75c)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Not linked'), new TextDisplayBuilder().setContent(`${target} (\`${target.id}\`) is not linked.`));
    return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] };
  }
  const verifiedAt = link.verifiedAt ? Math.floor(new Date(link.verifiedAt).getTime() / 1000) : null;
  const c = new ContainerBuilder().setAccentColor(0x00a2ff)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('## Link found'),
          new TextDisplayBuilder().setContent([
            `${target} (\`${target.id}\`) → [**${link.robloxUsername}**](${profileUrl(link.robloxUserId)}) (\`${link.robloxUserId}\`)`,
            verifiedAt ? `Linked <t:${verifiedAt}:F> (<t:${verifiedAt}:R>)` : '',
          ].filter(Boolean).join('\n')),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(target.displayAvatarURL({ extension: 'png', size: 256 }))),
    );
  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] };
}

function buildRobloxLookup(robloxUser, clash) {
  if (!robloxUser) {
    const c = new ContainerBuilder().setAccentColor(0xed4245)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Roblox user not found'));
    return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] };
  }
  if (!clash) {
    const c = new ContainerBuilder().setAccentColor(0xfee75c)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('## Not linked'),
        new TextDisplayBuilder().setContent(`[**${robloxUser.name}**](${profileUrl(robloxUser.id)}) (\`${robloxUser.id}\`) is not linked to any Discord account.`),
      );
    return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] };
  }
  const verifiedAt = clash.verifiedAt ? Math.floor(new Date(clash.verifiedAt).getTime() / 1000) : null;
  const c = new ContainerBuilder().setAccentColor(0x57f287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Link found'),
      new TextDisplayBuilder().setContent([
        `[**${clash.robloxUsername}**](${profileUrl(clash.robloxUserId)}) (\`${clash.robloxUserId}\`) → <@${clash.discordId}> (\`${clash.discordId}\`)`,
        verifiedAt ? `Linked <t:${verifiedAt}:F> (<t:${verifiedAt}:R>)` : '',
      ].filter(Boolean).join('\n')),
    );
  return { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, components: [c] };
}

module.exports = {
  name: 'admin-linking-whois',
  init(client) {
    const { onReadyRegister } = require('../../../utils/slash');
    onReadyRegister(client, data);

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'link-whois') return;
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Access denied.', flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }

      const discordUser = interaction.options.getUser('discord_user');
      const robloxName = interaction.options.getString('roblox_username');
      const robloxIdStr = interaction.options.getString('roblox_id');

      if (!discordUser && !robloxName && !robloxIdStr) {
        await interaction.reply({ content: 'Please provide `discord_user` or `roblox_username` or `roblox_id`.', flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
      }

      if (discordUser) {
        const link = getLink(discordUser.id);
        await interaction.reply(buildDiscordLookup(discordUser, link)).catch(() => null);
        return;
      }

      if (robloxName) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const robloxUser = await getRobloxUserByUsername(robloxName.trim());
        if (!robloxUser) {
          await interaction.editReply(buildRobloxLookup(null, null)).catch(() => null);
          return;
        }
        const clash = findLinkByRobloxId(robloxUser.id);
        await interaction.editReply(buildRobloxLookup(robloxUser, clash)).catch(() => null);
        return;
      }

      if (robloxIdStr) {
        const robloxId = Number(robloxIdStr);
        if (!Number.isFinite(robloxId)) {
          await interaction.reply({ content: 'Invalid Roblox ID.', flags: MessageFlags.Ephemeral }).catch(() => null);
          return;
        }
        const clash = findLinkByRobloxId(robloxId);
        // try to fetch username for display
        let robloxUser = null;
        try {
          const res = await fetch(`https://users.roblox.com/v1/users/${robloxId}`);
          if (res.ok) robloxUser = await res.json();
        } catch {}
        const payload = buildRobloxLookup(robloxUser ? { id: robloxUser.id, name: robloxUser.name } : { id: robloxId, name: `ID ${robloxId}` }, clash);
        await interaction.reply(payload).catch(() => null);
      }
    });
  },
};
