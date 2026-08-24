# ZVG System

Discord bot for **Zero Visit Games** — a Roblox studio.

## Features

- **Welcome Cog** — sends a Components V2 welcome message whenever a member joins
- **Rules Cog** — posts the server rules on first start (one message per category). On every restart it only checks whether all rule messages are still present; if some were deleted, the full set is reposted
- **Verification Cog** — users verify their Roblox account with a code in their profile About section. On success the Discord nickname is set to the Roblox username and restored automatically when they rejoin

New cogs are loaded automatically — just drop a `.js` file into `src/cogs/`.

## Structure

```
src/
├── index.js              # Entry point - starts the bot and auto-loads all cogs
└── cogs/
    ├── welcome.js        # Welcome message on member join
    ├── rules.js          # Server rules (edit rule texts here)
    └── verification.js   # Roblox account verification
```

Verification links are stored in `data/verification.json` (gitignored).

## Setup

### 1. Create the Discord bot

1. Open the [Developer Portal](https://discord.com/developers/applications)
2. **New Application** → enter a name
3. Go to **Bot** → **Reset Token** → copy the token
4. On the same page enable **Server Members Intent** under *Privileged Gateway Intents* (required, the bot will not start without it)
5. Invite the bot (replace `YOUR_APPLICATION_ID` from *General Information*):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=277025508352&scope=bot%20applications.commands
```

The bot also needs the **Manage Nicknames** permission in your server for the verification cog to work.

### 2. Environment variables

Copy `.env.example` to `.env` and fill in **every** variable:

```bash
copy .env.example .env
```

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from the Developer Portal (**required**) |
| `WELCOME_CHANNEL_ID` | ID of the channel where welcome messages are posted |
| `RULES_CHANNEL_ID` | ID of the channel where the server rules are posted |
| `VERIFY_CHANNEL_ID` | ID of the channel containing the verification panel |

To get a channel ID: enable Developer Mode in Discord (Settings → Advanced), then right-click a channel → **Copy Channel ID**.

### 3. Run

```bash
npm install
npm start
```

## Hosting (Pterodactyl)

| Variable | Value |
|---|---|
| Git Repo Address | `https://github.com/mistr-kebab/zvg-system` |
| Install Branch | `main` |
| User Uploaded Files | `0` |
| Auto Update | `1` |
| Additional Node packages | `discord.js dotenv` |
| Main file | `src/index.js` |

The `.env` file is not part of the repository — create it once in the panel file manager. It survives redeploys and auto updates.

## License

[MIT](LICENSE)
