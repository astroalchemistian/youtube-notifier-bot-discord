# YouTube Notification Discord Bot

Discord bot that sends notifications to a configured channel when new YouTube videos are published.

## Setup

1. Clone this repository
2. Run `npm install` to install dependencies
3. Create a Discord bot and get the token:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to the "Bot" tab and create a bot
   - Copy the token and paste it in the `.env` file
   - Enable the "Message Content Intent" under Privileged Gateway Intents
   - In the OAuth2 URL Generator, select scopes: `bot` and `applications.commands`
   - For bot permissions, select: `Send Messages`, `Embed Links`, and `Use Slash Commands`
   - Use the generated URL to invite the bot to your server
4. Get a YouTube API Key:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project
   - Enable the YouTube Data API v3
   - Create an API key and paste it in the `.env` file
5. Configure the `.env` file with your settings:
   - `DISCORD_CHANNEL_ID`: The channel ID where notifications will be sent
   - `YOUTUBE_CHANNEL_IDS`: YouTube channel IDs to monitor (comma separated)
   - `YOUTUBE_CHECK_INTERVAL`: How often to check for new videos (in minutes)
   - `NOTIFICATION_MESSAGE`: The message template for notifications
6. Run the bot with `npm start`

## Slash Commands

The bot uses the following slash commands:

### Main Commands
- `/youtube add [channel_id]` - Add a YouTube channel to follow
- `/youtube remove [channel_id]` - Remove a followed YouTube channel
- `/youtube list` - List all followed YouTube channels
- `/youtube setchannel [channel]` - Set the current channel for notifications
- `/youtube setmessage [message]` - Set the notification message template
- `/youtube interval [minutes]` - Set the check frequency for new videos
- `/youtube removechannel` - Remove the notification channel

### Test Commands
- `/youtube test [type]` - Test bot features
  - `Notification Channel`: Checks if the notification channel is correctly set
  - `YouTube API Connection`: Tests the YouTube API connection
  - `Notification Message`: Shows a preview of the notification message template
  - `All Settings`: Comprehensively tests all bot settings and connections
  - `YouTube Channel`: Tests a specific YouTube channel

## How to Find YouTube Channel ID

To find a YouTube channel ID:

1. Run the command `node get_channel_id.js @ChannelName`, or
2. Go to the YouTube channel, the part after `/channel/` in the URL is the channel ID. 