const { Client, GatewayIntentBits } = require('discord.js');
const { OpenAI } = require("openai");
const admin = require('firebase-admin');
const express = require('express');
const MODEL_ID = "gpt-4-1106-preview";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICEACCOUNT, 'base64').toString('ascii'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

client.once('ready', () => {
  console.log('Bot is ready!');
});

client.on('guildCreate', (guild) => {
  // Code for new guild
});

async function initiateOpenAiSession(modelId, userMessage, discordThreadId) {
  return `session${discordThreadId}_${Date.now()}`;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  try {
    const discordThreadId = message.channel.id;
    const sessionID = await initiateOpenAiSession("MODEL_ID", message.content, discordThreadId);

    const openaiResponse = await openai.createCompletion({
      model: "gpt-4-1106-preview",
      prompt: message.content,
      // other params
    });

    const responseText = openaiResponse.data.choices[0].text;
    await message.reply(responseText);
  } catch (error) {
    console.error('An error occurred:', error);
    if (error.stack) console.error(error.stack);
    await message.reply('I encountered an error while processing your request.');
  }
});

client.login(process.env.DISCORD_TOKEN);

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord bot is running and healthy');
});

app.listen(port, () => {
  console.log(`HTTP server is listening on port ${port}`);
});
