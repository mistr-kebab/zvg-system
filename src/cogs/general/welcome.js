const {
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');

const ACCENT_COLOR = 0x5865f2;

function buildWelcomeContainer(member) {
  return new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## Welcome ${member.user.username}!`),
          new TextDisplayBuilder().setContent(
            `Hey <@${member.id}>, welcome to **${member.guild.name}**! Have fun and be kind.`,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(member.user.displayAvatarURL({ extension: 'png', size: 512 })),
        ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`We are now **${member.guild.memberCount}** members strong!`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# ZVG Studio'));
}

module.exports = {
  name: 'welcome',
  init(client) {
    client.on('guildMemberAdd', async (member) => {
      const channelId = process.env.WELCOME_CHANNEL_ID;
      if (!channelId || member.user.bot) return;

      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) {
          console.warn(`[Welcome] Channel ${channelId} not found or not a text channel.`);
          return;
        }

        const permissions = channel.permissionsFor(client.user);
        if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
          console.warn(`[Welcome] Missing permissions in channel #${channel.name}.`);
          return;
        }

        await channel.send({
          flags: MessageFlags.IsComponentsV2,
          components: [buildWelcomeContainer(member)],
        });
      } catch (error) {
        console.error('[Welcome] Failed to send welcome message:', error);
      }
    });
  },
};
