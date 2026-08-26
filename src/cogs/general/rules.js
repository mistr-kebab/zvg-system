const {
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const path = require('node:path');

const DEFAULT_CHANNEL_ID = '1540997569210093568';
const HEADER_IMAGE_PATH = path.join(process.cwd(), 'assets', 'rules.png');

const RULE_CATEGORIES = [
  {
    title: 'General Conduct',
    color: 0x5865f2,
    rules: [
      'Treat everyone with respect. No harassment, hate speech, discrimination, or personal attacks based on race, gender, religion, sexuality, or anything else.',
      'No NSFW, gore, or disturbing content of any kind — text, images, links, or usernames/avatars.',
      'No spam, mass-mentions, or flooding channels with unrelated messages.',
      'No unsolicited advertising or invite links. Sharing your own content is fine in the right channel; anything promotional needs staff approval first.',
      "No doxxing, impersonation of staff/members/public figures, or sharing someone's private information without consent.",
      'Keep public channels in English so everyone can follow along.',
    ],
  },
  {
    title: 'Usernames & Profiles',
    color: 0x57f287,
    rules: [
      'No offensive, NSFW, or hard-to-read usernames/nicknames.',
      'Impersonating staff (names, roles, or profile pictures) is not allowed.',
    ],
  },
  {
    title: 'Channel-Specific Rules',
    color: 0xfee75c,
    rules: [
      '**#self-roles** — pick the roles that apply to you. Misusing self-roles (e.g. faking a Contributor role) results in a removal and warning.',
      "**#bugs** — one bug per post. Tag correctly (Status, Platform, Severity) and follow the pinned bug report guidelines. Don't necro-bump old threads.",
      "**#support-chat / #create-ticket** — use tickets for anything personal or account-specific. Don't open multiple tickets for the same issue.",
      '**#general / #smalltalk / #memes** — keep it on-topic per channel. Off-topic spam gets redirected or removed.',
      '**Voice channels** — no soundboard spam, no ear-rape/loud noises, no recording others without consent.',
    ],
  },
  {
    title: 'Staff & Moderation',
    color: 0xe67e22,
    rules: [
      'Founder, Admin, Moderator, Event Manager, and Helper are here to enforce these rules. Their decisions are final.',
      'Do not argue with moderation actions in public channels — open a ticket if you want to appeal.',
      "Do not ping staff roles unless it's urgent (rule violations, technical emergencies).",
    ],
  },
  {
    title: 'Contributor & Team Channels',
    color: 0x9b59b6,
    rules: [
      'Access to Contributors/Team/High Team channels is a privilege tied to your role. Sharing information from these channels outside the server (leaks, screenshots) results in immediate role removal and a ban, regardless of intent.',
      'Unreleased content (builds, art, marketing plans) discussed in private channels stays private until officially announced.',
    ],
  },
  {
    title: 'Enforcement',
    color: 0xed4245,
    body: [
      'Violations are handled case by case depending on severity and history:',
      '- Warning',
      '- Timeout / mute',
      '- Kick',
      '- Ban',
      '',
      '**Severe violations** (doxxing, leaks, NSFW involving minors, raiding, hate speech) result in an **immediate ban**, no warning.',
    ].join('\n'),
  },
  {
    title: 'Legal',
    color: 0x99aab5,
    rules: [
      "You must meet Discord's minimum age requirement (13+) to be here.",
      "This server follows Discord's Terms of Service and Community Guidelines at all times.",
      '**By staying in this server, you agree to follow these rules.**',
    ],
  },
];

function buildHeaderContainer(imageUrl) {
  return new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imageUrl ?? 'attachment://rules.png'),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# Zero Visit Games — Server Rules'),
      new TextDisplayBuilder().setContent(
        'Welcome to the official **Zero Visit Games** Discord server! Please read the following rules carefully.',
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# ZVG Studio | Server Rules'),
    );
}

function buildCategoryContainer(category, index) {
  const body =
    category.body ?? category.rules.map((rule) => `- ${rule}`).join('\n');

  return new ContainerBuilder()
    .setAccentColor(category.color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${index}. ${category.title}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Zero Visit Games | Server Rules'),
    );
}

function buildPayloads(headerImageUrl) {
  const payloads = [
    {
      flags: MessageFlags.IsComponentsV2,
      components: [buildHeaderContainer(headerImageUrl)],
      ...(headerImageUrl ? {} : { files: [HEADER_IMAGE_PATH] }),
    },
  ];

  RULE_CATEGORIES.forEach((category, i) => {
    payloads.push({
      flags: MessageFlags.IsComponentsV2,
      components: [buildCategoryContainer(category, i + 1)],
    });
  });

  return payloads;
}

async function syncRules(client) {
  const channelId = process.env.RULES_CHANNEL_ID || DEFAULT_CHANNEL_ID;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.warn(`[Rules] Channel ${channelId} not found or not a text channel.`);
      return;
    }

    const permissions = channel.permissionsFor(client.user);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      console.warn(`[Rules] Missing permissions in channel #${channel.name}.`);
      return;
    }

    const fetched = await channel.messages.fetch({ limit: 100 });
    const existing = [...fetched.values()]
      .filter((message) => message.author.id === client.user.id)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const expectedCount = 1 + RULE_CATEGORIES.length;
    const headerImageUrl =
      existing.length === expectedCount ? existing[0]?.attachments?.first()?.url ?? null : null;
    const payloads = buildPayloads(headerImageUrl);

    if (existing.length === payloads.length) {
      let updated = 0;
      let skipped = 0;
      for (let i = 0; i < payloads.length; i++) {
        try {
          // Diff-check: skip edit if already identical to avoid rate-limit + timeout spam
          const current = existing[i];
          const isSame = (() => {
            try {
              // Compare components JSON + attachments
              const curComps = JSON.stringify(current.components.map(c => c.toJSON ? c.toJSON() : c));
              const newComps = JSON.stringify(payloads[i].components.map(c => c.toJSON ? c.toJSON() : c));
              if (curComps !== newComps) return false;
              const hasFile = !!payloads[i].files;
              const hasAttach = current.attachments.size > 0;
              if (hasFile && hasAttach) return true;
              if (!hasFile && !hasAttach) return true;
              return false;
            } catch { return false; }
          })();
          if (isSame) {
            skipped++;
            continue;
          }
          // Retry once on timeout
          try {
            await existing[i].edit(payloads[i]);
          } catch (e) {
            if (e.code === 'UND_ERR_CONNECT_TIMEOUT' || e.message?.includes('Timeout')) {
              await new Promise(r => setTimeout(r, 2000));
              await existing[i].edit(payloads[i]);
            } else throw e;
          }
          updated++;
        } catch (error) {
          console.error(`[Rules] Failed to update rule message ${i + 1}:`, error);
        }
      }
      console.log(`[Rules] Synced ${updated} updated, ${skipped} skipped (${payloads.length} total).`);
      if (updated === 0 && skipped === payloads.length) console.log('[Rules] All rule messages already up-to-date.');
      return;
    }

    for (const message of existing) {
      await message.delete().catch(() => null);
    }

    for (const payload of payloads) {
      await channel.send(payload);
    }

    console.log(`[Rules] Posted ${payloads.length} rule message(s).`);
  } catch (error) {
    console.error('[Rules] Failed to sync rules:', error);
  }
}

module.exports = {
  name: 'rules',
  init(client) {
    client.once('clientReady', () => syncRules(client));
  },
};
