const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const cors = require('cors'); // Import cors
const lastMessages = new Map(); // Stores { chatId: { messageId, text, imageUrl } }

const BOT_TOKEN = process.env.BOT_TOKEN;
//const BOT_TOKEN = '7521980411:AAGSn9KTZ38pBfo_Shp_DnQpt5vrA0rr5AY';

// Use polling (easiest for testing, works without a public server)
//const bot = new TelegramBot(BOT_TOKEN);
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 🔹 Store chat IDs and message IDs (in-memory for now; replace with a database for persistence)
const userChatIds = new Set();
const sentMessageIds = new Map(); // New map to track sent message IDs for each user

// 🔹 On /start, get user ID and send welcome
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;

    console.log(`New user started bot: ${username || 'Unknown'} (Chat ID: ${chatId})`);

    // ✅ Save chatId to the in-memory set
    userChatIds.add(chatId);

    // ✅ Send welcome image with button to open mini app
    await bot.sendPhoto(chatId, 'https://i.ibb.co/7tjtqYjQ/file-1736.jpg', {
        caption: `👋 Hello @${username || 'friend'}!\nWelcome to Paxyo.\nClick below to open the app.`,
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: '🦾 Open App',
                        web_app: {
                            url: 'https://paxyo.netlify.app/'
                        }
                    }
                ]
            ]
        }
    });
});


// 🔹 Function to send a message with optional image
const sendTelegramMessage = async (chatId, text, imageUrl) => {
    try {
        if (imageUrl) {
            const response = await bot.sendPhoto(chatId, imageUrl, { caption: text });
            console.log(`Photo sent to chat ID ${chatId}:`, response);
            return response.message_id; // Return the message ID
        } else {
            const response = await bot.sendMessage(chatId, text);
            console.log(`Message sent to chat ID ${chatId}:`, response);
            return response.message_id; // Return the message ID
        }
    } catch (error) {
        console.error(`Error sending message to chat ID ${chatId}:`, error.response?.data || error.message);
        throw error;
    }
};

// 🔹 Function to broadcast a message to all users
const broadcastMessage = async (text, imageUrl) => {
    console.log(`Broadcasting message: "${text}" to ${userChatIds.size} users`);

    for (const chatId of userChatIds) {
        console.log(`Attempting to send message to chat ID: ${chatId}`);

        try {
            const messageId = await sendTelegramMessage(chatId, text, imageUrl);
            sentMessageIds.set(chatId, messageId);
            lastMessages.set(chatId, { messageId, text, imageUrl }); // Save full context
            // Store the message ID for this user
            console.log(`Message sent successfully to chat ID: ${chatId}`);
        } catch (error) {
            console.error(`Failed to send message to ${chatId}:`, error.response?.data || error.message);
        }
    }
};

// 🔹 Function to delete all broadcast messages for all users
const deleteAllBroadcastMessages = async () => {
    console.log(`Deleting all broadcasted messages for ${sentMessageIds.size} users`);

    for (const [chatId, messageId] of sentMessageIds) {
        try {
            await bot.deleteMessage(chatId, messageId);
            console.log(`Message with ID ${messageId} deleted for chat ID: ${chatId}`);
        } catch (error) {
            console.error(`Failed to delete message for chat ID ${chatId}:`, error.response?.data || error.message);
        }
    }
};


// 🔹 Express server setup
const app = express();
app.use(cors()); // Enable CORS
app.use(express.json());

// Endpoint to broadcast messages (text + image)
app.post('/api/broadcast', async (req, res) => {
    const { message, imageUrl } = req.body;

    if (!message) {
        return res.status(400).send('Message is required');
    }

    try {
        await broadcastMessage(message, imageUrl);
        res.send('Message broadcasted successfully');
    } catch (error) {
        console.error('Failed to broadcast message:', error.message);
        res.status(500).send('Failed to broadcast message');
    }
});

// Endpoint to broadcast only image
app.post('/api/broadcastImage', async (req, res) => {
    const { imageUrl } = req.body;

    if (!imageUrl) {
        return res.status(400).send('Image URL is required');
    }

    try {
        await broadcastMessage('', imageUrl); // Send only the image
        res.send('Image broadcasted successfully');
    } catch (error) {
        console.error('Failed to broadcast image:', error.message);
        res.status(500).send('Failed to broadcast image');
    }
});

// Endpoint to send a message to a specific user
app.post('/api/sendToUser', async (req, res) => {
    const { chatId, message, imageUrl } = req.body;
    if (!chatId || !message) {
        return res.status(400).send('Chat ID and message are required');
    }
    try {
        const messageId = await sendTelegramMessage(chatId, message, imageUrl);
        res.send({ messageId }); // Return the message ID
    } catch (error) {
        console.error(`Failed to send message to user with Chat ID ${chatId}:`, error.message);
        res.status(500).send('Failed to send message to user');
    }
});

// Endpoint to delete a message for all users
app.post('/api/deleteAllMessages', async (req, res) => {
    try {
        await deleteAllBroadcastMessages();
        res.send('All broadcast messages deleted successfully');
    } catch (error) {
        console.error('Failed to delete all messages:', error.message);
        res.status(500).send('Failed to delete all messages');
    }
});

app.post('/api/deleteByContent', async (req, res) => {
    const { message, imageUrl } = req.body;

    if (!message && !imageUrl) {
        return res.status(400).send('Either message text or image URL must be provided');
    }

    let deletedCount = 0;

    for (const [chatId, msgData] of lastMessages) {
        const matchesText = message && msgData.text === message;
        const matchesImage = imageUrl && msgData.imageUrl === imageUrl;

        if (matchesText || matchesImage) {
            try {
                await bot.deleteMessage(chatId, msgData.messageId);
                deletedCount++;
            } catch (err) {
                console.error(`Failed to delete for ${chatId}`, err.message);
            }
        }
    }

    res.send(`Deleted ${deletedCount} matching messages`);
});

// Start the Express server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


const WEBHOOK_URL = 'https://paxyo-bot-ywuk.onrender.com/webhook';

bot.setWebHook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});
