require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, ApplicationCommandOptionType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { CronJob } = require('cron');

// Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Configuration
let config = {
  channelId: '',  // Channel ID will be set using a command instead of from .env
  youtubeChannelIds: [], // YouTube channel IDs will be added using commands instead of from .env
  youtubeChannels: {}, // Object for channel IDs and names
  checkInterval: parseInt(process.env.YOUTUBE_CHECK_INTERVAL || '10'),
  notificationMessage: process.env.NOTIFICATION_MESSAGE || '@everyone New video published: **{title}** {url}',
  lastVideoIds: {}
};

// Slash Commands
const commands = [
  {
    name: 'youtube',
    description: 'YouTube Notification Bot commands',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        name: 'add',
        description: 'Add a YouTube channel to follow',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'channel_id',
            description: 'YouTube channel ID',
            type: ApplicationCommandOptionType.String,
            required: true
          }
        ]
      },
      {
        name: 'remove',
        description: 'Remove a followed YouTube channel',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'channel_id',
            description: 'YouTube channel ID',
            type: ApplicationCommandOptionType.String,
            required: true
          }
        ]
      },
      {
        name: 'list',
        description: 'List all followed YouTube channels',
        type: ApplicationCommandOptionType.Subcommand
      },
      {
        name: 'setchannel',
        description: 'Set the notification channel',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'channel',
            description: 'Channel where notifications will be sent',
            type: ApplicationCommandOptionType.Channel,
            required: true
          }
        ]
      },
      {
        name: 'setmessage',
        description: 'Set the notification message template',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'message',
            description: 'Notification message (you can use {title} and {url} placeholders)',
            type: ApplicationCommandOptionType.String,
            required: true
          }
        ]
      },
      {
        name: 'interval',
        description: 'Set the check frequency for new videos',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'minutes',
            description: 'Interval in minutes (minimum 1)',
            type: ApplicationCommandOptionType.Integer,
            required: true,
            min_value: 1
          }
        ]
      },
      {
        name: 'test',
        description: 'Test bot features',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'type',
            description: 'Feature to test',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
              { name: 'Notification Channel', value: 'channel' },
              { name: 'YouTube API Connection', value: 'api' },
              { name: 'Notification Message', value: 'message' },
              { name: 'All Settings', value: 'all' },
              { name: 'YouTube Channel', value: 'channel_test' }
            ]
          },
          {
            name: 'channel_id',
            description: 'YouTube channel ID to test (only needed for channel test)',
            type: ApplicationCommandOptionType.String,
            required: false
          }
        ]
      },
      {
        name: 'removechannel',
        description: 'Remove the notification channel',
        type: ApplicationCommandOptionType.Subcommand
      }
    ]
  }
];

// Load config from file if exists
const CONFIG_PATH = path.join(__dirname, 'config.json');
try {
  if (fs.existsSync(CONFIG_PATH)) {
    const savedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    config = { ...config, ...savedConfig };
    console.log('📁 Configuration file loaded.');
    
    // Display configuration information
    if (config.channelId) {
      console.log(`📢 Notification channel: ${config.channelId}`);
    }
    
    if (config.youtubeChannelIds && config.youtubeChannelIds.length > 0) {
      console.log(`📋 Number of followed channels: ${config.youtubeChannelIds.length}`);
      config.youtubeChannelIds.forEach(id => {
        const name = config.youtubeChannels[id] || 'Unknown Channel';
        console.log(`  • ${name} (${id})`);
      });
    }
  } else {
    console.log('📁 Configuration file not found. Creating a new file.');
    saveConfig();
  }
} catch (error) {
  console.error('❌ Error loading configuration:', error);
}

// Save config function
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('💾 Configuration successfully saved.');
  } catch (error) {
    console.error('❌ Error saving configuration:', error);
  }
}

