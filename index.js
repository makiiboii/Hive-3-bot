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

// Voice channel state — persisted across reconnects
const voiceState = {
    channelId: null,
    guildId: null,
    player: null,
    connection: null,
    isConnected: false,
};

// Silence audio path (validated once at startup)
const silencePath = path.join(__dirname, 'silence.mp3');

// Play the silence loop on the stored player
function playLoop() {
    try {
        const resource = createAudioResource(silencePath);
        voiceState.player.play(resource);
    } catch (err) {
        console.error('❌ Error creating audio resource:', err);
    }
}

// Join the stored voice channel and start playing silence
async function joinAndPlay() {
    const guild = client.guilds.cache.get(voiceState.guildId);
    if (!guild) {
        console.error('❌ Reconnect: guild not found in cache:', voiceState.guildId);
        return false;
    }

    const channel = guild.channels.cache.get(voiceState.channelId);
    if (!channel) {
        console.error('❌ Reconnect: voice channel not found in cache:', voiceState.channelId);
        return false;
    }

    try {
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });

        voiceState.connection = connection;
        connection.subscribe(voiceState.player);
        playLoop();

        console.log(`✅ (Re)joined voice channel: ${channel.name}`);
        return true;
    } catch (err) {
        console.error('❌ Reconnect: failed to join voice channel:', err);
        return false;
    }
}

// Attempt to reconnect to Discord with exponential backoff, then rejoin VC
async function reconnectWithBackoff() {
    const MAX_DELAY_MS = 60_000;
    let attempt = 0;

    while (!voiceState.isConnected) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt), MAX_DELAY_MS);
        console.log(`🔄 Reconnect attempt ${attempt + 1} in ${delayMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));

        try {
            await client.login(process.env.TOKEN);
            // isConnected is set to true inside the 'ready' handler below
        } catch (err) {
            console.error(`❌ Reconnect attempt ${attempt + 1} failed:`, err.message);
        }

        attempt++;
    }
}

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// Fired on every successful login after the first (subsequent reconnects)
client.on('ready', async () => {
    voiceState.isConnected = true;
    console.log('✅ Discord connection (re)established.');

    // Rejoin the voice channel if we were in one before the disconnect
    if (voiceState.channelId && voiceState.guildId) {
        console.log('🔊 Rejoining voice channel after reconnect...');
        await joinAndPlay();
    }
});

// Fired when the WebSocket connection to Discord drops
client.on('shardDisconnect', (event, shardId) => {
    voiceState.isConnected = false;
    console.warn(`⚠️  Shard ${shardId} disconnected (code ${event.code}). Starting reconnect loop...`);

    // Destroy the stale voice connection so it doesn't block rejoining
    if (voiceState.connection) {
        try {
            voiceState.connection.destroy();
        } catch (_) { /* already destroyed */ }
        voiceState.connection = null;
    }

    reconnectWithBackoff();
});

// Command: !joinhive3
client.on('messageCreate', async (message) => {
    if (message.content === '!joinhive3') {
        if (message.author.id !== OWNER_ID) {
            return message.reply('❌ Only the bot owner can use this command.');
        }

        const channel = message.member.voice.channel;
        if (!channel) return message.reply('❌ Join a voice channel first!');

        if (!fs.existsSync(silencePath)) {
            return message.reply('❌ silence.mp3 not found! Place a silent mp3 in the bot folder.');
        }

        try {
            // Tear down any existing connection before creating a new one
            if (voiceState.connection) {
                try { voiceState.connection.destroy(); } catch (_) { /* ignore */ }
            }

            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });

            // Create a fresh player (or reuse if already exists)
            if (!voiceState.player) {
                voiceState.player = createAudioPlayer();
                voiceState.player.on(AudioPlayerStatus.Idle, playLoop);
                voiceState.player.on('error', err => {
                    console.error('❌ Audio player error:', err.message);
                });
            }

            // Persist voice state for reconnect logic
            voiceState.channelId = channel.id;
            voiceState.guildId = channel.guild.id;
            voiceState.connection = connection;
            voiceState.isConnected = true;

            connection.subscribe(voiceState.player);
            playLoop();

            message.reply('✅ Bot joined VC and is staying AFK 24/7');
        } catch (err) {
            console.error('Error joining VC:', err);
            message.reply('❌ Failed to join VC. Check console for errors.');
        }
    }
});

console.log("TOKEN exists?", process.env.TOKEN ? "Yes" : "No");
client.login(process.env.TOKEN);
