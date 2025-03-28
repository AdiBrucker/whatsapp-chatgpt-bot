require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const mongoose = require('mongoose');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// Define Conversation schema
const messageSchema = new mongoose.Schema({
  role: String,
  content: String
});

const conversationSchema = new mongoose.Schema({
  user: String,
  messages: [messageSchema],
  updatedAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.model('Conversation', conversationSchema);

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.post('/webhook', async (req, res) => {
  const incomingMsg = req.body.Body;
  const from = req.body.From;

  console.log(`Received from ${from}: ${incomingMsg}`);

  try {
    let convo = await Conversation.findOne({ user: from });
    if (!convo) {
      convo = new Conversation({ user: from, messages: [] });
    }

    // Add user's message to conversation
    convo.messages.push({ role: 'user', content: incomingMsg });

    const context = convo.messages.slice(-10); // last 10 messages only

    const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'אתה קאוצ׳ר אישי שמתמחה בתזונה, בריאות וכושר, ונותן תשובות מעודדות, מועילות ומבוססות.' },
        ...context
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const reply = openaiRes.data.choices[0].message.content;

    // Add assistant's reply to conversation
    convo.messages.push({ role: 'assistant', content: reply });
    await convo.save();

    await client.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: from,
      body: reply
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('Error handling message:', err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
