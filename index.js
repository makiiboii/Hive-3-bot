const { Client, GatewayIntentBits } = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus 
} = require('@discordjs/voice');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Web server to keep Railway happy
const app = express();
app.get('/', (req, res) => res.send('AFK Bot is alive!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// Error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
});

// Discord client
const OWNER_ID = '451647372628459520'; // replace with your Discord user ID

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// Command: !gising
client.on('messageCreate', async (message) => {
    if (message.content === '!gising') {
        if (message.author.id !== OWNER_ID) {
            return message.reply('❌ Only the bot owner can use this command.');
        }

        const channel = message.member.voice.channel;
        if (!channel) return message.reply('❌ Join a voice channel first!');

        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator
            });

            const player = createAudioPlayer();

            // Check if silence.mp3 exists
            const silencePath = path.join(__dirname, 'silence.mp3');
            if (!fs.existsSync(silencePath)) {
                message.reply('❌ silence.mp3 not found! Place a silent mp3 in the bot folder.');
                return;
            }

            // Function to play silent audio
            const playLoop = () => {
                const resource = createAudioResource(silencePath);
                player.play(resource);
            };

            playLoop(); // Play first time
            connection.subscribe(player);

            // Loop forever
            player.on(AudioPlayerStatus.Idle, playLoop);

            message.reply('✅ Bot joined VC and is staying AFK 24/7');
        } catch (err) {
            console.error('Error joining VC:', err);
            message.reply('❌ Failed to join VC. Check console for errors.');
        }
    }
});

console.log("TOKEN exists?", process.env.TOKEN ? "Yes" : "No");
client.login(process.env.TOKEN);
