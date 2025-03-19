require('dotenv').config();
const fetch = require('node-fetch');

// Usage check
if (process.argv.length < 3) {
  console.log('Usage: node get_channel_id.js <channel-username-or-custom-url>');
  console.log('Example: node get_channel_id.js @ExampleChannel');
  process.exit(1);
}

const channelName = process.argv[2];

// Function to get channel ID
async function getChannelId() {
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('Error: YOUTUBE_API_KEY is not set in .env file');
    process.exit(1);
  }

  try {
    // Remove @ if present
    const formattedChannelName = channelName.startsWith('@') 
      ? channelName.substring(1) 
      : channelName;
    
    // Try searching for the channel
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(formattedChannelName)}&type=channel&key=${process.env.YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`YouTube API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      console.log('\nPotential matching channels:');
      data.items.forEach((item, index) => {
        console.log(`${index + 1}. Channel name: ${item.snippet.title}`);
        console.log(`   Channel ID: ${item.snippet.channelId}`);
        console.log(`   Description: ${item.snippet.description}`);
        console.log('---');
      });
      
      console.log('\nTo use these channels with the bot, use the command:');
      console.log(`/youtube add <CHANNEL_ID>`);
    } else {
      console.log('No channels found with that username. Try with a different query.');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Execute
getChannelId(); 