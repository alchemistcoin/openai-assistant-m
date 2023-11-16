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

client.on('guildCreate', guild => {
  // Code to send a message when the bot joins a new guild
  // ...
});

// Use this function to create a new session or return existing one based on your application logic.
// Placeholder for initiating an OpenAI Chat session.
async function initiateOpenAiSession(modelId, userMessage, discordThreadId) {
  // Placeholder for generating a unique session ID. Replace with actual OpenAI chat session initialization if necessary.
  // For actual chat sessions, you might need to store an ongoing conversation state in Firestore.
  // Currently, this is a simplified example that generates a unique ID for each message.
  return `session_${discordThreadId}_${Date.now()}`;
}

// Update the messageCreate event handling
client.on('messageCreate', async message => {
    // Ignore messages from all bots, including itself
  if (message.author.bot) return;
  // ... existing checks for bot message and empty content ...

  try {
    // Remove or comment out the following lines that are no longer necessary:
    // const thread = await openai.createChat();
    // await openai.addMessageToThread(threadId, { role: "user", content: message.content });
    // const messages = await openai.listMessagesInThread(threadId);
    
    // Call the new initiateOpenAiSession function and handle the OpenAI conversation
    const discordThreadId = message.channel.id;
    const sessionID = await initiateOpenAiSession(MODEL_ID, message.content, discordThreadId);
    
    // Now send the message to OpenAI API and await the response
    const openaiResponse = await openai.createCompletion({
      model: gpt-4-1106-preview,
      prompt: message.content, // Ensure to include the context if needed
      // ... other params ...
    });
    
    // Reply to the Discord message with the OpenAI response
    // Ensure to check the structure of openaiResponse to extract the actual message
    const responseText = openaiResponse.data.choices[0].text;
    await message.reply(responseText);

 } catch (error) {
  console.error('An error occurred:', error);
  // Optionally, you can also log the stack trace if it exists
  if (error.stack) console.error(error.stack);

  // Send a reply to the Discord channel to notify of the encountered error
  await message.reply('I encountered an error while processing your request.');
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
