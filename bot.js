const { Client, GatewayIntentBits } = require('discord.js');
const { OpenAI } = require("openai");
const admin = require('firebase-admin');
const express = require('express');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Firebase Admin SDK with the encoded service account JSON
const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('ascii'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore(); // Reference to Firestore database

// Discord Client
const client = new Client({
  intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// When the bot is ready, this event will run once.
client.once('ready', () => {
    console.log('Bot is ready!');
});

// Create a Map to store user thread IDs to avoid creating new threads for existing conversations
const userThreadMap = new Map();

// Function to get thread ID for the user
const getOrCreateThreadIdForUser = async (userId) => {
    if (userThreadMap.has(userId)) {
        return userThreadMap.get(userId);
    } else {
        const thread = await openai.createChat();
        userThreadMap.set(userId, thread.id);
        return thread.id;
    }
};

// This event will run every time a message is received
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.trim()) return; // Ignore bot messages

    try {
        // Get or create a thread ID for this user
        const threadId = await getOrCreateThreadIdForUser(message.author.id);

        // Add the user's message to the thread
        await openai.addMessageToThread(threadId, {
            role: "user",
            content: message.content
        });

        // List messages in the thread to get the assistant's response
        const messages = await openai.listMessagesInThread(threadId);

        // Find the latest message from the assistant
        const latestMessageFromAssistant = messages.data.find(msg => msg.role === 'assistant');

        // Reply to the Discord message with the response from OpenAI
        await message.reply(latestMessageFromAssistant.content);

    } catch (error) {
        console.error('Error during message handling:', error);
    }
});

// Authenticate Discord
client.login(process.env.DISCORD_TOKEN);

// Start minimal Express HTTP server for Render.com health checks
const app = express();
const port = process.env.PORT || 3000;  // Render provides PORT env variable

app.get('/', (req, res) => {
  res.send('Discord bot is running and healthy'); // Simple response for health checks
});

app.listen(port, () => {
  console.log(`HTTP server is listening on port ${port}`);
});
