const { Client, GatewayIntentBits } = require('discord.js');
const { OpenAI } = require("openai");
const admin = require('firebase-admin');
const express = require('express');
require("dotenv").config();

// OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Discord Client
const client = new Client({
  intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Firebase DB Setup
const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICEACCOUNT, 'base64').toString('ascii'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const getOpenAiThreadId = async (discordThreadId) => {
    const docRef = db.collection('threads').doc(discordThreadId);
    const doc = await docRef.get();
    if (doc.exists) {
        return doc.data().openAiThreadId;
    } else {
        return null;
    }
}

const addThreadToMap = async (discordThreadId, openAiThreadId) => {
    const docRef = db.collection('threads').doc(discordThreadId);
    await docRef.set({ openAiThreadId });
}

const terminalStates = ["cancelled", "failed", "completed", "expired"];
const statusCheckLoop = async (openAiThreadId, runId) => {
    const run = await openai.beta.threads.runs.retrieve(
        openAiThreadId,
        runId
    );

    if(terminalStates.indexOf(run.status) < 0){
        await sleep(1000);
        return statusCheckLoop(openAiThreadId, runId);
    }
    return run.status;
}

const addMessage = (threadId, content) => {
    return openai.beta.threads.messages.create(
        threadId,
        { role: "user", content }
    )
}

const isRunActive = async (openAiThreadId) => {
    try {
        const runs = await openai.beta.threads.runs.list(openAiThreadId);
        return runs.data.some(run => terminalStates.indexOf(run.status) < 0);
    } catch (error) {
        console.error('Error checking run status:', error);
        return false;
    }
}

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content || message.content === '') return; //Ignore bot messages
    // Check if the bot is mentioned
    const botMentioned = message.mentions.users.has(client.user.id);

    // Check if the message is a reply and if it is in reply to the bot's message
    let isReplyToBot = false;
    if (message.reference) {
        const repliedToMessage = await message.channel.messages.fetch(message.reference.messageId);
        isReplyToBot = repliedToMessage.author.bot;
    }
    if (botMentioned || isReplyToBot) {
      // console.log(message);
      const discordThreadId = message.channel.id;
      let openAiThreadId = await getOpenAiThreadId(discordThreadId);

      let messagesLoaded = false;
      if(!openAiThreadId){
          const thread = await openai.beta.threads.create();
          openAiThreadId = thread.id;
          await addThreadToMap(discordThreadId, openAiThreadId);
          if(message.channel.isThread()){
              //Gather all thread messages to fill out the OpenAI thread since we haven't seen this one yet
              const starterMsg = await message.channel.fetchStarterMessage();
              const otherMessagesRaw = await message.channel.messages.fetch();

              const otherMessages = Array.from(otherMessagesRaw.values())
                  .map(msg => msg.content)
                  .reverse(); //oldest first

              const messages = [starterMsg.content, ...otherMessages]
                  .filter(msg => !!msg && msg !== '')

              // console.log(messages);
              await Promise.all(messages.map(msg => addMessage(openAiThreadId, msg)));
              messagesLoaded = true;
          }
      }

      if(!messagesLoaded) {
          const runActive = await isRunActive(openAiThreadId);
          if (!runActive) {
            try {
              await addMessage(openAiThreadId, message.content);

              const run = await openai.beta.threads.runs.create(
                  openAiThreadId,
                  { assistant_id: process.env.ASSISTANT_ID }
              )
              const status = await statusCheckLoop(openAiThreadId, run.id);

              const messages = await openai.beta.threads.messages.list(openAiThreadId);
              let response = messages.data[0].content[0].text.value;
              response = response.substring(0, 1999) //Discord msg length limit

              console.log(response);
              
              // Sending the reply and handling the response
              const sentMessage = await message.reply(response);
              console.log('Reply sent successfully:', sentMessage.content);
            } catch (error) {
              console.error('Error:', error);
            }
          } else {
              // Handle the case where a run is active - possibly queue the message or respond appropriately
              console.log('A run is currently active. Message will be queued or handled later.');
          }
      }
    }
});

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord bot is running and healthy');
});

app.listen(port, () => {
  console.log(`HTTP server is listening on port ${port}`);
});

console.log('Starting bot...', process.env.DISCORD_TOKEN);
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Logged in successfully.'))
  .catch(error => console.error('Error on login:', error));

// When discord bot has started up
client.once('ready', () => {
  console.log('Bot is ready!');
});

client.on('error', console.error);
