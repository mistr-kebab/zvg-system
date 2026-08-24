# ZVG System

Discord bot for ZVG Studio (Roblox).

## Structure

```
src/
├── index.js              # Entry point - starts the bot
└── cogs/
    ├── welcome.js        # Welcome message when a member joins
    ├── rules.js          # Posts the server rules (one message per category)
    └── verification.js   # Roblox account verification via profile code
```

## Features

- **Welcome Cog**: Sends a Components V2 welcome message to the configured channel whenever someone joins.
- **Rules Cog**: Posts the server rules on first start (one message per category). On every restart it only checks whether all messages are still present - if some were deleted, the full set is reposted. Edit the rules directly in `src/cogs/rules.js`.
- **Verification Cog**: Users verify their Roblox account with a code in their profile About section. On success the Discord nickname is set to the Roblox username and restored automatically when they rejoin. Links are stored in `data/verification.json` (gitignored).

## Setup

### 1. Create the Discord bot

1. Open the [Developer Portal](https://discord.com/developers/applications)
2. "New Application" -> enter a name
3. Under "Bot" click "Reset Token" and copy the token
4. Under "Bot" enable **Server Members Intent** (required for the welcome cog!)
5. Invite the bot with this URL (replace `YOUR_APPLICATION_ID`, found under "General Information"):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=277025508352&scope=bot%20applications.commands
```

### 2. Configure

```bash
copy .env.example .env
```

Then fill in the `.env`:

- `DISCORD_TOKEN`: The bot token
- `WELCOME_CHANNEL_ID`: Channel for welcome messages

### 3. Run

```bash
npm install
npm start
```