// YouTube API
async function fetchLatestVideos() {
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('❌ YouTube API Key is missing');
    return;
  }

  if (!config.channelId) {
    console.log('⚠️ Notification channel not set yet. Use the /youtube setchannel command to set a channel.');
    return;
  }

  let notificationChannel;
  try {
    notificationChannel = await client.channels.fetch(config.channelId);
    if (!notificationChannel) {
      console.error(`❌ Notification channel not found: ${config.channelId}`);
      return;
    }
    
    // Log more information about the channel
    console.log(`Notification channel: ${notificationChannel.name} (${notificationChannel.id}), Type: ${notificationChannel.type}`);
  } catch (error) {
    console.error(`❌ Cannot access notification channel: ${config.channelId}`, error);
    return;
  }

  if (config.youtubeChannelIds.length === 0) {
    console.log('⚠️ No YouTube channels are being followed. Use the /youtube add command to add a channel.');
    return;
  }

  console.log(`\n🔍 ${new Date().toLocaleString()} | Checking YouTube channels...`);
  
  for (const channelId of config.youtubeChannelIds) {
    if (!channelId) continue;
    
    const channelName = config.youtubeChannels[channelId] || 'Unknown Channel';
    console.log(`\n📺 Checking channel: ${channelName} (${channelId})`);
    
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=1&order=date&type=video&key=${process.env.YOUTUBE_API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error(`YouTube API Error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        const latestVideo = data.items[0];
        const videoId = latestVideo.id.videoId;
        const videoTitle = latestVideo.snippet.title;
        const channelTitle = latestVideo.snippet.channelTitle;
        const publishTime = new Date(latestVideo.snippet.publishTime);
        const now = new Date();
        
        // Save channel name
        if (!config.youtubeChannels[channelId] || config.youtubeChannels[channelId] !== channelTitle) {
          config.youtubeChannels[channelId] = channelTitle;
          saveConfig();
          console.log(`✅ Channel information updated: ${channelTitle}`);
        }
        
        console.log(`📹 Latest video: "${videoTitle}" (${videoId})`);
        console.log(`📅 Publication date: ${publishTime.toLocaleString()}`);
        
        // Check for new video
        if ((now - publishTime) < config.checkInterval * 2 * 60 * 1000) {
          console.log(`⏱️ Video published within the last ${config.checkInterval * 2} minutes`);
          
          if (config.lastVideoIds[channelId] !== videoId) {
            console.log(`🔔 NEW VIDEO FOUND! Sending notification...`);
            
            config.lastVideoIds[channelId] = videoId;
            saveConfig();
            
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const message = config.notificationMessage
              .replace('{title}', videoTitle)
              .replace('{url}', videoUrl);
            
            // Create embed message
            const embed = {
              color: 0xFF0000, // Red color
              title: '🎥 New Video Published!',
              description: message,
              fields: [
                {
                  name: 'Video Title',
                  value: videoTitle,
                  inline: false
                },
                {
                  name: 'Channel',
                  value: channelTitle,
                  inline: true
                },
                {
                  name: 'Publication Date',
                  value: new Date(publishTime).toLocaleString(),
                  inline: true
                }
              ],
              thumbnail: {
                url: latestVideo.snippet.thumbnails.high.url
              },
              url: videoUrl,
              timestamp: new Date()
            };
            
            try {
              // Sending notification attempt
              console.log(`Sending notification: Channel: ${notificationChannel.name}`);
              await notificationChannel.send({ embeds: [embed] })
                .then(() => {
                  console.log(`✅ Notification sent successfully: ${videoTitle}`);
                })
                .catch(error => {
                  console.error(`❌ Error sending notification:`, error);
                });
            } catch (error) {
              console.error(`❌ Critical error sending notification:`, error);
            }
          } else {
            console.log(`ℹ️ Notification already sent for this video, will not send again.`);
          }
        } else {
          console.log(`ℹ️ No new video found. Latest video published ${Math.floor((now - publishTime) / (60 * 1000))} minutes ago.`);
        }
      } else {
        console.log(`⚠️ No video found for this channel.`);
      }
    } catch (error) {
      console.error(`❌ Error: ${channelName} (${channelId}) when fetching videos:`, error);
    }
  }
  
  console.log(`\n✅ Check completed. Next check will be in ${config.checkInterval} minutes.`);
}

// Register slash commands
async function registerCommands() {
  try {
    console.log('🔄 Loading commands...');
    console.log(`🤖 Bot ID: ${client.user.id}`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    // Only register commands for specific servers (will be updated immediately)
    if (client.guilds.cache.size > 0) {
      for (const guild of client.guilds.cache.values()) {
        console.log(`📝 Commands being registered: ${guild.name} (${guild.id})`);
        try {
          // Register guild-specific commands (will be updated immediately)
          const guildResult = await rest.put(
            Routes.applicationGuildCommands(client.user.id, guild.id),
            { body: commands }
          );
          console.log(`✅ Commands registered successfully: ${guild.name}`);
        } catch (guildError) {
          console.error(`❌ Error registering commands for ${guild.name}:`, guildError);
        }
      }
    } else {
      console.log('⚠️ Bot is not in any servers yet.');
    }
    
    console.log('✅ Command registration process completed');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}

// Delete global commands
async function deleteGlobalCommands() {
  try {
    console.log('🗑️ Deleting global commands...');
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [] }
    );
    console.log('✅ All global commands deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting global commands:', error);
  }
}

// Command handler
async function handleSlashCommand(interaction) {
  if (!interaction.isCommand()) return;
  
  // Support both old and new command names
  if (interaction.commandName === 'youtube' || interaction.commandName === 'ytnotifier') {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'add': {
        const channelToAdd = interaction.options.getString('channel_id');
        
        if (!config.youtubeChannelIds.includes(channelToAdd)) {
          try {
            // Fetch channel information
            const response = await fetch(
              `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelToAdd}&key=${process.env.YOUTUBE_API_KEY}`
            );
            
            if (!response.ok) {
              throw new Error(`YouTube API Error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
              const channelTitle = data.items[0].snippet.title;
              
              config.youtubeChannelIds.push(channelToAdd);
              config.youtubeChannels[channelToAdd] = channelTitle;
              config.lastVideoIds[channelToAdd] = '';
              saveConfig();
              
              const embed = {
                color: 0x00FF00,
                title: '✅ YouTube Channel Added',
                description: `Channel: ${channelTitle}\nID: ${channelToAdd}`,
                timestamp: new Date()
              };
              
              await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
              const embed = {
                color: 0xFF0000,
                title: '❌ Error',
                description: 'Invalid YouTube Channel ID. Please ensure you entered a valid channel ID.',
                timestamp: new Date()
              };
              await interaction.reply({ embeds: [embed], ephemeral: true });
            }
          } catch (error) {
            console.error('Error adding channel:', error);
            const embed = {
              color: 0xFF0000,
              title: '❌ Error',
              description: `Error adding channel: ${error.message}`,
              timestamp: new Date()
            };
            await interaction.reply({ embeds: [embed], ephemeral: true });
          }
        } else {
          const embed = {
            color: 0xFFA500,
            title: '⚠️ Warning',
            description: 'This channel is already in the following list.',
            timestamp: new Date()
          };
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        break;
      }
      
      case 'remove': {
        const channelToRemove = interaction.options.getString('channel_id');
        
        const index = config.youtubeChannelIds.indexOf(channelToRemove);
        if (index !== -1) {
          const channelName = config.youtubeChannels[channelToRemove] || 'Unknown Channel';
          
          config.youtubeChannelIds.splice(index, 1);
          delete config.lastVideoIds[channelToRemove];
          delete config.youtubeChannels[channelToRemove];
          saveConfig();
          
          const embed = {
            color: 0x00FF00,
            title: '✅ YouTube Channel Removed',
            description: `Channel: ${channelName}\nID: ${channelToRemove}`,
            timestamp: new Date()
          };
          
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
          const embed = {
            color: 0xFFA500,
            title: '⚠️ Warning',
            description: 'This channel is not in the following list.',
            timestamp: new Date()
          };
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        break;
      }
      
      case 'list': {
        if (config.youtubeChannelIds.length === 0) {
          const embed = {
            color: 0xFFA500,
            title: '📋 Following Channels',
            description: 'No channels are being followed.',
            timestamp: new Date()
          };
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
        
        // Create channel list
        const channelList = config.youtubeChannelIds.map(id => {
          const name = config.youtubeChannels[id] || 'Unknown Channel';
          return `**${name}** (${id})`;
        }).join('\n');
        
        const embed = {
          color: 0x00FF00,
          title: '📋 Following Channels',
          description: channelList,
          timestamp: new Date()
        };
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
      
      case 'setchannel': {
        const channel = interaction.options.getChannel('channel');
        
        if (!channel) {
          const embed = {
            color: 0xFF0000,
            title: '❌ Error',
            description: 'Please select a channel.',
            timestamp: new Date()
          };
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
        
        // Log more information about the channel
        console.log(`Selected channel details: 
        - Name: ${channel.name}
        - ID: ${channel.id}
        - Type: ${channel.type}
        - All properties: ${Object.keys(channel).join(', ')}
        `);
        
        // We don't do any type checking here
        // We accept any channel the user selects
        
        // Save channel to configuration
        config.channelId = channel.id;
        saveConfig();
        
        const embed = {
          color: 0x00FF00,
          title: '✅ Notification Channel Set',
          description: `Notifications will now be sent to <#${channel.id}> channel.`,
          timestamp: new Date()
        };
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
      
      case 'setmessage': {
        const newMessage = interaction.options.getString('message');
        
        config.notificationMessage = newMessage;
        saveConfig();
        
        const embed = {
          color: 0x00FF00,
          title: '✅ Notification Message Set',
          description: `New message template:\n${newMessage}`,
          timestamp: new Date()
        };
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
      
      case 'interval': {
        const newInterval = interaction.options.getInteger('minutes');
        
        config.checkInterval = newInterval;
        saveConfig();
        
        // Update cron job
        if (checkJob) {
          checkJob.stop();
        }
        checkJob = new CronJob(`*/${config.checkInterval} * * * *`, fetchLatestVideos);
        checkJob.start();
        
        const embed = {
          color: 0x00FF00,
          title: '✅ Check Interval Updated',
          description: `New check interval: ${newInterval} minutes`,
          timestamp: new Date()
        };
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
      
      case 'test': {
        const testType = interaction.options.getString('type');
        
        switch (testType) {
          case 'channel': {
            if (!config.channelId) {
              const embed = {
                color: 0xFF0000,
                title: '❌ Error',
                description: 'Notification channel not set! Use the /youtube setchannel command to set a channel.',
                timestamp: new Date()
              };
              await interaction.reply({ embeds: [embed], ephemeral: true });
              return;
            }
            
            const channel = client.channels.cache.get(config.channelId);
            if (!channel) {
              const embed = {
                color: 0xFF0000,
                title: '❌ Error',
                description: 'Notification channel not found! Please check the channel ID.',
                timestamp: new Date()
              };
              await interaction.reply({ embeds: [embed], ephemeral: true });
              return;
            }
            
            try {
              const testEmbed = {
                color: 0x00FF00,
                title: '🔄 Test Message',
                description: 'Notification channel set successfully!',
                timestamp: new Date()
              };
              
              await channel.send({ embeds: [testEmbed] });
              
              const successEmbed = {
                color: 0x00FF00,
                title: '✅ Success',
                description: 'Notification channel test successful!',
                timestamp: new Date()
              };
              
              await interaction.reply({ embeds: [successEmbed], ephemeral: true });
            } catch (error) {
              const errorEmbed = {
                color: 0xFF0000,
                title: '❌ Error',
                description: 'Notification channel message not sent! Please ensure the bot has permission to send messages to the channel.',
                timestamp: new Date()
              };
              await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            break;
          }
          
          case 'api': {
            if (!process.env.YOUTUBE_API_KEY) {
              const embed = {
                color: 0xFF0000,
                title: '❌ Error',
                description: 'YouTube API key not found! Please check the .env file.',
                timestamp: new Date()
              };
              await interaction.reply({ embeds: [embed], ephemeral: true });
              return;
            }
            
            try {
              const response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&type=video&key=${process.env.YOUTUBE_API_KEY}`
              );
              
              if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
              }
              
              const embed = {
                color: 0x00FF00,
                title: '✅ Success',
                description: 'YouTube API connection successful!',
                timestamp: new Date()
              };
              
              await interaction.reply({ embeds: [embed], ephemeral: true });
            } catch (error) {
              const embed = {
                color: 0xFF0000,
                title: '❌ Error',
                description: `YouTube API connection failed: ${error.message}`,
                timestamp: new Date()
              };
              await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            break;
          }
          
          case 'message': {
            if (!config.notificationMessage) {
              const embed = {
                color: 0xFF0000,
                title: '❌ Error',
                description: 'Notification message not set!',
                timestamp: new Date()
              };
              await interaction.reply({ embeds: [embed], ephemeral: true });
              return;
            }
            
            const testMessage = config.notificationMessage
              .replace('{title}', 'Test Video Title')
              .replace('{url}', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
            
            const embed = {
              color: 0x00FF00,
              title: '📝 Test Notification Message',
              description: testMessage,
              timestamp: new Date()
            };
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            break;
          }
          
          case 'channel_test': {
            const channelId = interaction.options.getString('channel_id');
            
            if (!channelId) {
              const embed = {
                color: 0xFF0000,
                title: '❌ Error',
                description: "YouTube channel ID not specified. Please enter the ID of the channel you want to test.",
                timestamp: new Date()
              };
              await interaction.reply({ embeds: [embed], ephemeral: true });
              return;
            }
            
            if (!process.env.YOUTUBE_API_KEY) {
              const embed = {
                color: 0xFF0000,
                title: '❌ Error',
                description: 'YouTube API key not found! Please check the .env file.',
                timestamp: new Date()
              };
              await interaction.reply({ embeds: [embed], ephemeral: true });
              return;
            }
            
            await interaction.deferReply({ ephemeral: true });
            
            try {
              // First fetch channel information
              const channelResponse = await fetch(
                `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${process.env.YOUTUBE_API_KEY}`
              );
              
              if (!channelResponse.ok) {
                throw new Error(`YouTube API Error: ${channelResponse.status} ${channelResponse.statusText}`);
              }
              
              const channelData = await channelResponse.json();
              
              if (!channelData.items || channelData.items.length === 0) {
                const embed = {
                  color: 0xFF0000,
                  title: '❌ Error',
                  description: 'No YouTube channel found with the specified ID. Please enter a valid channel ID.',
                  timestamp: new Date()
                };
                await interaction.editReply({ embeds: [embed] });
                return;
              }
              
              const channelTitle = channelData.items[0].snippet.title;
              const channelThumbnail = channelData.items[0].snippet.thumbnails.default.url;
              
              // Now fetch latest video
              const videoResponse = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=1&order=date&type=video&key=${process.env.YOUTUBE_API_KEY}`
              );
              
              if (!videoResponse.ok) {
                throw new Error(`YouTube API Error: ${videoResponse.status} ${videoResponse.statusText}`);
              }
              
              const videoData = await videoResponse.json();
              
              if (!videoData.items || videoData.items.length === 0) {
                const embed = {
                  color: 0xFFA500,
                  title: '⚠️ Result Not Found',
                  description: `**${channelTitle}** channel has no published video.`,
                  thumbnail: {
                    url: channelThumbnail
                  },
                  timestamp: new Date()
                };
                await interaction.editReply({ embeds: [embed] });
                return;
              }
              
              const latestVideo = videoData.items[0];
              const videoId = latestVideo.id.videoId;
              const videoTitle = latestVideo.snippet.title;
              const publishTime = new Date(latestVideo.snippet.publishTime);
              const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
              const thumbnailUrl = latestVideo.snippet.thumbnails.high.url;
              
              // Prepare test notification
              const message = config.notificationMessage
                .replace('{title}', videoTitle)
                .replace('{url}', videoUrl);
              
              // Create embed message
              const embed = {
                color: 0x00FF00,
                title: '✅ YouTube Channel Test Successful',
                description: `Channel **${channelTitle}** test successful.\n\n**Latest Video:**`,
                fields: [
                  {
                    name: 'Video Title',
                    value: videoTitle,
                    inline: false
                  },
                  {
                    name: 'Channel',
                    value: channelTitle,
                    inline: true
                  },
                  {
                    name: 'Publication Date',
                    value: publishTime.toLocaleString(),
                    inline: true
                  },
                  {
                    name: 'Video URL',
                    value: videoUrl,
                    inline: false
                  },
                  {
                    name: 'Notification Message',
                    value: message,
                    inline: false
                  }
                ],
                thumbnail: {
                  url: channelThumbnail
                },
                image: {
                  url: thumbnailUrl
                },
                url: videoUrl,
                timestamp: new Date()
              };
              
              await interaction.editReply({ embeds: [embed] });
              
            } catch (error) {
              console.error('Error testing YouTube channel:', error);
              const embed = {
                color: 0xFF0000,
                title: '❌ Error',
                description: `YouTube channel test failed: ${error.message}`,
                timestamp: new Date()
              };
              await interaction.editReply({ embeds: [embed] });
            }
            break;
          }
          
          case 'all': {
            const results = [];
            
            // Channel test
            if (!config.channelId) {
              results.push('❌ Notification channel not set');
            } else {
              const channel = client.channels.cache.get(config.channelId);
              if (!channel) {
                results.push('❌ Notification channel not found');
              } else {
                try {
                  const testEmbed = {
                    color: 0x00FF00,
                    title: '🔄 Test Message',
                    description: 'Notification channel set successfully!',
                    timestamp: new Date()
                  };
                  await channel.send({ embeds: [testEmbed] });
                  results.push('✅ Notification channel working');
                } catch (error) {
                  results.push('❌ Notification channel message not sent');
                }
              }
            }
            
            // API test
            if (!process.env.YOUTUBE_API_KEY) {
              results.push('❌ YouTube API key not found');
            } else {
              try {
                const response = await fetch(
                  `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&type=video&key=${process.env.YOUTUBE_API_KEY}`
                );
                
                if (!response.ok) {
                  throw new Error(`API Error: ${response.status}`);
                }
                
                results.push('✅ YouTube API connection working');
              } catch (error) {
                results.push(`❌ YouTube API connection failed: ${error.message}`);
              }
            }
            
            // Message test
            if (!config.notificationMessage) {
              results.push('❌ Notification message not set');
            } else {
              results.push('✅ Notification message set');
            }
            
            // Following channels
            const channelCount = config.youtubeChannelIds.length;
            if (channelCount > 0) {
              results.push(`📊 Following channel count: ${channelCount}`);
              const channelNames = config.youtubeChannelIds.map(id => 
                config.youtubeChannels[id] || 'Unknown Channel'
              );
              results.push(`📌 Channels: ${channelNames.join(', ')}`);
            } else {
              results.push('📊 No following channels yet');
            }
            
            // Check interval
            results.push(`⏱️ Check interval: ${config.checkInterval} minutes`);
            
            const embed = {
              color: 0x00FF00,
              title: '🔍 All Settings Test Results',
              description: results.join('\n'),
              timestamp: new Date()
            };
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            break;
          }
        }
        break;
      }
      
      // Remove channel command
      case 'removechannel': {
        if (!config.channelId) {
          const embed = {
            color: 0xFFA500,
            title: '⚠️ Warning',
            description: 'Notification channel not set yet.',
            timestamp: new Date()
          };
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
        
        const oldChannelId = config.channelId;
        
        // Remove channel from configuration
        config.channelId = '';
        saveConfig();
        
        const embed = {
          color: 0x00FF00,
          title: '✅ Notification Channel Removed',
          description: `<#${oldChannelId}> channel will no longer receive notifications.`,
          timestamp: new Date()
        };
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
    }
  }
}

// Events
client.once('ready', async () => {
  console.log(`\n\n🚀 Bot started: ${client.user.tag}`);
  console.log(`🌐 Bot is currently active in ${client.guilds.cache.size} servers`);
  
  client.guilds.cache.forEach(guild => {
    console.log(`📡 Server: ${guild.name} (${guild.id})`);
  });
  
  // Get missing channel names
  if (config.youtubeChannelIds.length > 0) {
    console.log('\n🔄 Channel information updating...');
    
    for (const channelId of config.youtubeChannelIds) {
      if (!config.youtubeChannels[channelId]) {
        try {
          const response = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${process.env.YOUTUBE_API_KEY}`
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data.items && data.items.length > 0) {
              config.youtubeChannels[channelId] = data.items[0].snippet.title;
              console.log(`✅ Channel information received: ${data.items[0].snippet.title} (${channelId})`);
            } else {
              console.log(`⚠️ Channel not found: ${channelId}`);
            }
          } else {
            console.error(`❌ API error: ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          console.error(`❌ Channel information not received: ${channelId}`, error);
        }
      }
    }
    saveConfig();
  }
  
  // First delete global commands
  await deleteGlobalCommands();
  
  // Then register server commands
  await registerCommands();
  
  // Start checking for new videos
  console.log('\n⏱️ Video check scheduling starting...');
  checkJob = new CronJob(`*/${config.checkInterval} * * * *`, fetchLatestVideos);
  checkJob.start();
  console.log(`✅ YouTube check interval: ${config.checkInterval} minutes`);
  
  // First check
  console.log('🔍 First video check starting...');
  setTimeout(fetchLatestVideos, 2000);
});

client.on('interactionCreate', handleSlashCommand);

// Initialize and start the bot
let checkJob;
client.login(process.env.DISCORD_TOKEN)
  .catch(error => {
    console.error('Bot login failed:', error);
  }); 